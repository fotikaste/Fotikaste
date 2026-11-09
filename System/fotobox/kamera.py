"""Kamera-Baustein.

Jede Kamera (simuliert oder echt) bietet dieselben zwei Funktionen:
  status()          -> Ist die Kamera bereit?
  aufnehmen(ziel)   -> Foto auslösen und als JPEG-Datei unter «ziel» ablegen.
Der restliche Ablauf weiss nicht, welche Kamera dahintersteckt.
"""
from __future__ import annotations

import colorsys
import random
import threading
import time
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SCHRIFTEN = Path(__file__).parent / "static" / "fonts"


class KameraFehler(Exception):
    """code: nicht_verbunden | zeitueberschreitung | fehler"""

    def __init__(self, code: str, text: str):
        super().__init__(text)
        self.code = code


class Kamera:
    name = "unbekannt"
    simuliert = False

    def status(self) -> dict:
        raise NotImplementedError

    def aufnehmen(self, ziel: Path) -> Path:
        raise NotImplementedError


class SimulierteKamera(Kamera):
    """Erzeugt Testbilder im Format der Canon EOS 600D (3:2).

    verhalten() liefert die aktuelle Simulationseinstellung:
      ok | nicht_verbunden | zeitueberschreitung
    """
    name = "Simulierte Kamera (Testbilder)"
    simuliert = True

    def __init__(self, verhalten, breite=5184, hoehe=3456, verzoegerung_s=0.4):
        self._verhalten = verhalten
        self.breite, self.hoehe = breite, hoehe
        self.verzoegerung_s = verzoegerung_s
        self._zaehler = 0

    def status(self):
        if self._verhalten() == "nicht_verbunden":
            return {"bereit": False, "text": "Simulation: Kamera nicht verbunden"}
        return {"bereit": True, "text": "Simulation aktiv"}

    def aufnehmen(self, ziel: Path) -> Path:
        v = self._verhalten()
        if v == "nicht_verbunden":
            raise KameraFehler("nicht_verbunden", "Simulation: Kamera nicht verbunden")
        if v == "zeitueberschreitung":
            time.sleep(60)  # wird vom Sitzungsablauf nach Ablauf der Wartezeit abgebrochen
        time.sleep(self.verzoegerung_s)  # ungefähre Auslöse- und Übertragungszeit
        self._zaehler += 1
        bild = testbild(self.breite, self.hoehe, self._zaehler)
        ziel.parent.mkdir(parents=True, exist_ok=True)
        bild.save(ziel, "JPEG", quality=90)
        return ziel


class DigiCamControlKamera(Kamera):
    """Echte Kamera unter Windows über digiCamControl (CameraControlCmd.exe).

    Laut Anleitung: CameraControlCmd.exe /filename <Datei> /capture
    Einschränkung: Das Hauptprogramm digiCamControl darf dabei NICHT geöffnet sein.
    Nur unter Windows nutzbar – auf dem Raspberry Pi käme stattdessen gphoto2.
    """
    name = "Canon über digiCamControl (Windows)"
    simuliert = False
    PFADE = (r"C:\Program Files (x86)\digiCamControl\CameraControlCmd.exe",
             r"C:\Program Files\digiCamControl\CameraControlCmd.exe")

    def __init__(self, autofokus=lambda: False, zeitlimit_s=14):
        self._autofokus = autofokus
        self.zeitlimit_s = zeitlimit_s
        self.exe = next((p for p in self.PFADE if Path(p).exists()), None)
        self._status_cache = (0.0, None)

    def _hauptprogramm_offen(self) -> bool:
        import subprocess
        try:
            out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq CameraControl.exe", "/NH"],
                                 capture_output=True, text=True, timeout=5,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
            return "CameraControl.exe" in out
        except (OSError, subprocess.SubprocessError):
            return False

    def _usb_verbunden(self) -> bool | None:
        """Fragt Windows, ob eine Canon-Kamera (USB-Hersteller-ID 04A9) angeschlossen ist."""
        import subprocess
        try:
            out = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "@(Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'VID_04A9' -and $_.Class -eq 'WPD' }).Count"],
                capture_output=True, text=True, timeout=10,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout.strip()
            return int(out or 0) > 0
        except (OSError, ValueError, subprocess.SubprocessError):
            return None  # unbekannt – nicht blockieren, die Aufnahme meldet dann den Fehler

    def status(self):
        zeit, wert = self._status_cache
        if wert and time.monotonic() - zeit < 10:
            return wert
        if not self.exe:
            wert = {"bereit": False, "text": "digiCamControl ist nicht installiert"}
        elif self._hauptprogramm_offen():
            wert = {"bereit": False, "text": "Hauptprogramm digiCamControl ist geöffnet – bitte schliessen"}
        elif self._usb_verbunden() is False:
            wert = {"bereit": False, "text": "Keine Canon-Kamera per USB gefunden (eingeschaltet? Kabel?)"}
        else:
            wert = {"bereit": True, "text": "Kamera per USB verbunden"}
        self._status_cache = (time.monotonic(), wert)
        return wert

    def aufnehmen(self, ziel: Path) -> Path:
        import subprocess
        if not self.exe:
            raise KameraFehler("nicht_verbunden", "digiCamControl ist nicht installiert")
        ziel.parent.mkdir(parents=True, exist_ok=True)
        befehl = [self.exe, "/filename", str(ziel), "/capture" if self._autofokus() else "/capturenoaf"]
        try:
            erg = subprocess.run(befehl, capture_output=True, text=True, timeout=self.zeitlimit_s,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except subprocess.TimeoutExpired as e:
            self._status_cache = (0.0, None)
            raise KameraFehler("zeitueberschreitung", "digiCamControl hat nicht rechtzeitig geantwortet") from e
        ausgabe = (erg.stdout + erg.stderr).strip().replace("\n", " | ")
        if not ziel.exists() or ziel.stat().st_size == 0:
            self._status_cache = (0.0, None)
            code = "nicht_verbunden" if "no camera" in ausgabe.lower() or "not found" in ausgabe.lower() else "fehler"
            raise KameraFehler(code, f"Keine Bilddatei erhalten (Rückgabe {erg.returncode}): {ausgabe[-300:]}")
        return ziel


def erstelle_kamera(modus: str, sim_verhalten, autofokus=lambda: False) -> Kamera:
    if modus == "digicamcontrol":
        return DigiCamControlKamera(autofokus)
    return SimulierteKamera(sim_verhalten)


def testbild(breite: int, hoehe: int, nummer: int) -> Image.Image:
    """Ein buntes, eindeutig als Test erkennbares Bild (keine echten Personen)."""
    rnd = random.Random(nummer * 7919)
    farbton = rnd.random()
    klein = Image.new("RGB", (64, 43))
    px = klein.load()
    for y in range(43):
        for x in range(64):
            h = (farbton + x / 400 + y / 300) % 1
            r, g, b = colorsys.hsv_to_rgb(h, 0.45, 0.55 + 0.4 * (1 - y / 43))
            px[x, y] = (int(r * 255), int(g * 255), int(b * 255))
    bild = klein.resize((breite, hoehe), Image.BICUBIC)
    deko = Image.new("RGBA", (breite, hoehe), (0, 0, 0, 0))
    d = ImageDraw.Draw(deko)
    for _ in range(9):
        r = rnd.randint(hoehe // 12, hoehe // 4)
        x, y = rnd.randint(0, breite), rnd.randint(0, hoehe)
        h = (farbton + rnd.uniform(0.3, 0.7)) % 1
        c = tuple(int(v * 255) for v in colorsys.hsv_to_rgb(h, 0.35, 1.0))
        d.ellipse((x - r, y - r, x + r, y + r), fill=c + (rnd.randint(50, 110),))
    deko = deko.filter(ImageFilter.GaussianBlur(hoehe // 60))
    bild = Image.alpha_composite(bild.convert("RGBA"), deko).convert("RGB")
    d = ImageDraw.Draw(bild)
    gross = ImageFont.truetype(str(SCHRIFTEN / "Inter.ttf"), hoehe // 7)
    klein_f = ImageFont.truetype(str(SCHRIFTEN / "Inter.ttf"), hoehe // 28)
    d.text((breite / 2, hoehe / 2), f"Testbild {nummer}", font=gross, fill=(255, 255, 255), anchor="mm")
    d.text((breite / 2, hoehe / 2 + hoehe // 8), datetime.now().strftime("%d.%m.%Y %H:%M:%S"),
           font=klein_f, fill=(255, 255, 255), anchor="mm")
    # Rahmenmarken zeigen, wo das Bild beim Zuschneiden beschnitten wird
    m = hoehe // 40
    for (x, y, dx, dy) in ((m, m, 1, 1), (breite - m, m, -1, 1), (m, hoehe - m, 1, -1), (breite - m, hoehe - m, -1, -1)):
        d.line((x, y, x + dx * m * 3, y), fill="white", width=m // 4)
        d.line((x, y, x, y + dy * m * 3), fill="white", width=m // 4)
    return bild


def mit_zeitlimit(funktion, timeout_s: float):
    """Führt funktion() aus und bricht nach timeout_s mit KameraFehler ab.
    Wichtig, damit eine hängende Kamera die Fotobox nicht einfriert."""
    ergebnis, fehler = [], []

    def lauf():
        try:
            ergebnis.append(funktion())
        except BaseException as e:  # noqa: BLE001 – Fehler wird weitergereicht
            fehler.append(e)

    t = threading.Thread(target=lauf, daemon=True)
    t.start()
    t.join(timeout_s)
    if t.is_alive():
        raise KameraFehler("zeitueberschreitung", f"Kamera hat nicht innerhalb von {timeout_s:g} s geantwortet")
    if fehler:
        raise fehler[0]
    return ergebnis[0]
