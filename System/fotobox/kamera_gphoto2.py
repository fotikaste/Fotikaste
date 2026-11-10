"""Echte Kamera unter Linux (später Raspberry Pi) über gphoto2.

Das Python-Paket «gphoto2» (python-gphoto2) gibt es nur unter Linux/macOS. Unter Windows meldet
dieser Baustein deshalb «nicht installiert» – die Fotobox läuft trotzdem weiter.

Die Verbindung zur Kamera bleibt offen (wie bei der digiCamControl-App). Gemessen am 2026-11-10
mit EOS 600D in Ubuntu/WSL (gphoto2 2.5.32, python-gphoto2 2.6.3):
  - Auslösen + Übertragen ohne Livebild: 1,2–1,7 s
  - Im Livebild vorfokussieren, dann Fernauslöser «Immediate»: Foto nach 1,0–1,4 s
  - Im Livebild vorfokussieren, dann normales capture(): 3,5–6,5 s (stellt nochmals scharf) → vermeiden

gphoto2 darf nie von zwei Threads gleichzeitig benutzt werden; deshalb läuft jeder Zugriff
über self._lock. Wer nicht rechtzeitig drankommt, bekommt einen KameraFehler statt zu hängen.
"""
from __future__ import annotations

import logging
import threading
import time
from pathlib import Path

from .kamera import Kamera, KameraFehler, pruefe_canon

log = logging.getLogger("fotobox")

# gphoto2-Fehlernummern (aus gphoto2-port-result.h / gphoto2-result.h)
NICHT_GEFUNDEN = {-105, -52}   # GP_ERROR_MODEL_NOT_FOUND, GP_ERROR_IO_USB_FIND
BELEGT = -53                   # GP_ERROR_IO_USB_CLAIM: ein anderes Programm hält die Kamera
GETRENNT = {-7, -1, -35}       # GP_ERROR_IO, GP_ERROR (allgemein), GP_ERROR_IO_WRITE
BESCHAEFTIGT = -110            # GP_ERROR_CAMERA_BUSY («I/O in progress»)


def _gphoto2_laden():
    try:
        import gphoto2  # noqa: PLC0415 – nur unter Linux vorhanden
        return gphoto2
    except ImportError:
        return None


class Gphoto2Kamera(Kamera):
    name = "Canon über gphoto2 (Linux / Raspberry Pi)"
    simuliert = False
    VORFOKUS_GUELTIG_S = 20
    LOCK_WARTEN_S = 10

    def __init__(self, gp=None, zeitlimit_s=25):
        self.gp = gp if gp is not None else _gphoto2_laden()
        self.zeitlimit_s = zeitlimit_s
        self._cam = None
        self._lock = threading.Lock()
        self._status_cache = (0.0, None)
        self._livebild = False
        self._vorfokus_zeit = 0.0

    # ---------- Verbindung ----------
    def _fehler(self, e, was: str) -> KameraFehler:
        code = getattr(e, "code", None)
        if code == BELEGT:
            return KameraFehler("nicht_verbunden", "Ein anderes Programm belegt die Kamera (z. B. Dateimanager)")
        if code in NICHT_GEFUNDEN:
            return KameraFehler("nicht_verbunden", "Keine Kamera gefunden (eingeschaltet? Kabel?)")
        if code in GETRENNT:
            return KameraFehler("nicht_verbunden", f"Verbindung zur Kamera unterbrochen ({was}: {e})")
        return KameraFehler("fehler", f"Kamerafehler beim {was}: {e}")

    def _verbinden(self):
        """Nur mit gehaltenem Lock aufrufen."""
        if self._cam is not None:
            return self._cam
        if self.gp is None:
            raise KameraFehler("nicht_verbunden", "gphoto2 ist auf diesem Computer nicht installiert (nur Linux)")
        cam = self.gp.Camera()
        try:
            cam.init()
        except self.gp.GPhoto2Error as e:
            raise self._fehler(e, "Verbinden") from e
        self._cam = cam
        self._livebild = False
        # Fotos direkt an den Computer schicken, nicht auf die Speicherkarte (schneller, keine volle Karte)
        try:
            self._setzen("capturetarget", "Internal RAM")
        except self.gp.GPhoto2Error:
            pass
        return cam

    def _trennen(self):
        """Nur mit gehaltenem Lock aufrufen. Nach einem Fehler: beim nächsten Mal neu verbinden."""
        cam, self._cam = self._cam, None
        self._livebild = False
        self._status_cache = (0.0, None)
        if cam is None:
            return
        try:
            self._ereignisse_leeren(cam, 0.3)
            cam.exit()
        except Exception:  # noqa: BLE001 – beim Trennen sind Fehler egal
            pass

    def _ereignisse_leeren(self, cam, dauer_s):
        ende = time.monotonic() + dauer_s
        while time.monotonic() < ende:
            typ, _ = cam.wait_for_event(50)
            if typ == self.gp.GP_EVENT_TIMEOUT:
                break

    def _setzen(self, name, wert):
        w = self._cam.get_single_config(name)
        w.set_value(wert)
        self._cam.set_single_config(name, w)

    def _mit_kamera(self, was, funktion, warten_s=None):
        """Führt funktion(cam) exklusiv aus. Fehler → Verbindung schliessen, KameraFehler werfen."""
        if not self._lock.acquire(timeout=self.LOCK_WARTEN_S if warten_s is None else warten_s):
            raise KameraFehler("zeitueberschreitung", "Kamera ist noch mit einem anderen Befehl beschäftigt")
        try:
            cam = self._verbinden()
            try:
                return funktion(cam)
            except self.gp.GPhoto2Error as e:
                self._trennen()
                raise self._fehler(e, was) from e
            except KameraFehler:
                self._trennen()
                raise
        finally:
            self._lock.release()

    # ---------- Schnittstelle ----------
    def status(self, frisch=False):
        zeit, wert = self._status_cache
        if not frisch and wert and time.monotonic() - zeit < 15:
            return wert
        if self.gp is None:
            wert = {"bereit": False, "text": "gphoto2 ist auf diesem Computer nicht installiert (nur Linux / Raspberry Pi)"}
        elif not self._lock.acquire(blocking=False):
            return wert or {"bereit": True, "text": "Kamera beschäftigt"}  # gerade Aufnahme/Livebild
        else:
            try:
                cam = self._verbinden()
                try:
                    akku = cam.get_single_config("batterylevel").get_value()
                except self.gp.GPhoto2Error as e:
                    self._trennen()
                    raise self._fehler(e, "Statusabfrage") from e
                wert = {"bereit": True, "text": f"Kamera verbunden (gphoto2), Akku {akku}"}
            except KameraFehler as e:
                wert = {"bereit": False, "text": str(e)}
            finally:
                self._lock.release()
        self._status_cache = (time.monotonic(), wert)
        return wert

    def aufnehmen(self, ziel: Path) -> Path:
        gp = self.gp
        vorab = self._livebild and time.monotonic() - self._vorfokus_zeit < self.VORFOKUS_GUELTIG_S
        self._vorfokus_zeit = 0.0

        def ausloesen(cam):
            if vorab:
                # Schon scharfgestellt: Autofokus beenden und per Fernauslöser ohne neues Scharfstellen auslösen
                try:
                    self._setzen("autofocusdrive", 0)
                except gp.GPhoto2Error:
                    pass
                self._setzen("eosremoterelease", "Immediate")
                self._setzen("eosremoterelease", "Release Full")
                ende = time.monotonic() + self.zeitlimit_s
                while time.monotonic() < ende:
                    typ, daten = cam.wait_for_event(200)
                    if typ == gp.GP_EVENT_FILE_ADDED:
                        pfad = daten
                        break
                else:
                    raise KameraFehler("zeitueberschreitung", "Kamera hat kein Foto gemeldet")
            else:
                pfad = cam.capture(gp.GP_CAPTURE_IMAGE)
            ziel.parent.mkdir(parents=True, exist_ok=True)
            teil = ziel.with_name(ziel.name + ".teil")
            datei = cam.file_get(pfad.folder, pfad.name, gp.GP_FILE_TYPE_NORMAL)
            datei.save(str(teil))
            teil.replace(ziel)  # erst vollständig, dann unter dem richtigen Namen
            self._ereignisse_leeren(cam, 0.2)
            return ziel

        log.info("gphoto2: Auslösen %s", "per Fernauslöser nach Vorfokus" if vorab else "mit capture (Kamera stellt selbst scharf)")
        try:
            self._mit_kamera("Auslösen", ausloesen)
        except KameraFehler:
            self._status_cache = (0.0, None)
            raise
        if not ziel.exists() or ziel.stat().st_size == 0:
            raise KameraFehler("fehler", "Leere Bilddatei von der Kamera")
        pruefe_canon(ziel)
        return ziel

    def livebild_start(self):
        def an(cam):
            cam.capture_preview()  # schaltet das Livebild der Kamera ein
            self._livebild = True
        try:
            self._mit_kamera("Livebild starten", an)
        except KameraFehler as e:
            raise KameraFehler("kein_livebild", str(e)) from e

    def livebild_bild(self) -> bytes:
        def bild(cam):
            f = cam.capture_preview()
            self._livebild = True
            return bytes(memoryview(f.get_data_and_size()))
        try:
            daten = self._mit_kamera("Livebild", bild, warten_s=3)
        except KameraFehler as e:
            raise KameraFehler("kein_livebild", str(e)) from e
        if not daten.startswith(b"\xff\xd8"):
            raise KameraFehler("kein_livebild", "Livebild noch nicht bereit")
        return daten

    def livebild_stop(self):
        if not self._livebild:
            return

        def aus(cam):
            self._livebild = False
            self._setzen("viewfinder", 0)
        try:
            self._mit_kamera("Livebild stoppen", aus)
        except KameraFehler:
            pass

    def vorfokussieren(self):
        """Autofokus im Livebild starten. Kehrt sofort zurück; die Kamera stellt scharf,
        während der Countdown läuft und das Livebild weiterläuft."""
        if not self._livebild:
            return

        def fokus(cam):
            self._setzen("autofocusdrive", 1)
        self._mit_kamera("Vorfokus", fokus)
        self._vorfokus_zeit = time.monotonic()
