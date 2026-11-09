"""Bildverarbeitung: aus dem Originalfoto die druckfertige Postkarte machen.

Das Original wird nur gelesen, nie verändert. Die Postkarte ist eine neue Datei.

Layout «Postkarte quer» (Beispielformat 10x15 cm, 300 dpi = 1800x1200 Pixel):
  ┌──────────────────────────────┐
  │  Rand                         │
  │  ┌─────────────────────────┐  │
  │  │        Foto             │  │   Foto wird mittig auf den freien
  │  │                         │  │   Bereich zugeschnitten.
  │  └─────────────────────────┘  │
  │     Lea & Noah · Datum        │   Fusszeile mit Namen in Schreibschrift
  └──────────────────────────────┘
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from .themen import thema

SCHRIFTEN = Path(__file__).parent / "static" / "fonts"


def layout(breite: int, hoehe: int) -> dict:
    rand = round(hoehe * 0.035)
    fuss = round(hoehe * 0.14)
    return {"rand": rand, "fuss": fuss,
            "foto": (rand, rand, breite - rand, hoehe - rand - fuss)}


def postkarte(original: Path, ziel: Path, *, breite: int, hoehe: int, dpi: int,
              thema_name: str, namen: str, datum_text: str) -> Path:
    t = thema(thema_name)
    lay = layout(breite, hoehe)
    karte = Image.new("RGB", (breite, hoehe), t["karte"]["bg"])

    with Image.open(original) as foto:
        foto = ImageOps.exif_transpose(foto).convert("RGB")
        x0, y0, x1, y1 = lay["foto"]
        # ImageOps.fit schneidet mittig auf das Zielseitenverhältnis zu
        foto = ImageOps.fit(foto, (x1 - x0, y1 - y0), Image.LANCZOS, centering=(0.5, 0.5))
        karte.paste(foto, (x0, y0))

    d = ImageDraw.Draw(karte)
    fuss_oben = hoehe - lay["rand"] - lay["fuss"]
    name_font = ImageFont.truetype(str(SCHRIFTEN / t["schrift"]), round(lay["fuss"] * 0.48))
    text_font = ImageFont.truetype(str(SCHRIFTEN / "Inter.ttf"), round(lay["fuss"] * 0.15))
    nur_name = not datum_text
    # Schreibschriften stehen sehr eng: doppelte Leerzeichen geben «&» etwas Luft
    namen_text = (namen or "").replace(" ", "  ")
    d.text((breite / 2, fuss_oben + lay["fuss"] * (0.55 if nur_name else 0.45)), namen_text,
           font=name_font, fill=t["karte"]["name"], anchor="mm")
    if datum_text:
        d.text((breite / 2, fuss_oben + lay["fuss"] * 0.88), datum_text, font=text_font,
               fill=t["karte"]["text"], anchor="mm")

    ziel.parent.mkdir(parents=True, exist_ok=True)
    tmp = ziel.with_suffix(".tmp")
    karte.save(tmp, "JPEG", quality=95, dpi=(dpi, dpi))
    tmp.replace(ziel)  # erst nach vollständigem Schreiben umbenennen: keine halben Dateien
    return ziel


def vorschau(karte: Path, ziel: Path, max_breite: int = 1400) -> Path:
    with Image.open(karte) as k:
        k = k.copy()
    k.thumbnail((max_breite, max_breite))
    tmp = ziel.with_suffix(".tmp")
    k.save(tmp, "JPEG", quality=88)
    tmp.replace(ziel)
    return ziel


def als_simulation_markieren(karte: Path, ziel: Path) -> Path:
    """Kopie der Karte mit deutlichem Vermerk «SIMULATION» (nur für den simulierten Druck)."""
    with Image.open(karte) as k:
        k = k.convert("RGB")
    d = ImageDraw.Draw(k)
    f = ImageFont.truetype(str(SCHRIFTEN / "Inter.ttf"), max(24, k.height // 30))
    text = "SIMULATION – KEIN ECHTER DRUCK"
    box = d.textbbox((0, 0), text, font=f)
    pad = 12
    d.rectangle((0, 0, box[2] + 2 * pad, box[3] + 2 * pad), fill=(200, 30, 30))
    d.text((pad, pad), text, font=f, fill="white")
    tmp = ziel.with_suffix(".tmp")
    k.save(tmp, "JPEG", quality=95)
    tmp.replace(ziel)
    return ziel
