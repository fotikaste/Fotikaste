"""Kamera-Baustein.

Jede Kamera (simuliert oder echt) bietet dieselben Funktionen:
  status()          -> Ist die Kamera bereit?
  aufnehmen(ziel)   -> Foto auslösen und als JPEG-Datei unter «ziel» ablegen.
  livebild_start() / livebild_bild() / livebild_stop()
                    -> Livebild (optional; Kameras ohne Livebild melden KameraFehler)
Der restliche Ablauf weiss nicht, welche Kamera dahintersteckt.
"""
from __future__ import annotations

import colorsys
import math
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

    # Livebild: Standard = nicht vorhanden. Die Oberfläche läuft dann ohne Livebild weiter.
    def livebild_start(self):
        raise KameraFehler("kein_livebild", "Diese Kamera-Anbindung hat kein Livebild")

    def livebild_bild(self) -> bytes:
        raise KameraFehler("kein_livebild", "Diese Kamera-Anbindung hat kein Livebild")

    def livebild_stop(self):
        pass

    def vorfokussieren(self):
        """Schon während des Countdowns scharfstellen, damit bei «0» sofort ausgelöst wird.
        Standard: nichts tun (die Kamera stellt dann beim Auslösen selbst scharf)."""


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

    def livebild_start(self):
        if self._verhalten() == "nicht_verbunden":
            raise KameraFehler("nicht_verbunden", "Simulation: Kamera nicht verbunden")

    def livebild_bild(self) -> bytes:
        """Ein bewegtes Testbild (Kreis wandert), damit man Bewegung und Spiegelung sieht."""
        import io
        b, h = 720, 480
        t = time.monotonic()
        bild = Image.new("RGB", (b, h), (52, 62, 78))
        d = ImageDraw.Draw(bild)
        for i in range(0, b, 60):           # Raster als Orientierung
            d.line((i, 0, i, h), fill=(70, 82, 100))
        for i in range(0, h, 60):
            d.line((0, i, b, i), fill=(70, 82, 100))
        x = b / 2 + (b / 3) * math.sin(t * 1.3)
        d.ellipse((x - 60, h / 2 - 60, x + 60, h / 2 + 60), fill=(235, 190, 110))
        f = ImageFont.truetype(str(SCHRIFTEN / "Inter.ttf"), 26)
        d.text((24, 20), "Livebild (Simulation)", font=f, fill="white")
        puffer = io.BytesIO()
        bild.save(puffer, "JPEG", quality=70)
        return puffer.getvalue()


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

    # Gemessen am 2026-11-09 mit EOS 600D: 15,1 s (erste Aufnahme), 8,4 s (zweite).
    # Jede Aufnahme baut die Verbindung neu auf – daher die lange Dauer.
    def __init__(self, autofokus=lambda: False, zeitlimit_s=25):
        self._autofokus = autofokus
        self.zeitlimit_s = zeitlimit_s
        self.exe = next((p for p in self.PFADE if Path(p).exists()), None)
        self._status_cache = (0.0, None)

    def _hauptprogramm_offen(self) -> bool:
        import subprocess
        try:
            out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq CameraControl.exe", "/NH"],
                                 capture_output=True, text=True, encoding="oem", errors="replace", timeout=5,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
            return "CameraControl.exe" in (out or "")
        except (OSError, subprocess.SubprocessError):
            return False

    def _usb_verbunden(self) -> bool | None:
        """Fragt Windows, ob eine Canon-Kamera (USB-Hersteller-ID 04A9) angeschlossen ist."""
        import subprocess
        try:
            out = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "@(Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'VID_04A9' -and $_.Class -eq 'WPD' }).Count"],
                capture_output=True, text=True, encoding="oem", errors="replace", timeout=10,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout.strip()
            return int(out or 0) > 0
        except (OSError, ValueError, subprocess.SubprocessError):
            return None  # unbekannt – nicht blockieren, die Aufnahme meldet dann den Fehler

    def status(self, frisch=False):
        zeit, wert = self._status_cache
        if not frisch and wert and time.monotonic() - zeit < 15:
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
            erg = subprocess.run(befehl, capture_output=True, text=True, encoding="oem", errors="replace", timeout=self.zeitlimit_s,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except subprocess.TimeoutExpired as e:
            self._status_cache = (0.0, None)
            raise KameraFehler("zeitueberschreitung", "digiCamControl hat nicht rechtzeitig geantwortet") from e
        ausgabe = ((erg.stdout or "") + (erg.stderr or "")).strip().replace("\n", " | ")
        if not ziel.exists() or ziel.stat().st_size == 0:
            self._status_cache = (0.0, None)
            code = "nicht_verbunden" if "no camera" in ausgabe.lower() or "not found" in ausgabe.lower() else "fehler"
            raise KameraFehler(code, f"Keine Bilddatei erhalten (Rückgabe {erg.returncode}): {ausgabe[-300:]}")
        pruefe_canon(ziel)
        return ziel


class DigiCamControlAppKamera(DigiCamControlKamera):
    """Schnelle Variante: Die digiCamControl-App läuft dauerhaft (minimiert) und hält die
    Verbindung zur Kamera offen. Wir schicken nur noch den Auslösebefehl über
    CameraControlRemoteCmd.exe /c capture <Datei>.

    Gemessen am 2026-11-09 mit EOS 600D: Foto nach 1,4 s auf dem PC (statt 8–15 s),
    Auslöseverzögerung von Mal zu Mal gleich (Schwankung < 0,05 s).
    """
    name = "Canon über digiCamControl-App (schnell, Windows)"
    APP = (r"C:\Program Files (x86)\digiCamControl\CameraControl.exe",
           r"C:\Program Files\digiCamControl\CameraControl.exe")
    REMOTE = (r"C:\Program Files (x86)\digiCamControl\CameraControlRemoteCmd.exe",
              r"C:\Program Files\digiCamControl\CameraControlRemoteCmd.exe")

    def __init__(self, autofokus=lambda: False, zeitlimit_s=15):
        super().__init__(autofokus, zeitlimit_s)
        self.app = next((p for p in self.APP if Path(p).exists()), None)
        self.remote = next((p for p in self.REMOTE if Path(p).exists()), None)
        self._letzter_appstart = 0.0
        self._vorfokus_zeit = 0.0

    def app_starten(self):
        """Startet die digiCamControl-App minimiert (höchstens alle 30 s ein Versuch)."""
        import subprocess
        if not self.app or time.monotonic() - self._letzter_appstart < 30:
            return
        self._letzter_appstart = time.monotonic()
        info = subprocess.STARTUPINFO()
        info.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        info.wShowWindow = 7  # SW_SHOWMINNOACTIVE: minimiert, ohne den Fokus zu stehlen
        subprocess.Popen([self.app], startupinfo=info, close_fds=True)

    def status(self, frisch=False):
        zeit, wert = self._status_cache
        if not frisch and wert and time.monotonic() - zeit < 15:
            return wert
        if not (self.app and self.remote):
            wert = {"bereit": False, "text": "digiCamControl ist nicht installiert"}
        elif self._usb_verbunden() is False:
            wert = {"bereit": False, "text": "Keine Canon-Kamera per USB gefunden (eingeschaltet? Kabel?)"}
        elif not self._hauptprogramm_offen():
            self.app_starten()
            wert = {"bereit": False, "text": "digiCamControl-App wird gestartet – bitte ca. 20 s warten"}
        else:
            wert = {"bereit": True, "text": "Kamera verbunden, digiCamControl-App läuft"}
        self._status_cache = (time.monotonic(), wert)
        return wert

    def aufnehmen(self, ziel: Path) -> Path:
        import subprocess
        if not self.remote:
            raise KameraFehler("nicht_verbunden", "digiCamControl ist nicht installiert")
        ziel.parent.mkdir(parents=True, exist_ok=True)
        # Wurde in den letzten 20 s vorfokussiert, ohne erneutes Scharfstellen auslösen:
        # gemessen 2026-11-10: 1,8 s statt 3,9 s bis zur Datei, Schärfe vergleichbar.
        vorab = time.monotonic() - self._vorfokus_zeit < 20
        self._vorfokus_zeit = 0.0
        t0 = time.monotonic()
        try:
            erg = subprocess.run([self.remote, "/c", "capturenoaf" if vorab else "capture", str(ziel)],
                                 capture_output=True, text=True,
                                 encoding="oem", errors="replace", timeout=self.zeitlimit_s,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except subprocess.TimeoutExpired as e:
            self._status_cache = (0.0, None)
            raise KameraFehler("zeitueberschreitung", "digiCamControl-App hat nicht rechtzeitig geantwortet") from e
        # Warten, bis die Datei vollständig übertragen ist (Grösse bleibt gleich)
        groesse = -1
        while time.monotonic() - t0 < self.zeitlimit_s:
            if ziel.exists():
                neu = ziel.stat().st_size
                if neu > 0 and neu == groesse:
                    pruefe_canon(ziel)
                    return ziel
                groesse = neu
            time.sleep(0.15)
        self._status_cache = (0.0, None)
        ausgabe = ((erg.stdout or "") + (erg.stderr or "")).strip().replace("\n", " | ")
        raise KameraFehler("nicht_verbunden" if not self._usb_verbunden() else "fehler",
                           f"Keine Bilddatei erhalten: {ausgabe[-300:]}")

    # ---- Livebild über den Webserver der digiCamControl-App (nur 127.0.0.1) ----
    # Voraussetzung: In digiCamControl «Use web server» und «Allow interaction via webserver» an.
    # Gemessen 2026-11-09: ca. 9 Bilder/s, 1056x704, Foto während Livebild nach 1,7 s.
    WEB = "http://127.0.0.1:5513"

    def _web(self, pfad: str, timeout=3.0) -> bytes:
        import urllib.error
        import urllib.request
        try:
            with urllib.request.urlopen(self.WEB + pfad, timeout=timeout) as r:
                return r.read()
        except (urllib.error.URLError, OSError) as e:
            raise KameraFehler("kein_livebild", f"Webserver von digiCamControl nicht erreichbar: {e}") from e

    def livebild_start(self):
        self._web("/?CMD=LiveViewWnd_Show")

    def livebild_bild(self) -> bytes:
        daten = self._web("/liveview.jpg", timeout=2.0)
        if not daten.startswith(b"\xff\xd8"):  # JPEG beginnt immer mit FF D8
            raise KameraFehler("kein_livebild", "Livebild noch nicht bereit")
        return daten

    def livebild_stop(self):
        try:
            self._web("/?CMD=LiveViewWnd_Hide")
        except KameraFehler:
            pass

    def vorfokussieren(self):
        """Autofokus im Livebild auslösen (laut digiCamControl-Anleitung: «do LiveView_Focus»).
        Der Befehl kehrt sofort zurück, die Kamera stellt im Hintergrund scharf."""
        import subprocess
        if not self.remote:
            return
        subprocess.run([self.remote, "/c", "do", "LiveView_Focus"], capture_output=True, timeout=10,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        self._vorfokus_zeit = time.monotonic()


def pruefe_canon(datei: Path):
    """Sicherung: digiCamControl kann bei fehlender Canon auf die Laptop-Webcam ausweichen
    (im Protokoll vom 2026-11-09 gesehen). Nur Fotos mit Hersteller «Canon» werden akzeptiert."""
    try:
        with Image.open(datei) as b:
            hersteller = str(b.getexif().get(271, ""))
    except OSError:
        hersteller = ""
    if "canon" not in hersteller.lower():
        datei.replace(datei.with_name(datei.stem + "_FALSCHE_KAMERA" + datei.suffix))
        raise KameraFehler("falsche_kamera", f"Foto stammt nicht von der Canon (Hersteller: {hersteller or 'unbekannt'})")


def erstelle_kamera(modus: str, sim_verhalten, autofokus=lambda: False) -> Kamera:
    if modus == "digicamcontrol_app":
        return DigiCamControlAppKamera(autofokus)
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
