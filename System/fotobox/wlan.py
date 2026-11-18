"""WLAN einrichten (damit der Kunde am Fest das WLAN des Lokals wählen kann).

Auf dem Raspberry Pi steuert «NetworkManager» das WLAN; wir sprechen es über das Programm `nmcli` an.
Unter Windows (Entwicklung) und in Tests gibt es eine Simulation mit derselben Schnittstelle.

Schnittstelle:
  status()                 -> {"verbunden": bool, "ssid": str, "internet": "ja"|"eingeschraenkt"|"nein"|"unbekannt"}
  netze()                  -> [{"ssid", "signal" (0–100), "gesichert": bool, "aktiv": bool}], stärkstes zuerst
  verbinden(ssid, passwort)-> None oder WlanFehler mit verständlichem Text

Das Passwort wird nie ins Protokoll geschrieben.
Stand 2026-11-18: nmcli-Ausgabe mit Beispieltexten getestet, auf dem echten Pi NOCH NICHT.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import threading
import time


class WlanFehler(Exception):
    pass


def nmcli_zeile(zeile: str) -> list[str]:
    """Zerlegt eine Zeile von «nmcli -t»: Felder durch «:» getrennt, «\\:» und «\\\\» sind maskiert."""
    felder, aktuell, i = [], "", 0
    while i < len(zeile):
        z = zeile[i]
        if z == "\\" and i + 1 < len(zeile):
            aktuell += zeile[i + 1]
            i += 2
            continue
        if z == ":":
            felder.append(aktuell)
            aktuell = ""
        else:
            aktuell += z
        i += 1
    felder.append(aktuell)
    return felder


def netze_auswerten(ausgabe: str) -> list[dict]:
    """Ausgabe von «nmcli -t -f IN-USE,SSID,SIGNAL,SECURITY device wifi list» → Liste ohne Doppelte."""
    netze: dict[str, dict] = {}
    for zeile in ausgabe.splitlines():
        if not zeile.strip():
            continue
        f = nmcli_zeile(zeile)
        if len(f) < 4:
            continue
        aktiv, ssid, signal, sicherheit = f[0].strip() == "*", f[1], f[2], f[3]
        if not ssid:
            continue   # versteckte Netze ohne Namen
        try:
            signal = int(signal)
        except ValueError:
            signal = 0
        alt = netze.get(ssid)
        if not alt or signal > alt["signal"] or aktiv:
            netze[ssid] = {"ssid": ssid, "signal": max(signal, alt["signal"] if alt else 0),
                           "gesichert": sicherheit.strip() not in ("", "--"), "aktiv": aktiv or bool(alt and alt["aktiv"])}
    return sorted(netze.values(), key=lambda n: (not n["aktiv"], -n["signal"], n["ssid"].lower()))


def fehler_text(meldung: str) -> str:
    m = meldung.lower()
    if "secrets were required" in m or "802-11-wireless-security" in m or "password" in m or "psk" in m:
        return "Passwort falsch – bitte nochmals eingeben (Gross-/Kleinschreibung beachten)"
    if "no network with ssid" in m or "not found" in m:
        return "WLAN nicht gefunden – evtl. zu weit weg. Bitte neu suchen"
    if "not authorized" in m or "insufficient privileges" in m:
        return "Die Fotobox darf das WLAN nicht ändern – bitte den Vermieter informieren"
    if "timeout" in m or "timed out" in m:
        return "Keine Antwort vom WLAN – bitte nochmals versuchen"
    return "Verbinden hat nicht geklappt – bitte nochmals versuchen"


class NmcliWlan:
    """Echtes WLAN über NetworkManager (Raspberry Pi OS)."""
    simuliert = False

    def __init__(self, nmcli="nmcli"):
        self.nmcli = nmcli
        self._lock = threading.Lock()

    def _lauf(self, *argumente, zeitlimit=20) -> str:
        try:
            r = subprocess.run([self.nmcli, *argumente], capture_output=True, text=True, timeout=zeitlimit)
        except subprocess.TimeoutExpired as e:
            raise WlanFehler("timeout") from e
        except OSError as e:
            raise WlanFehler(f"nmcli nicht verfügbar: {e}") from e
        if r.returncode != 0:
            raise WlanFehler((r.stderr or r.stdout).strip())
        return r.stdout

    def status(self) -> dict:
        ssid = ""
        try:
            for zeile in self._lauf("-t", "-f", "ACTIVE,SSID", "device", "wifi").splitlines():
                f = nmcli_zeile(zeile)
                if len(f) >= 2 and f[0] == "yes":
                    ssid = f[1]
                    break
            internet = self._lauf("networking", "connectivity", "check", zeitlimit=15).strip()
        except WlanFehler:
            return {"verbunden": False, "ssid": "", "internet": "unbekannt"}
        return {"verbunden": bool(ssid), "ssid": ssid,
                "internet": {"full": "ja", "limited": "eingeschraenkt", "portal": "eingeschraenkt",
                             "none": "nein"}.get(internet, "unbekannt")}

    def netze(self) -> list[dict]:
        with self._lock:
            try:
                aus = self._lauf("-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list",
                                 "--rescan", "yes", zeitlimit=30)
            except WlanFehler as e:
                raise WlanFehler("WLAN-Suche nicht möglich – ist das WLAN des Pi eingeschaltet?") from e
        return netze_auswerten(aus)

    def verbinden(self, ssid: str, passwort: str) -> None:
        argumente = ["device", "wifi", "connect", ssid]
        if passwort:
            argumente += ["password", passwort]
        with self._lock:
            try:
                self._lauf(*argumente, zeitlimit=60)
            except WlanFehler as e:
                raise WlanFehler(fehler_text(str(e))) from None   # Originalmeldung nicht weitergeben (Passwort!)


class SimuliertesWlan:
    """Für Windows und Tests: drei erfundene Netze, Passwort «richtig123» passt für «Lokal-Gaeste»."""
    simuliert = True
    NETZE = [{"ssid": "Lokal-Gaeste", "signal": 82, "gesichert": True},
             {"ssid": "Restaurant Sonne", "signal": 55, "gesichert": True},
             {"ssid": "Offenes WLAN", "signal": 30, "gesichert": False}]

    def __init__(self):
        self.ssid = ""

    def status(self) -> dict:
        return {"verbunden": bool(self.ssid), "ssid": self.ssid, "internet": "ja" if self.ssid else "nein"}

    def netze(self) -> list[dict]:
        return [{**n, "aktiv": n["ssid"] == self.ssid} for n in self.NETZE]

    def verbinden(self, ssid: str, passwort: str) -> None:
        time.sleep(0.3)
        netz = next((n for n in self.NETZE if n["ssid"] == ssid), None)
        if not netz:
            raise WlanFehler(fehler_text("No network with SSID"))
        if netz["gesichert"] and passwort != "richtig123":
            raise WlanFehler(fehler_text("Secrets were required, but not provided"))
        self.ssid = ssid


def erstelle_wlan():
    if sys.platform.startswith("linux") and shutil.which("nmcli"):
        return NmcliWlan()
    return SimuliertesWlan()
