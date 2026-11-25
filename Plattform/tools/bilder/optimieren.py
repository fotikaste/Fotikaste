"""Webseitenbilder optimieren: erzeugt responsive WebP-Varianten + JPEG-Rückfall ohne Metadaten.

Aufruf (Python der Fotobox, braucht nur Pillow):
    System\\.venv\\Scripts\\python.exe Plattform\\tools\\bilder\\optimieren.py <quelle.jpg|png> <name>
Ergebnis in Plattform/public/bilder/: <name>-480.webp, -800.webp, -1200.webp, -1600.webp und <name>-1200.jpg
Ausgegeben wird die Bildgrösse (für width/height im HTML, gegen Layoutverschiebung).
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

BREITEN = [480, 800, 1200, 1600]
ZIEL = Path(__file__).resolve().parents[2] / "public" / "bilder"


def main() -> None:
    quelle, name = Path(sys.argv[1]), sys.argv[2]
    ZIEL.mkdir(parents=True, exist_ok=True)
    bild = ImageOps.exif_transpose(Image.open(quelle)).convert("RGB")
    w, h = bild.size
    for breite in BREITEN:
        if breite > w:
            continue
        b = bild.resize((breite, round(h * breite / w)), Image.Resampling.LANCZOS)
        b.save(ZIEL / f"{name}-{breite}.webp", "WEBP", quality=80, method=6)
        if breite == 1200:
            b.save(ZIEL / f"{name}-1200.jpg", "JPEG", quality=82, optimize=True, progressive=True)
    print(f"{name}: {w}x{h}")


if __name__ == "__main__":
    main()
