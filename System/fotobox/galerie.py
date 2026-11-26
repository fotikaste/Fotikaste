"""Online-Galerie: Fotos für die Handys der Gäste.

Ablauf (funktioniert auch ohne Internet):
  1. Gast wünscht sein Foto aufs Handy -> die Fotobox legt einen Upload-Auftrag an
     und kennt sofort die spätere Internet-Adresse (URL). Daraus wird der QR-Code.
  2. Ein Hintergrund-Arbeiter lädt wartende Fotos hoch, sobald Internet da ist,
     und versucht es bei Fehlern später erneut.
  3. Die URL enthält eine lange Zufallskennung. Nur wer den QR-Code hat, findet das Foto.

Jede Galerie (simuliert oder echt) bietet dieselben Funktionen:
  status()                  -> Ist die Galerie erreichbar?
  url(schluessel)           -> Spätere Internet-Adresse des Fotos
  hochladen(datei, schluessel)
"""
from __future__ import annotations

import hashlib
import secrets
import time
import hmac
import shutil
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


class GalerieFehler(Exception):
    pass


class Galerie:
    name = "unbekannt"
    simuliert = False

    def status(self) -> dict:
        raise NotImplementedError

    def url(self, schluessel: str) -> str:
        raise NotImplementedError

    def hochladen(self, datei: Path, schluessel: str) -> None:
        raise NotImplementedError

    def neuer_schluessel(self, veranstaltung_id: str) -> str:
        """Speicherpfad des Fotos; enthält eine lange Zufallskennung (ca. 128 Bit, nicht erratbar)."""
        return f"{veranstaltung_id}/{secrets.token_urlsafe(16)}.jpg"


class SimulierteGalerie(Galerie):
    """Kopiert statt hochzuladen in den Ordner daten/galerie_simulation.
    Die Adresse zeigt auf diesen PC – ein Handy kann sie NICHT öffnen (nur zum Testen)."""
    name = "Simulierte Online-Galerie (Ordner auf diesem PC)"
    simuliert = True

    def __init__(self, ordner: Path, basis_url: str, verhalten):
        self.ordner = ordner
        self.basis_url = basis_url.rstrip("/")
        self._verhalten = verhalten

    def status(self):
        if self._verhalten() == "offline":
            return {"bereit": False, "text": "Simulation: kein Internet"}
        return {"bereit": True, "text": "Simulation aktiv"}

    def url(self, schluessel):
        return f"{self.basis_url}/{schluessel}"

    def hochladen(self, datei, schluessel):
        if self._verhalten() == "offline":
            raise GalerieFehler("Simulation: kein Internet")
        ziel = self.ordner / schluessel
        ziel.parent.mkdir(parents=True, exist_ok=True)
        tmp = ziel.with_suffix(".tmp")
        shutil.copyfile(datei, tmp)
        tmp.replace(ziel)


# ---------------------------------------------------------------------------
# Cloudflare R2 über die S3-Schnittstelle
# ---------------------------------------------------------------------------
# Laut Cloudflare-Doku (2026-11-10): Region «auto», Endpunkt
#   https://<KONTO-ID>.r2.cloudflarestorage.com  bzw. für EU-Buckets
#   https://<KONTO-ID>.eu.r2.cloudflarestorage.com
# PutObject und DeleteObject werden unterstützt.

def signiere_v4(methode: str, url: str, kopf: dict, nutzlast_hash: str, zugangs_id: str,
                geheimnis: str, region: str = "auto", dienst: str = "s3", zeit: datetime | None = None) -> dict:
    """AWS Signature Version 4: beweist dem Speicher, dass die Anfrage von uns kommt,
    ohne das Geheimnis selbst zu verschicken. Gibt die zu sendenden Kopfzeilen zurück."""
    zeit = zeit or datetime.now(timezone.utc)
    amz_datum = zeit.strftime("%Y%m%dT%H%M%SZ")
    tag = zeit.strftime("%Y%m%d")
    teile = urllib.parse.urlsplit(url)
    kopf = {**{k.lower(): str(v).strip() for k, v in kopf.items()},
            "host": teile.netloc, "x-amz-date": amz_datum, "x-amz-content-sha256": nutzlast_hash}
    signiert = ";".join(sorted(kopf))
    kanonisch = "\n".join([
        methode,
        teile.path or "/",  # die Adresse ist bereits kodiert (siehe _anfrage) – nicht doppelt kodieren
        "&".join(f"{urllib.parse.quote(k, safe='-_.~')}={urllib.parse.quote(v, safe='-_.~')}"
                 for k, v in sorted(urllib.parse.parse_qsl(teile.query, keep_blank_values=True))),
        "".join(f"{k}:{kopf[k]}\n" for k in sorted(kopf)),
        signiert,
        nutzlast_hash,
    ])
    bereich = f"{tag}/{region}/{dienst}/aws4_request"
    zu_signieren = "\n".join(["AWS4-HMAC-SHA256", amz_datum, bereich,
                              hashlib.sha256(kanonisch.encode()).hexdigest()])

    def h(schluessel, text):
        return hmac.new(schluessel, text.encode(), hashlib.sha256).digest()

    k = h(h(h(h(("AWS4" + geheimnis).encode(), tag), region), dienst), "aws4_request")
    signatur = hmac.new(k, zu_signieren.encode(), hashlib.sha256).hexdigest()
    kopf["authorization"] = (f"AWS4-HMAC-SHA256 Credential={zugangs_id}/{bereich}, "
                             f"SignedHeaders={signiert}, Signature={signatur}")
    kopf.pop("host")  # setzt urllib selbst
    return kopf


class R2Galerie(Galerie):
    """Echter Online-Speicher bei Cloudflare R2."""
    name = "Cloudflare R2"
    simuliert = False

    def __init__(self, konto_id: str, bucket: str, zugangs_id: str, geheimnis: str,
                 oeffentliche_url: str, eu: bool = True, zeitlimit_s: float = 30):
        self.endpunkt = f"https://{konto_id}.{'eu.' if eu else ''}r2.cloudflarestorage.com"
        self.bucket = bucket
        self._zugang = (zugangs_id, geheimnis)
        self.oeffentliche_url = oeffentliche_url.rstrip("/")
        self.zeitlimit_s = zeitlimit_s
        self._vollstaendig = all([konto_id, bucket, zugangs_id, geheimnis, oeffentliche_url])

    def status(self):
        if not self._vollstaendig:
            return {"bereit": False, "text": "Zugangsdaten unvollständig"}
        return {"bereit": True, "text": f"Bucket «{self.bucket}» eingerichtet"}

    def url(self, schluessel):
        return f"{self.oeffentliche_url}/{schluessel}"

    def _anfrage(self, methode: str, schluessel: str, daten: bytes = b"", kopf: dict | None = None):
        if not self._vollstaendig:
            raise GalerieFehler("Zugangsdaten für Cloudflare R2 unvollständig")
        url = f"{self.endpunkt}/{self.bucket}/{urllib.parse.quote(schluessel, safe='/-_.~')}"
        kopf = signiere_v4(methode, url, kopf or {}, hashlib.sha256(daten).hexdigest(), *self._zugang)
        req = urllib.request.Request(url, data=daten if methode == "PUT" else None, method=methode, headers=kopf)
        try:
            with urllib.request.urlopen(req, timeout=self.zeitlimit_s) as r:
                return r.status
        except urllib.error.HTTPError as e:
            raise GalerieFehler(f"Cloudflare R2 antwortet {e.code}: {e.read()[:200]!r}") from e
        except (urllib.error.URLError, OSError) as e:
            raise GalerieFehler(f"Keine Verbindung zu Cloudflare R2: {e}") from e

    def hochladen(self, datei, schluessel):
        daten = Path(datei).read_bytes()
        self._anfrage("PUT", schluessel, daten, {"content-type": "image/jpeg",
                                                 "cache-control": "public, max-age=86400"})

    def loeschen(self, schluessel):
        self._anfrage("DELETE", schluessel)

    def verbindung_testen(self) -> list[str]:
        """Hochladen → öffentlich abrufen → löschen. Liefert verständliche Schritte zurück."""
        schritte, schluessel = [], f"fotobox-verbindungstest/{datetime.now():%Y%m%d-%H%M%S}.txt"
        inhalt = b"Fotobox Verbindungstest"
        self._anfrage("PUT", schluessel, inhalt, {"content-type": "text/plain"})
        schritte.append("Hochladen: ok")
        try:
            # Cloudflare sperrt öffentliche Abrufe ohne Browser-Kennung (getestet 2026-11-17: ohne → 403,
            # mit «Mozilla/5.0 …» → 200). Handys schicken sie immer mit – der Test muss es auch tun.
            abruf = urllib.request.Request(self.url(schluessel), headers={"User-Agent": "Mozilla/5.0 (Fotobox Verbindungstest)"})
            with urllib.request.urlopen(abruf, timeout=self.zeitlimit_s) as r:
                gleich = r.read() == inhalt
            schritte.append("Öffentlicher Abruf: ok" if gleich else "Öffentlicher Abruf: falscher Inhalt")
        except (urllib.error.URLError, OSError) as e:
            schritte.append(f"Öffentlicher Abruf: FEHLER ({e}) – öffentliche Adresse prüfen")
        self.loeschen(schluessel)
        schritte.append("Löschen: ok")
        return schritte


# ---------------------------------------------------------------------------
# Fotikaste-Plattform (Phase 5): kein Speicherschlüssel mehr auf der Fotobox
# ---------------------------------------------------------------------------
# Die Fotobox kennt nur ein Geräte-Token. Damit darf sie bei der Plattform ausschliesslich Fotos für das
# ihr zugewiesene Event anmelden und hochladen – nicht lesen, nicht auflisten, nicht löschen.
# Gäste-Link: <plattform>/f/<zufall>. Die Plattform speichert nur einen Fingerabdruck (SHA-256) davon.
# Der Link entsteht offline auf der Fotobox; das Foto folgt, sobald Internet da ist.

class PlattformGalerie(Galerie):
    name = "Fotikaste-Plattform"
    simuliert = False
    STATUS_GUELTIG_S = 60  # Verbindungsstatus so lange zwischenspeichern (die Betriebsseite fragt oft)

    def __init__(self, basis_url: str, geraete_token: str, merken=None, erinnern=None, zeitlimit_s: float = 30):
        """merken(schluessel, wert) / erinnern(schluessel) speichern die zuletzt bekannte Event-Kennung
        (z. B. in den Einstellungen), damit Fotos auch offline dem richtigen Event zugeordnet werden."""
        self.basis = basis_url.rstrip("/")
        self._token = geraete_token
        self._merken = merken or (lambda k, v: None)
        self._erinnern = erinnern or (lambda k: "")
        self.zeitlimit_s = zeitlimit_s
        self._status = None
        self._status_zeit = 0.0
        self._bild = {"lange_seite_px": 2400, "jpeg_qualitaet": 85, "vorschau_px": 400}

    @property
    def eingerichtet(self) -> bool:
        return bool(self.basis.startswith(("https://", "http://")) and len(self._token) >= 32)

    def _anfrage(self, methode: str, pfad: str, json_daten=None, daten: bytes | None = None, zeitlimit=None):
        import json as _json
        kopf = {"Authorization": f"Bearer {self._token}", "User-Agent": "Fotobox"}
        nutzlast = None
        if json_daten is not None:
            nutzlast = _json.dumps(json_daten).encode()
            kopf["Content-Type"] = "application/json"
        elif daten is not None:
            nutzlast = daten
            kopf["Content-Type"] = "image/jpeg"
        req = urllib.request.Request(f"{self.basis}/api/device/v1{pfad}", data=nutzlast, method=methode, headers=kopf)
        try:
            with urllib.request.urlopen(req, timeout=zeitlimit or self.zeitlimit_s) as r:
                return r.status, _json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            try:
                text = _json.loads(e.read()).get("text", "")
            except Exception:  # noqa: BLE001
                text = ""
            raise GalerieFehler(f"Plattform antwortet {e.code}: {text}".strip()) from e
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise GalerieFehler(f"Keine Verbindung zur Plattform: {e}") from e

    def konfiguration(self) -> dict:
        """Aktives Event und Bildvorgaben von der Plattform holen und merken."""
        _, k = self._anfrage("GET", "/config", zeitlimit=10)
        ev = k.get("event") or {}
        self._merken("plattform_event_id", ev.get("id", ""))
        self._merken("plattform_event_name", ev.get("name", ""))
        self._bild.update({x: k.get("bild", {}).get(x, self._bild[x]) for x in self._bild})
        return k

    def status(self):
        if not self.eingerichtet:
            return {"bereit": False, "text": "Adresse oder Geräte-Token fehlt"}
        if self._status and time.monotonic() - self._status_zeit < self.STATUS_GUELTIG_S:
            return self._status
        try:
            k = self.konfiguration()
            ev = k.get("event")
            self._status = ({"bereit": True, "text": f"Verbunden – Event «{ev['name']}»"} if ev
                            else {"bereit": False, "text": "Verbunden, aber kein aktives Event zugewiesen (Fotos warten)"})
        except GalerieFehler as e:
            self._status = {"bereit": False, "text": str(e)[:200]}
        self._status_zeit = time.monotonic()
        return self._status

    def neuer_schluessel(self, veranstaltung_id: str) -> str:
        # «<Event der Plattform>/<Gäste-Link>»; 0 = Event noch unbekannt (offline seit Start) → Plattform nimmt das aktive Event
        return f"{self._erinnern('plattform_event_id') or '0'}/{secrets.token_urlsafe(16)}"

    def url(self, schluessel):
        return f"{self.basis}/f/{schluessel.split('/')[-1]}"

    def _varianten(self, datei: Path) -> tuple[bytes, bytes]:
        """Web-Version (lange Seite laut Plattform) und Vorschau – nie vergrössern, Original bleibt unverändert."""
        import io
        from PIL import Image
        with Image.open(datei) as bild:
            bild = bild.convert("RGB")
            ergebnis = []
            for kante in (int(self._bild["lange_seite_px"]), int(self._bild["vorschau_px"])):
                kopie = bild.copy()
                kopie.thumbnail((kante, kante), Image.LANCZOS)
                puffer = io.BytesIO()
                kopie.save(puffer, "JPEG", quality=int(self._bild["jpeg_qualitaet"]) if kante > 1000 else 80, optimize=True)
                ergebnis.append(puffer.getvalue())
        return ergebnis[0], ergebnis[1]

    def hochladen(self, datei, schluessel):
        if not self.eingerichtet:
            raise GalerieFehler("Plattform nicht eingerichtet (Adresse oder Geräte-Token fehlt)")
        event, gast = schluessel.split("/", 1) if "/" in schluessel else ("0", schluessel)
        web, vorschau = self._varianten(Path(datei))
        anmeldung = {
            "event_id": None if event in ("", "0") else event,
            "client_photo_id": hashlib.sha256(schluessel.encode()).hexdigest()[:32],
            "token_hash": hashlib.sha256(gast.encode()).hexdigest(),
            "taken_at": datetime.fromtimestamp(Path(datei).stat().st_mtime, timezone.utc).isoformat(),
            "web": {"bytes": len(web), "sha256": hashlib.sha256(web).hexdigest()},
            "thumb": {"bytes": len(vorschau), "sha256": hashlib.sha256(vorschau).hexdigest()},
        }
        _, antwort = self._anfrage("POST", "/uploads", json_daten=anmeldung)
        if antwort.get("fertig"):
            return
        for variante in antwort.get("fehlend", ["web", "thumb"]):
            self._anfrage("PUT", f"/uploads/{antwort['photo_id']}/{variante}", daten=web if variante == "web" else vorschau)
