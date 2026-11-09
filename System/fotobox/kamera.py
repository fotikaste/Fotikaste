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
