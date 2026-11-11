"""Echter Drucker über CUPS (Drucksystem von Linux / Raspberry Pi).

Wir sprechen mit CUPS über IPP, die Standardsprache für Drucker (Internet Printing Protocol),
direkt per HTTP an 127.0.0.1:631 – ohne zusätzliche Python-Pakete.
Der DNP DS620 wird in CUPS mit dem Gutenprint-Treiber eingerichtet (siehe raspberry/drucker_einrichten.sh).

Wichtig für die Regeln der Fotobox:
  - Ein Druckauftrag wird genau einmal übergeben, nie automatisch wiederholt.
  - Der Drucker wird mit «printer-error-policy=abort-job» eingerichtet: Bei einem Druckerfehler bricht
    CUPS den Auftrag ab → «fehlgeschlagen», der Betreiber entscheidet über einen Nachdruck.
  - Wartet ein Auftrag dagegen nur (angehalten, Drucker aus), bleibt er «in Warteschlange», bis das
    Zeitlimit abläuft → «unbekannt». Grund: Ein wartender CUPS-Auftrag kann später doch noch drucken;
    würden wir «fehlgeschlagen» melden, gäbe es mit dem Nachdruck womöglich zwei Karten.

Stand 2026-11-11: mit automatischen Tests (nachgebildeter IPP-Server) geprüft.
Mit echtem CUPS und echtem DS620 noch NICHT getestet.
"""
from __future__ import annotations

import getpass
import struct
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

from .drucker import DruckFehler, Drucker

# ---------- minimales IPP (RFC 8010 / 8011) ----------
GRUPPE_OPERATION, GRUPPE_JOB, GRUPPE_ENDE = 0x01, 0x02, 0x03
T_INTEGER, T_BOOLEAN, T_ENUM = 0x21, 0x22, 0x23
T_TEXT, T_NAME, T_KEYWORD, T_URI, T_CHARSET, T_SPRACHE, T_MIME = 0x41, 0x42, 0x44, 0x45, 0x47, 0x48, 0x49

OP_PRINT_JOB, OP_GET_JOB, OP_GET_PRINTER = 0x0002, 0x0009, 0x000B

JOB_WARTEND = {3, 4, 5, 6}        # pending, pending-held, processing, processing-stopped
JOB_ABGEBROCHEN = {7, 8}          # canceled, aborted
JOB_FERTIG = 9                    # completed


def _attr(tag: int, name: str, werte) -> bytes:
    if not isinstance(werte, (list, tuple)):
        werte = [werte]
    aus = b""
    for i, w in enumerate(werte):
        if tag in (T_INTEGER, T_ENUM):
            daten = struct.pack(">i", int(w))
        elif tag == T_BOOLEAN:
            daten = b"\x01" if w else b"\x00"
        else:
            daten = str(w).encode("utf-8")
        n = name.encode("utf-8") if i == 0 else b""
        aus += struct.pack(">BH", tag, len(n)) + n + struct.pack(">H", len(daten)) + daten
    return aus


def ipp_anfrage(operation: int, anfrage_id: int, operation_attr: bytes, job_attr: bytes = b"",
                daten: bytes = b"") -> bytes:
    kopf = struct.pack(">BBHI", 2, 0, operation, anfrage_id)
    teile = kopf + bytes([GRUPPE_OPERATION]) + operation_attr
    if job_attr:
        teile += bytes([GRUPPE_JOB]) + job_attr
    return teile + bytes([GRUPPE_ENDE]) + daten


def ipp_antwort_lesen(roh: bytes) -> tuple[int, dict]:
    """Liefert (Statuscode, {attributname: [werte]}) – alle Gruppen zusammengefasst."""
    if len(roh) < 9:
        raise DruckFehler("Ungültige Antwort von CUPS")
    _, _, status, _ = struct.unpack(">BBHI", roh[:8])
    attr: dict[str, list] = {}
    i, name = 8, None
    while i < len(roh):
        tag = roh[i]
        i += 1
        if tag == GRUPPE_ENDE:
            break
        if tag < 0x10:          # neue Gruppe
            continue
        (nlen,) = struct.unpack(">H", roh[i:i + 2]); i += 2
        if nlen:
            name = roh[i:i + nlen].decode("utf-8", "replace")
        i += nlen
        (vlen,) = struct.unpack(">H", roh[i:i + 2]); i += 2
        wert = roh[i:i + vlen]; i += vlen
        if tag in (T_INTEGER, T_ENUM) and vlen == 4:
            w = struct.unpack(">i", wert)[0]
        elif tag == T_BOOLEAN:
            w = wert == b"\x01"
        else:
            w = wert.decode("utf-8", "replace")
        attr.setdefault(name, []).append(w)
    return status, attr


# Gründe aus «printer-state-reasons» → verständlicher Text (Endungen -error/-warning/-report werden entfernt)
GRUENDE = {
    "media-empty": "Papier leer – Rolle wechseln",
    "media-needed": "Papier fehlt",
    "media-jam": "Papierstau",
    "marker-supply-empty": "Farbband leer",
    "marker-supply-low": "Farbband fast leer",
    "media-low": "Papier fast leer",
    "door-open": "Drucker-Klappe offen",
    "cover-open": "Drucker-Deckel offen",
    "offline": "Drucker ausgeschaltet oder Kabel getrennt",
    "paused": "Drucker in CUPS angehalten",
    "connecting-to-device": "Verbinde mit Drucker …",
    "other": "Druckerfehler",
}


def _grund_text(gruende: list[str]) -> list[str]:
    texte = []
    for g in gruende:
        kern = g
        for endung in ("-error", "-warning", "-report"):
            if kern.endswith(endung):
                kern = kern[: -len(endung)]
        if kern in ("none", ""):
            continue
        texte.append(GRUENDE.get(kern, g))
    return texte


class CupsDrucker(Drucker):
    simuliert = False

    def __init__(self, druckername="DS620", medium="w288h432", server="http://127.0.0.1:631",
                 zeitlimit_s=10, pfad=None):
        self.druckername = druckername
        self.pfad = pfad or f"/printers/{druckername}"   # anderer Pfad nur für Tests mit ippeveprinter
        self.medium = medium
        self.server = server.rstrip("/")
        self.zeitlimit_s = zeitlimit_s
        self.name = f"Echter Drucker «{druckername}» über CUPS"
        self._jobs: dict[str, int] = {}
        self._lock = threading.Lock()
        self._anfrage_nr = 0
        self._status_cache = (0.0, None)
        try:
            self._benutzer = getpass.getuser()
        except Exception:  # noqa: BLE001
            self._benutzer = "fotobox"

    # ---------- IPP-Verbindung ----------
    @property
    def drucker_uri(self) -> str:
        return f"ipp://localhost{self.pfad}"

    def _senden(self, operation, op_attr: bytes, job_attr=b"", daten=b"", zeitlimit=None) -> dict:
        with self._lock:
            self._anfrage_nr += 1
            nr = self._anfrage_nr
        basis = (_attr(T_CHARSET, "attributes-charset", "utf-8")
                 + _attr(T_SPRACHE, "attributes-natural-language", "de"))
        roh = ipp_anfrage(operation, nr, basis + op_attr, job_attr, daten)
        anfrage = urllib.request.Request(f"{self.server}{self.pfad}", data=roh,
                                         headers={"Content-Type": "application/ipp"}, method="POST")
        try:
            with urllib.request.urlopen(anfrage, timeout=zeitlimit or self.zeitlimit_s) as r:
                status, attr = ipp_antwort_lesen(r.read())
        except urllib.error.HTTPError as e:
            raise DruckFehler(f"CUPS antwortet mit HTTP {e.code}") from e
        except (urllib.error.URLError, OSError) as e:
            import sys
            if sys.platform.startswith("win"):
                raise DruckFehler("CUPS nicht erreichbar – gibt es nur unter Linux / Raspberry Pi") from e
            raise DruckFehler("CUPS nicht erreichbar – läuft der Druckdienst? (sudo systemctl start cups)") from e
        if status >= 0x0400:
            text = (attr.get("status-message") or [""])[0]
            if status == 0x0406:
                raise DruckFehler(f"Drucker «{self.druckername}» ist in CUPS nicht eingerichtet")
            raise DruckFehler(f"CUPS meldet Fehler 0x{status:04x} {text}".strip())
        return attr

    # ---------- Schnittstelle ----------
    def drucker_attribute(self) -> dict:
        return self._senden(OP_GET_PRINTER,
                            _attr(T_URI, "printer-uri", self.drucker_uri)
                            + _attr(T_KEYWORD, "requested-attributes",
                                    ["printer-state", "printer-state-reasons", "printer-state-message",
                                     "printer-is-accepting-jobs", "marker-names", "marker-levels"]))

    def status(self, frisch=False) -> dict:
        zeit, wert = self._status_cache
        if not frisch and wert and time.monotonic() - zeit < 10:
            return wert
        try:
            a = self.drucker_attribute()
            zustand = (a.get("printer-state") or [0])[0]
            gruende = [g for g in a.get("printer-state-reasons", []) if g != "none"]
            fehler = [g for g in gruende if g.endswith("-error") or g in ("offline-report", "paused")]
            texte = _grund_text(fehler or gruende)
            pegel = [p for p in a.get("marker-levels", []) if isinstance(p, int) and p >= 0]
            rest = f", Papier/Farbband ca. {min(pegel)} %" if pegel else ""
            if zustand == 5 or fehler or a.get("printer-is-accepting-jobs") == [False]:
                wert = {"bereit": False, "text": "; ".join(texte) or "Drucker angehalten"}
            else:
                hinweis = f" – {'; '.join(texte)}" if texte else ""
                wert = {"bereit": True, "text": ("druckt gerade" if zustand == 4 else "bereit") + rest + hinweis}
        except DruckFehler as e:
            wert = {"bereit": False, "text": str(e)}
        self._status_cache = (time.monotonic(), wert)
        return wert

    def einreichen(self, auftrag_id: str, datei: Path, abzuege: int) -> None:
        daten = Path(datei).read_bytes()
        op = (_attr(T_URI, "printer-uri", self.drucker_uri)
              + _attr(T_NAME, "requesting-user-name", self._benutzer)
              + _attr(T_NAME, "job-name", f"Fotobox {auftrag_id}")
              + _attr(T_MIME, "document-format", "image/jpeg"))
        job = (_attr(T_INTEGER, "copies", int(abzuege))
               + _attr(T_KEYWORD, "media", self.medium)
               + _attr(T_KEYWORD, "print-scaling", "fill"))
        a = self._senden(OP_PRINT_JOB, op, job, daten, zeitlimit=30)
        job_id = (a.get("job-id") or [None])[0]
        if not isinstance(job_id, int):
            raise DruckFehler("CUPS hat keine Auftragsnummer geliefert")
        with self._lock:
            self._jobs[auftrag_id] = job_id
        self._status_cache = (0.0, None)

    def ergebnis(self, auftrag_id: str) -> str:
        with self._lock:
            job_id = self._jobs.get(auftrag_id)
        if job_id is None:
            return "unbekannt"   # z. B. nach Neustart: welche CUPS-Nummer, wissen wir nicht mehr
        try:
            a = self._senden(OP_GET_JOB,
                             _attr(T_URI, "printer-uri", self.drucker_uri)
                             + _attr(T_INTEGER, "job-id", job_id)
                             + _attr(T_KEYWORD, "requested-attributes", ["job-state", "job-state-reasons"]))
        except DruckFehler:
            return "warteschlange"   # CUPS kurz nicht erreichbar: weiter warten, Zeitlimit greift
        zustand = (a.get("job-state") or [0])[0]
        if zustand == JOB_FERTIG:
            return "erfolgreich"
        if zustand in JOB_ABGEBROCHEN:
            return "fehlgeschlagen"
        return "warteschlange"
