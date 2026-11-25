"""Bildtest: Welche Auflösung und JPEG-Qualität für die Online-Galerie?

Aufruf (mit der Python-Umgebung der Fotobox, braucht nur Pillow):
    System\\.venv\\Scripts\\python.exe Plattform\\tools\\bildtest\\bildtest.py <ausgabeordner> <bild1.jpg> [bild2.jpg ...]

Misst für jede Kombination aus Längskante und Qualität:
  - Dateigrösse
  - PSNR (Signal-Rausch-Abstand in dB, höher = näher am unkomprimierten Bild; > 40 dB gilt als sehr gut)
  - SSIM (Strukturähnlichkeit 0..1, > 0.98 gilt als praktisch nicht unterscheidbar)
Vergleich jeweils mit derselben Auflösung ohne JPEG-Verlust, also nur der Kompressionsverlust.
Ausserdem: Prüft, dass in der Ausgabe keine EXIF-/GPS-Daten mehr stehen.
Die Ausgabebilder enthalten private Fotos -> Ausgabeordner ausserhalb von Git wählen.
"""
from __future__ import annotations

import io
import math
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageOps, ImageStat

KANTEN = [2400, 2048, 1600]
QUALITAETEN = [92, 88, 85, 82, 78]
VORSCHAU = (480, 80)


def optimieren(bild: Image.Image, kante: int, qualitaet: int) -> bytes:
    """So würde die Fotobox das Galeriebild erzeugen: drehen gemäss EXIF, verkleinern, sRGB/RGB,
    ohne Metadaten speichern (kein exif=, kein icc ausser sRGB-Standard), progressiv, 4:2:0 ab q<90."""
    b = ImageOps.exif_transpose(bild).convert("RGB")
    b.thumbnail((kante, kante), Image.Resampling.LANCZOS)
    puffer = io.BytesIO()
    b.save(puffer, "JPEG", quality=qualitaet, optimize=True, progressive=True,
           subsampling=0 if qualitaet >= 90 else 2)
    return puffer.getvalue()


def psnr(a: Image.Image, b: Image.Image) -> float:
    diff = ImageChops.difference(a, b)
    mse = sum(v * v for v in ImageStat.Stat(diff).rms) / 3
    return float("inf") if mse == 0 else 20 * math.log10(255 / math.sqrt(mse))


def ssim(a: Image.Image, b: Image.Image, groesse: int = 640, block: int = 8) -> float:
    """Vereinfachtes SSIM auf Graustufen in 8x8-Blöcken (reines Python, genügt für Vergleiche)."""
    def vorbereiten(x):
        g = x.convert("L")
        g.thumbnail((groesse, groesse), Image.Resampling.BOX)
        return g
    ga, gb = vorbereiten(a), vorbereiten(b)
    w, h = ga.size
    pa, pb = ga.load(), gb.load()
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    werte = []
    for y0 in range(0, h - block + 1, block):
        for x0 in range(0, w - block + 1, block):
            xs = [pa[x, y] for y in range(y0, y0 + block) for x in range(x0, x0 + block)]
            ys = [pb[x, y] for y in range(y0, y0 + block) for x in range(x0, x0 + block)]
            n = len(xs)
            mx, my = sum(xs) / n, sum(ys) / n
            vx = sum((v - mx) ** 2 for v in xs) / n
            vy = sum((v - my) ** 2 for v in ys) / n
            cov = sum((xs[i] - mx) * (ys[i] - my) for i in range(n)) / n
            werte.append(((2 * mx * my + c1) * (2 * cov + c2)) / ((mx * mx + my * my + c1) * (vx + vy + c2)))
    return sum(werte) / len(werte)


def main() -> None:
    ausgabe = Path(sys.argv[1])
    ausgabe.mkdir(parents=True, exist_ok=True)
    dateien = [Path(p) for p in sys.argv[2:]]
    zeilen = []
    for datei in dateien:
        orig = Image.open(datei)
        orig_bytes = datei.stat().st_size
        hat_exif = len(orig.getexif()) > 0
        for kante in KANTEN:
            referenz = ImageOps.exif_transpose(orig).convert("RGB")
            referenz.thumbnail((kante, kante), Image.Resampling.LANCZOS)
            for q in QUALITAETEN:
                daten = optimieren(orig, kante, q)
                test = Image.open(io.BytesIO(daten))
                exif_rest = len(test.getexif())
                zeilen.append((datei.name, orig.size, orig_bytes, hat_exif, kante, q, len(daten),
                               psnr(referenz, test.convert("RGB")), ssim(referenz, test), exif_rest))
                if kante == 2048 and q in (85, 78):
                    (ausgabe / f"{datei.stem}_{kante}_q{q}.jpg").write_bytes(daten)
        v = optimieren(orig, VORSCHAU[0], VORSCHAU[1])
        (ausgabe / f"{datei.stem}_vorschau.jpg").write_bytes(v)
        zeilen.append((datei.name, orig.size, orig_bytes, hat_exif, VORSCHAU[0], VORSCHAU[1], len(v), float("nan"), float("nan"),
                       len(Image.open(io.BytesIO(v)).getexif())))

    print("datei;original_px;original_kb;exif_im_original;kante;qualitaet;kb;psnr_db;ssim;exif_eintraege_in_ausgabe")
    for z in zeilen:
        print(f"{z[0]};{z[1][0]}x{z[1][1]};{z[2] // 1024};{z[3]};{z[4]};{z[5]};{z[6] // 1024};{z[7]:.1f};{z[8]:.4f};{z[9]}")


if __name__ == "__main__":
    main()
