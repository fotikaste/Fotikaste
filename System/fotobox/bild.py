"""Bildverarbeitung: aus dem Originalfoto die druckfertige Postkarte machen.

Das Original wird nur gelesen, nie verändert. Die Postkarte ist eine neue Datei.

Mehrere Rahmen (Aufbau der Karte), siehe RAHMEN. Beispiel «klassisch»
(10x15 cm, 300 dpi = 1800x1200 Pixel):
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

from .deko import deko_ebene
from .themen import MOTIV_FARBEN, thema

SCHRIFTEN = Path(__file__).parent / "static" / "fonts"


# Rahmen = Aufbau der Postkarte. Farben und Schrift kommen weiterhin vom Thema (themen.py).
# Wichtig für den DNP DS620 (Test 2026-11-16): Er schneidet beim randlosen Druck ringsum ca. 3 mm ab,
# nicht ganz mittig. Deshalb: weisse Ränder mind. ca. 6 mm, Text mind. ca. 6 mm vom Kartenrand.
RAHMEN = {
    # Schlicht: Farben und Schrift vom Thema
    "klassisch": {"titel": "Klassisch", "text": "Schmaler Rand, Namen darunter", "gruppe": "schlicht"},
    "sofortbild": {"titel": "Sofortbild", "text": "Breiter Streifen unten, grosse Schrift", "gruppe": "schlicht"},
    "passepartout": {"titel": "Passepartout", "text": "Breiter Rand mit feiner Linie ums Foto", "gruppe": "schlicht"},
    "randlos_band": {"titel": "Randlos mit Band", "text": "Foto bis zum Rand, Namen im Band unten", "gruppe": "schlicht"},
    "randlos_verlauf": {"titel": "Randlos mit Verlauf", "text": "Ganzes Foto, Namen hell auf dunklem Verlauf", "gruppe": "schlicht"},
    # Motiv: eigene Farben, Schrift und Dekoration (themen.MOTIV_FARBEN, deko.py)
    "bluetenranke": {"titel": "Hochzeit · Blütenranke", "text": "Zarte Zweige, Blüten und Goldlinie", "gruppe": "motiv"},
    "konfetti": {"titel": "Party · Konfetti", "text": "Bunte Konfetti auf dunklem Grund", "gruppe": "motiv"},
    "geburtstag": {"titel": "Geburtstag · Ballons", "text": "Fröhliche Ballons in den Ecken", "gruppe": "motiv"},
    "sommerfrische": {"titel": "Sommer · Sonne & Palmen", "text": "Sonne, Palmwedel und Wellen", "gruppe": "motiv"},
    "winterzauber": {"titel": "Winter · Schneeflocken", "text": "Schneeflocken auf Nachtblau", "gruppe": "motiv"},
    "sternennacht": {"titel": "Silvester · Feuerwerk", "text": "Goldenes Feuerwerk und Funkeln", "gruppe": "motiv"},
}
STANDARD_RAHMEN = "klassisch"


def layout(breite: int, hoehe: int, rahmen: str = STANDARD_RAHMEN) -> dict:
    """Wo liegt das Foto, wo der Text? Alle Masse relativ zur Kartenhöhe, damit jede Grösse passt.
    foto/text: (x0, y0, x1, y1). name_y/datum_y: Anteil der Texthöhe. name_gr/datum_gr: Anteil der Kartenhöhe."""
    H, W = hoehe, breite
    if RAHMEN.get(rahmen, {}).get("gruppe") == "motiv":
        # breiter Rand für die Dekoration (ca. 8,5 mm), Fusszeile 19 %
        r = round(H * 0.085)
        fuss = round(H * 0.19)
        return {"foto": (r, r, W - r, H - fuss), "text": (r, H - fuss, W - r, H - round(H * 0.05)),
                "name_y": 0.39, "datum_y": 0.84, "name_gr": 0.070, "datum_gr": 0.023, "motiv": rahmen}
    if rahmen == "sofortbild":
        r = round(H * 0.065)
        fuss = round(H * 0.25)
        return {"foto": (r, r, W - r, H - fuss), "text": (r, H - fuss, W - r, H - round(H * 0.03)),
                "name_y": 0.45, "datum_y": 0.80, "name_gr": 0.095, "datum_gr": 0.026}
    if rahmen == "passepartout":
        r = round(H * 0.09)
        fuss = round(H * 0.17)
        y1 = H - round(H * 0.05) - fuss
        return {"foto": (r, r, W - r, y1), "text": (r, y1, W - r, H - round(H * 0.05)),
                "name_y": 0.52, "datum_y": 0.86, "name_gr": 0.068, "datum_gr": 0.021,
                "linie": round(H * 0.016)}   # feine Linie mit kleinem Abstand ums Foto
    if rahmen == "randlos_band":
        fuss = round(H * 0.20)
        return {"foto": (0, 0, W, H - fuss), "text": (0, H - fuss, W, H - round(H * 0.06)),
                "name_y": 0.47, "datum_y": 0.88, "name_gr": 0.075, "datum_gr": 0.023}
    if rahmen == "randlos_verlauf":
        return {"foto": (0, 0, W, H), "text": (0, round(H * 0.76), W, H - round(H * 0.06)),
                "name_y": 0.45, "datum_y": 0.88, "name_gr": 0.085, "datum_gr": 0.025,
                "verlauf": round(H * 0.42), "hell": True}
    # klassisch: Rand 6 % (ca. 6 mm), Fusszeile 14 %
    r = round(H * 0.06)
    fuss = round(H * 0.14)
    return {"foto": (r, r, W - r, H - r - fuss), "text": (r, H - r - fuss, W - r, H - r),
            "name_y": 0.45, "datum_y": 0.88, "name_gr": fuss * 0.48 / H, "datum_gr": fuss * 0.15 / H}


KAMERA_SEITENVERHAELTNIS = 3 / 2  # Canon EOS 600D (5184x3456) und ihr Livebild (1056x704)


def ausschnitt(breite: int, hoehe: int, rahmen: str = STANDARD_RAHMEN, kamera=KAMERA_SEITENVERHAELTNIS) -> dict:
    """Welcher Teil des Kamerabilds kommt auf die Postkarte? Gleiche Rechnung wie ImageOps.fit
    (mittig zuschneiden). Ergebnis als Anteile 0..1 – für den Rahmen im Livebild."""
    x0, y0, x1, y1 = layout(breite, hoehe, rahmen)["foto"]
    ziel = (x1 - x0) / (y1 - y0)
    if ziel > kamera:   # Foto-Feld ist breiter: oben und unten wird abgeschnitten
        w, h = 1.0, kamera / ziel
    else:               # Foto-Feld ist schmaler: links und rechts wird abgeschnitten
        w, h = ziel / kamera, 1.0
    return {"x": (1 - w) / 2, "y": (1 - h) / 2, "w": w, "h": h}


def kartentexte(v: dict) -> tuple[str, str]:
    """Text auf der Karte: eigener Text, sonst Namen und Datum der Veranstaltung (Grundeinstellung)."""
    z1 = (v.get("karte_zeile1") or "").strip() or v.get("namen", "")
    z2 = "" if v.get("karte_zeile2_aus") else ((v.get("karte_zeile2") or "").strip() or v.get("datum_text", ""))
    return z1, z2


def _passende_schrift(d: ImageDraw.ImageDraw, text: str, datei: Path, groesse: int, max_breite: float):
    """Schrift so gross wie gewünscht, aber höchstens so breit wie Platz da ist (lange eigene Texte)."""
    while True:
        f = ImageFont.truetype(str(datei), groesse)
        if groesse <= 12 or d.textlength(text, font=f) <= max_breite:
            return f
        groesse = int(groesse * 0.93)


def karte_zeichnen(foto: Image.Image, *, breite: int, hoehe: int, thema_name: str,
                   zeile1: str, zeile2: str, rahmen: str = STANDARD_RAHMEN) -> Image.Image:
    """Baut die Postkarte als Bild (ohne zu speichern) – auch für die Vorschau auf der Betriebsseite."""
    t = thema(thema_name)
    lay = layout(breite, hoehe, rahmen)
    motiv = MOTIV_FARBEN.get(lay.get("motiv"))
    if motiv:   # Motiv-Rahmen: eigene Farben und Schrift statt Thema
        t = {**t, "schrift": motiv["schrift"], "karte": {"bg": motiv["bg"], "name": motiv["name"], "text": motiv["text"]}}
    karte = Image.new("RGB", (breite, hoehe), t["karte"]["bg"])

    x0, y0, x1, y1 = lay["foto"]
    # ImageOps.fit schneidet mittig auf das Zielseitenverhältnis zu
    karte.paste(ImageOps.fit(foto, (x1 - x0, y1 - y0), Image.LANCZOS, centering=(0.5, 0.5)), (x0, y0))
    d = ImageDraw.Draw(karte)

    if lay.get("linie"):
        a = lay["linie"]
        d.rectangle((x0 - a, y0 - a, x1 + a - 1, y1 + a - 1), outline=t["karte"]["text"], width=max(2, hoehe // 400))

    if lay.get("verlauf"):
        # dunkler Verlauf von unten, damit heller Text auf jedem Foto lesbar bleibt
        h = lay["verlauf"]
        maske = Image.linear_gradient("L").resize((breite, h)).point(lambda v: int(v * 0.78))
        dunkel = Image.new("RGB", (breite, h), (12, 10, 8))
        unten = karte.crop((0, hoehe - h, breite, hoehe))
        karte.paste(Image.composite(dunkel, unten, maske), (0, hoehe - h))
        d = ImageDraw.Draw(karte)

    if motiv:
        ebene = deko_ebene(lay["motiv"], breite, hoehe, lay, motiv)
        karte.paste(ebene, (0, 0), ebene)
        d = ImageDraw.Draw(karte)

    hell = lay.get("hell")
    farbe_name = "#ffffff" if hell else t["karte"]["name"]
    farbe_text = "#e9e4dc" if hell else t["karte"]["text"]
    tx0, ty0, tx1, ty1 = lay["text"]
    th = ty1 - ty0
    platz = min(tx1 - tx0, breite - 2 * hoehe * 0.07) * 0.92   # mind. ca. 6 mm Abstand zum Kartenrand
    mitte_x = breite / 2

    # Schreibschriften stehen sehr eng: doppelte Leerzeichen geben «&» etwas Luft
    namen_text = (zeile1 or "").strip().replace(" ", "  ")
    zeile2 = (zeile2 or "").strip()
    if namen_text:
        f = _passende_schrift(d, namen_text, SCHRIFTEN / t["schrift"], round(hoehe * lay["name_gr"]), platz)
        y = ty0 + th * (lay["name_y"] if zeile2 else (lay["name_y"] + lay["datum_y"]) / 2 - 0.05)
        d.text((mitte_x, y), namen_text, font=f, fill=farbe_name, anchor="mm")
    if zeile2:
        f = _passende_schrift(d, zeile2, SCHRIFTEN / "Inter.ttf", round(hoehe * lay["datum_gr"]), platz)
        y = ty0 + th * (lay["datum_y"] if namen_text else (lay["name_y"] + lay["datum_y"]) / 2)
        d.text((mitte_x, y), zeile2, font=f, fill=farbe_text, anchor="mm")
    return karte


def postkarte(original: Path, ziel: Path, *, breite: int, hoehe: int, dpi: int,
              thema_name: str, namen: str, datum_text: str, rahmen: str = STANDARD_RAHMEN) -> Path:
    """namen = 1. Textzeile (Schreibschrift), datum_text = 2. Zeile. Leer = Zeile weglassen."""
    with Image.open(original) as foto:
        foto = ImageOps.exif_transpose(foto).convert("RGB")
        karte = karte_zeichnen(foto, breite=breite, hoehe=hoehe, thema_name=thema_name,
                               zeile1=namen, zeile2=datum_text, rahmen=rahmen)

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
