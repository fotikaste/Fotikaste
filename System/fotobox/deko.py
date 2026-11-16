"""Dekorationen für die Motiv-Rahmen (Konfetti, Schneeflocken, Blüten …).

Alles wird hier mit Pillow selbst gezeichnet: keine fremden Bilder, keine Lizenzfragen, läuft ohne Internet.
Gezeichnet wird doppelt so gross und dann verkleinert («Supersampling»), damit Kanten weich werden.
Zufall mit festem Startwert: jede Karte eines Rahmens sieht gleich aus.

Regeln: Deko liegt im Rand und darf nur die Ecken des Fotos leicht überdecken (Gesichter sind meist
in der Mitte). Die Mitte der Fusszeile bleibt frei für den Text.
"""
from __future__ import annotations

import math
import random

from PIL import Image, ImageDraw


def _rgba(farbe: str, alpha: int = 255) -> tuple:
    farbe = farbe.lstrip("#")
    return tuple(int(farbe[i:i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def _drehen(punkte, winkel, mitte):
    c, s = math.cos(winkel), math.sin(winkel)
    mx, my = mitte
    return [(mx + x * c - y * s, my + x * s + y * c) for x, y in punkte]


def _bezier(p0, p1, p2, n=40):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in (i / n for i in range(n + 1))]


class Zeichner:
    """Hilft beim Platzieren: kennt Foto- und Textbereich (in Kartenpixeln)."""

    def __init__(self, breite, hoehe, lay, faktor=2):
        self.W, self.H, self.f = breite, hoehe, faktor
        self.bild = Image.new("RGBA", (breite * faktor, hoehe * faktor), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.bild)
        self.foto = lay["foto"]
        tx0, ty0, tx1, ty1 = lay["text"]
        self.text_frei = (breite * 0.24, ty0, breite * 0.76, hoehe)   # hier keine Deko
        self.zufall = random.Random(2027)

    def p(self, x, y):
        return (x * self.f, y * self.f)

    def im_rand(self, x, y, ueberlappung=0.0):
        """True, wenn (x, y) im Rand liegt. ueberlappung = wie weit (Anteil H) ins Foto hinein erlaubt."""
        x0, y0, x1, y1 = self.foto
        u = self.H * ueberlappung
        im_foto = x0 + u < x < x1 - u and y0 + u < y < y1 - u
        a, b, c, e = self.text_frei
        return not im_foto and not (a < x < c and b < y < e)

    def zufallspunkte(self, anzahl, ueberlappung=0.0):
        punkte, versuche = [], 0
        while len(punkte) < anzahl and versuche < anzahl * 60:
            versuche += 1
            x, y = self.zufall.uniform(-10, self.W + 10), self.zufall.uniform(-10, self.H + 10)
            if self.im_rand(x, y, ueberlappung):
                punkte.append((x, y))
        return punkte

    def fertig(self):
        return self.bild.resize((self.W, self.H), Image.LANCZOS)


# ---------- Bausteine ----------
def blatt(z: Zeichner, basis, winkel, laenge, breite, farbe, ader=None):
    pts = [(laenge * i / 20, breite * math.sin(math.pi * i / 20) ** 0.85) for i in range(21)]
    pts += [(x, -y) for x, y in reversed(pts)]
    poly = _drehen(pts, winkel, basis)
    z.d.polygon([z.p(*q) for q in poly], fill=farbe)
    if ader:
        a = _drehen([(0, 0), (laenge * 0.85, 0)], winkel, basis)
        z.d.line([z.p(*q) for q in a], fill=ader, width=max(1, int(breite * 0.12 * z.f)))


def zweig(z: Zeichner, start, kontroll, ende, farbe_ast, farbe_blatt, blattlaenge, dicke, blueten=(), bluetenfarbe=None):
    weg = _bezier(start, kontroll, ende, 60)
    z.d.line([z.p(*q) for q in weg], fill=farbe_ast, width=int(dicke * z.f), joint="curve")
    for n, i in enumerate(range(5, len(weg) - 2, 5)):
        (xa, ya), (xb, yb) = weg[i - 1], weg[i + 1]
        tang = math.atan2(yb - ya, xb - xa)
        groesse = blattlaenge * (0.6 + 0.4 * (1 - i / len(weg))) * z.zufall.uniform(0.85, 1.1)
        seite = -1 if n % 2 else 1   # Blätter abwechselnd links und rechts, wie an einem echten Zweig
        blatt(z, weg[i], tang + seite * z.zufall.uniform(0.6, 0.9), groesse, groesse * 0.34, farbe_blatt)
    blatt(z, weg[-1], math.atan2(weg[-1][1] - weg[-3][1], weg[-1][0] - weg[-3][0]), blattlaenge, blattlaenge * 0.32, farbe_blatt)
    for t in blueten:
        bluete(z, weg[int(t * (len(weg) - 1))], blattlaenge * 0.42, bluetenfarbe)


def bluete(z: Zeichner, mitte, r, farbe, mitte_farbe=None):
    x, y = mitte
    for k in range(5):
        a = k * 2 * math.pi / 5 - math.pi / 2
        px, py = x + r * 0.55 * math.cos(a), y + r * 0.55 * math.sin(a)
        z.d.ellipse([z.p(px - r * 0.5, py - r * 0.5), z.p(px + r * 0.5, py + r * 0.5)], fill=farbe)
    m = r * 0.28
    z.d.ellipse([z.p(x - m, y - m), z.p(x + m, y + m)], fill=mitte_farbe or _rgba("#f3d58a"))


def schneeflocke(z: Zeichner, mitte, r, farbe, drehung=0.0):
    x, y = mitte
    w = max(1, int(r * 0.09 * z.f))
    for k in range(6):
        a = drehung + k * math.pi / 3
        ex, ey = x + r * math.cos(a), y + r * math.sin(a)
        z.d.line([z.p(x, y), z.p(ex, ey)], fill=farbe, width=w)
        for anteil, laenge in ((0.45, 0.32), (0.72, 0.22)):
            bx, by = x + r * anteil * math.cos(a), y + r * anteil * math.sin(a)
            for s in (-1, 1):
                aa = a + s * math.pi / 4
                z.d.line([z.p(bx, by), z.p(bx + r * laenge * math.cos(aa), by + r * laenge * math.sin(aa))],
                         fill=farbe, width=w)
    m = r * 0.1
    z.d.ellipse([z.p(x - m, y - m), z.p(x + m, y + m)], fill=farbe)


def funkeln(z: Zeichner, mitte, r, farbe):
    """Vierzackiger Stern («Glitzern»)."""
    x, y = mitte
    d = r * 0.18
    pts = [(x, y - r), (x + d, y - d), (x + r, y), (x + d, y + d), (x, y + r), (x - d, y + d), (x - r, y), (x - d, y - d)]
    z.d.polygon([z.p(*q) for q in pts], fill=farbe)


def feuerwerk(z: Zeichner, mitte, r, farben):
    x, y = mitte
    for k in range(28):
        a = k * 2 * math.pi / 28 + (0.06 if k % 2 else 0)
        laenge = r * (1.0 if k % 2 == 0 else 0.78)
        f = farben[k % len(farben)]
        p0 = (x + laenge * 0.25 * math.cos(a), y + laenge * 0.25 * math.sin(a))
        p1 = (x + laenge * 0.9 * math.cos(a), y + laenge * 0.9 * math.sin(a))
        z.d.line([z.p(*p0), z.p(*p1)], fill=f, width=max(1, int(r * 0.022 * z.f)))
        e = (x + laenge * math.cos(a), y + laenge * math.sin(a))
        m = r * 0.028
        z.d.ellipse([z.p(e[0] - m, e[1] - m), z.p(e[0] + m, e[1] + m)], fill=f)


def ballon(z: Zeichner, mitte, r, farbe, schnur):
    x, y = mitte
    rx, ry = r, r * 1.2
    z.d.ellipse([z.p(x - rx, y - ry), z.p(x + rx, y + ry)], fill=farbe)
    z.d.ellipse([z.p(x - rx * 0.55, y - ry * 0.7), z.p(x - rx * 0.15, y - ry * 0.2)], fill=(255, 255, 255, 70))
    k = r * 0.14
    z.d.polygon([z.p(x, y + ry - k * 0.3), z.p(x - k, y + ry + k), z.p(x + k, y + ry + k)], fill=farbe)
    schnurpunkte = [(x + math.sin(i / 6) * r * 0.12, y + ry + k + i * r * 0.06) for i in range(40)]
    z.d.line([z.p(*q) for q in schnurpunkte], fill=schnur, width=max(1, int(r * 0.025 * z.f)))


def sonne(z: Zeichner, mitte, r, kern, strahl):
    x, y = mitte
    for k in range(18):
        a = k * 2 * math.pi / 18
        b = math.pi / 22
        pts = [(x + r * 1.18 * math.cos(a - b), y + r * 1.18 * math.sin(a - b)),
               (x + r * 1.75 * math.cos(a), y + r * 1.75 * math.sin(a)),
               (x + r * 1.18 * math.cos(a + b), y + r * 1.18 * math.sin(a + b))]
        z.d.polygon([z.p(*q) for q in pts], fill=strahl)
    z.d.ellipse([z.p(x - r, y - r), z.p(x + r, y + r)], fill=kern)


def palmwedel(z: Zeichner, start, kontroll, ende, farbe, laenge):
    weg = _bezier(start, kontroll, ende, 50)
    z.d.line([z.p(*q) for q in weg], fill=farbe, width=int(laenge * 0.06 * z.f))
    for i in range(4, len(weg) - 1, 3):
        (xa, ya), (xb, yb) = weg[i - 1], weg[i + 1]
        tang = math.atan2(yb - ya, xb - xa)
        l = laenge * (1 - i / len(weg)) ** 0.5
        for s in (-1, 1):
            blatt(z, weg[i], tang + s * 0.85, l, l * 0.09, farbe)


def welle(z: Zeichner, y, x0, x1, hoehe, farbe, dicke, phase=0.0):
    pts = [(x, y + math.sin((x - x0) / hoehe / 2.2 + phase) * hoehe * 0.35) for x in range(int(x0), int(x1), 4)]
    z.d.line([z.p(*q) for q in pts], fill=farbe, width=int(dicke * z.f), joint="curve")


# ---------- Motive ----------
def konfetti(z: Zeichner, f):
    H = z.H
    farben = [_rgba(c) for c in f["deko"]]
    for x, y in z.zufallspunkte(170, ueberlappung=0.022):
        c = z.zufall.choice(farben)
        art = z.zufall.random()
        s = H * z.zufall.uniform(0.010, 0.022)
        if art < 0.5:
            pts = _drehen([(-s, -s * 0.45), (s, -s * 0.45), (s, s * 0.45), (-s, s * 0.45)], z.zufall.uniform(0, math.pi), (x, y))
            z.d.polygon([z.p(*q) for q in pts], fill=c)
        elif art < 0.8:
            z.d.ellipse([z.p(x - s * 0.6, y - s * 0.6), z.p(x + s * 0.6, y + s * 0.6)], fill=c)
        else:
            a0 = z.zufall.uniform(0, math.pi)
            pts = [(x + i * s * 0.25 * math.cos(a0) + math.sin(i / 2) * s * 0.35 * -math.sin(a0),
                    y + i * s * 0.25 * math.sin(a0) + math.sin(i / 2) * s * 0.35 * math.cos(a0)) for i in range(14)]
            z.d.line([z.p(*q) for q in pts], fill=c, width=int(s * 0.3 * z.f), joint="curve")


def winterzauber(z: Zeichner, f):
    H = z.H
    weiss = f["deko"][0]
    for x, y in z.zufallspunkte(90, ueberlappung=0.02):
        m = H * z.zufall.uniform(0.003, 0.007)
        z.d.ellipse([z.p(x - m, y - m), z.p(x + m, y + m)], fill=_rgba(weiss, z.zufall.randint(90, 200)))
    for x, y in z.zufallspunkte(26, ueberlappung=0.0):
        schneeflocke(z, (x, y), H * z.zufall.uniform(0.018, 0.034), _rgba(weiss, z.zufall.randint(150, 235)),
                     z.zufall.uniform(0, 1))
    x0, y0, x1, y1 = z.foto
    schneeflocke(z, (x0 + H * 0.02, y0 + H * 0.03), H * 0.085, _rgba(weiss, 245), 0.2)
    schneeflocke(z, (x1 - H * 0.025, y1 - H * 0.02), H * 0.07, _rgba(weiss, 235), 0.5)
    schneeflocke(z, (x1 + H * 0.01, y0 + H * 0.12), H * 0.045, _rgba(f["deko"][1], 230), 0.1)


def sommerfrische(z: Zeichner, f):
    H, W = z.H, z.W
    x0, y0, x1, y1 = z.foto
    gelb, orange, gruen, tuerkis = (_rgba(c) for c in f["deko"])
    sonne(z, (x1 - H * 0.005, y0 + H * 0.005), H * 0.065, orange, gelb)
    # zwei Palmwedel aus der Ecke unten links, mehr im Rand als im Foto
    palmwedel(z, (-H * 0.02, H * 1.0), (H * 0.02, H * 0.80), (H * 0.20, H * 0.70), gruen, H * 0.13)
    palmwedel(z, (-H * 0.02, H * 1.0), (H * 0.12, H * 0.92), (H * 0.30, H * 0.93), tuerkis, H * 0.11)
    palmwedel(z, (-H * 0.02, H * 0.96), (-H * 0.01, H * 0.75), (H * 0.06, H * 0.58), tuerkis, H * 0.09)
    for x, y in z.zufallspunkte(18, ueberlappung=0.0):
        if x < z.W * 0.5:
            continue
        m = H * z.zufall.uniform(0.004, 0.008)
        z.d.ellipse([z.p(x - m, y - m), z.p(x + m, y + m)], fill=_rgba(f["deko"][0], 200))
    for k in range(3):
        welle(z, H - H * (0.055 + k * 0.03), W * 0.80, W + 10, H * 0.06, tuerkis if k % 2 else _rgba(f["deko"][3], 150),
              H * 0.008, phase=k)


def bluetenranke(z: Zeichner, f):
    H, W = z.H, z.W
    x0, y0, x1, y1 = z.foto
    gold, salbei, rose = _rgba(f["deko"][0]), _rgba(f["deko"][1]), _rgba(f["deko"][2])
    salbei_hell = _rgba(f["deko"][1], 170)
    # feine goldene Doppellinie im Rand
    a, b = H * 0.03, H * 0.042
    for r_ in (a, b):
        z.d.rectangle([z.p(r_, r_), z.p(W - r_, H - r_)], outline=gold, width=max(1, int(H * 0.0025 * z.f)))
    rose_hell = _rgba("#f6d9d3")
    # Ranken wachsen aus der Ecke oben links und unten rechts, entlang der Fotokante
    for sx, sy, ex, ey, dx, dy in ((x0, y0, 1, 0, 1, 1), (x1, y1, -1, 0, -1, -1)):
        ecke = (sx - dx * H * 0.01, sy - dy * H * 0.01)
        zweig(z, ecke, (sx + dx * H * 0.12, sy - dy * H * 0.03), (sx + dx * H * 0.34, sy - dy * H * 0.035),
              salbei, salbei, H * 0.05, H * 0.006, blueten=(0.55,), bluetenfarbe=rose_hell)
        zweig(z, ecke, (sx - dx * H * 0.03, sy + dy * H * 0.10), (sx - dx * H * 0.035, sy + dy * H * 0.27),
              salbei, salbei, H * 0.045, H * 0.006, blueten=(0.6,), bluetenfarbe=rose_hell)
        zweig(z, ecke, (sx + dx * H * 0.06, sy + dy * H * 0.03), (sx + dx * H * 0.13, sy + dy * H * 0.08),
              salbei_hell, salbei_hell, H * 0.035, H * 0.004)
        bluete(z, (ecke[0] + dx * H * 0.035, ecke[1] - dy * H * 0.01), H * 0.042, rose)
        bluete(z, (ecke[0] - dx * H * 0.012, ecke[1] + dy * H * 0.035), H * 0.03, rose_hell)
        bluete(z, (ecke[0] + dx * H * 0.005, ecke[1] + dy * H * 0.005), H * 0.024, _rgba("#d9958c"))


def geburtstag(z: Zeichner, f):
    H, W = z.H, z.W
    x0, y0, x1, y1 = z.foto
    farben = [_rgba(c) for c in f["deko"]]
    schnur = _rgba(f["text"], 200)
    # Wimpelkette oben, durchhängend zwischen den Ecken
    ka, kb = (H * 0.10, -H * 0.005), (W - H * 0.10, -H * 0.005)
    seil = _bezier(ka, (W / 2, H * 0.10), kb, 80)
    z.d.line([z.p(*q) for q in seil], fill=schnur, width=max(1, int(H * 0.003 * z.f)))
    for i in range(3, len(seil) - 2, 5):
        (xa, ya), (xb, yb) = seil[i - 1], seil[i + 1]
        tang = math.atan2(yb - ya, xb - xa)
        b, h = H * 0.024, H * 0.045
        pts = _drehen([(-b, 0), (b, 0), (0, h)], tang, seil[i])
        z.d.polygon([z.p(*q) for q in pts], fill=farben[(i // 5) % len(farben)])
    for (bx, by, r, c) in ((x0 + H * 0.005, y0 + H * 0.17, 0.066, 0), (x0 + H * 0.085, y0 + H * 0.12, 0.058, 1),
                           (x0 - H * 0.035, y0 + H * 0.08, 0.05, 2),
                           (x1 - H * 0.02, y0 + H * 0.15, 0.064, 3), (x1 + H * 0.045, y0 + H * 0.22, 0.05, 4)):
        ballon(z, (bx, by), H * r, farben[c % len(farben)], schnur)
    for x, y in z.zufallspunkte(60, ueberlappung=0.0):
        m = H * z.zufall.uniform(0.004, 0.009)
        z.d.ellipse([z.p(x - m, y - m), z.p(x + m, y + m)], fill=z.zufall.choice(farben))


def sternennacht(z: Zeichner, f):
    H = z.H
    x0, y0, x1, y1 = z.foto
    gold, champagner, hell = (_rgba(c) for c in f["deko"])
    feuerwerk(z, (x0 + H * 0.04, y0 + H * 0.02), H * 0.13, [gold, champagner])
    feuerwerk(z, (x1 - H * 0.03, y1 - H * 0.01), H * 0.11, [champagner, gold])
    feuerwerk(z, (x1 + H * 0.01, y0 + H * 0.05), H * 0.07, [gold, hell])
    for x, y in z.zufallspunkte(55, ueberlappung=0.0):
        r = H * z.zufall.uniform(0.006, 0.018)
        funkeln(z, (x, y), r, z.zufall.choice([gold, champagner, hell]))


MOTIVE = {"konfetti": konfetti, "winterzauber": winterzauber, "sommerfrische": sommerfrische,
          "bluetenranke": bluetenranke, "geburtstag": geburtstag, "sternennacht": sternennacht}


def deko_ebene(motiv: str, breite: int, hoehe: int, lay: dict, farben: dict) -> Image.Image:
    """Durchsichtige Ebene (RGBA) in Kartengrösse mit der Dekoration."""
    z = Zeichner(breite, hoehe, lay, faktor=2 if breite <= 2400 else 1)
    MOTIVE[motiv](z, farben)
    return z.fertig()
