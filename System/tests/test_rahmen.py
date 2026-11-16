"""Tests für Postkarten-Rahmen und eigenen Kartentext (2026-11-16)."""
from __future__ import annotations

import io
import tempfile
import time
import unittest
from pathlib import Path

from PIL import Image

from fotobox.bild import RAHMEN, ausschnitt, karte_zeichnen, kartentexte, layout
from fotobox.web import erstelle_app
from tests.test_fotobox import neue_box, sitzung_mit_foto

H, W = 1200, 1800
SICHER = round(H * 0.06)   # ca. 6 mm: der DS620 schneidet ringsum ca. 3 mm ab


class Layouts(unittest.TestCase):
    def test_jeder_rahmen_hat_sinnvolles_layout(self):
        for r in RAHMEN:
            lay = layout(W, H, r)
            x0, y0, x1, y1 = lay["foto"]
            self.assertTrue(0 <= x0 < x1 <= W and 0 <= y0 < y1 <= H, r)
            tx0, ty0, tx1, ty1 = lay["text"]
            unterkante_datum = ty0 + (ty1 - ty0) * lay["datum_y"] + H * lay["datum_gr"] / 2
            self.assertLessEqual(unterkante_datum, H - SICHER, f"{r}: Text zu nah am unteren Rand")
            a = ausschnitt(W, H, r)
            self.assertTrue(0 < a["w"] <= 1 and 0 < a["h"] <= 1, r)

    def test_weisse_raender_breit_genug(self):
        # Rahmen mit weissem Rand: mind. ca. 6 mm, sonst wirkt der ungleiche Beschnitt
        for r in ("klassisch", "sofortbild", "passepartout") + tuple(k for k, v in RAHMEN.items() if v["gruppe"] == "motiv"):
            x0, y0, x1, _ = layout(W, H, r)["foto"]
            self.assertGreaterEqual(min(x0, y0, W - x1), SICHER - 1, r)

    def test_alle_rahmen_zeichnen(self):
        foto = Image.new("RGB", (900, 600), (120, 90, 60))
        for r in RAHMEN:
            k = karte_zeichnen(foto, breite=W, hoehe=H, thema_name="winter",
                               zeile1="Lea & Noah", zeile2="14. Juni 2027", rahmen=r)
            self.assertEqual(k.size, (W, H), r)

    def test_langer_text_wird_kleiner_statt_abgeschnitten(self):
        foto = Image.new("RGB", (900, 600), "black")
        lang = "Herzlichen Glückwunsch zum fünfzigsten Geburtstag, liebe Annemarie"
        k = karte_zeichnen(foto, breite=W, hoehe=H, thema_name="minimal", zeile1=lang, zeile2="",
                           rahmen="klassisch")
        unten = k.crop((0, layout(W, H)["text"][1], W, H)).convert("L")
        # Am linken und rechten Rand (6 mm) darf keine Schrift stehen
        for streifen in (unten.crop((0, 0, SICHER, unten.height)), unten.crop((W - SICHER, 0, W, unten.height))):
            self.assertGreater(min(streifen.tobytes()), 200)

    def test_motivrahmen_bringen_eigene_farben(self):
        from fotobox.themen import MOTIV_FARBEN
        foto = Image.new("RGB", (900, 600), (128, 128, 128))
        for r, v in RAHMEN.items():
            if v["gruppe"] != "motiv":
                continue
            self.assertIn(r, MOTIV_FARBEN)
            a = karte_zeichnen(foto, breite=W, hoehe=H, thema_name="minimal", zeile1="A", zeile2="B", rahmen=r)
            b = karte_zeichnen(foto, breite=W, hoehe=H, thema_name="winter", zeile1="A", zeile2="B", rahmen=r)
            self.assertEqual(a.tobytes(), b.tobytes(), f"{r}: Thema darf Motiv-Rahmen nicht verändern")
            # Mitte des Fotos bleibt frei von Dekoration
            x0, y0, x1, y1 = layout(W, H, r)["foto"]
            mitte = a.crop((x0 + (x1 - x0) // 4, y0 + (y1 - y0) // 4, x1 - (x1 - x0) // 4, y1 - (y1 - y0) // 4))
            self.assertEqual(mitte.getextrema(), ((128, 128),) * 3, r)

    def test_unbekannter_rahmen_ist_klassisch(self):
        self.assertEqual(layout(W, H, "gibtsnicht"), layout(W, H, "klassisch"))


class Kartentexte(unittest.TestCase):
    V = {"namen": "Lea & Noah", "datum_text": "14. Juni 2027", "karte_zeile1": "", "karte_zeile2": "",
         "karte_zeile2_aus": 0}

    def test_grundeinstellung_aus_veranstaltung(self):
        self.assertEqual(kartentexte(self.V), ("Lea & Noah", "14. Juni 2027"))

    def test_eigener_text_ueberschreibt(self):
        v = {**self.V, "karte_zeile1": "Danke!", "karte_zeile2": "Schön, dass ihr da wart"}
        self.assertEqual(kartentexte(v), ("Danke!", "Schön, dass ihr da wart"))

    def test_zeile2_weglassen(self):
        self.assertEqual(kartentexte({**self.V, "karte_zeile2_aus": 1}), ("Lea & Noah", ""))


class Betriebsseite(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.box = neue_box(Path(self.tmp.name))
        self.c = erstelle_app(self.box).test_client()
        self.c.post("/api/betrieb/anmelden", json={"pin": "1234"})

    def tearDown(self):
        time.sleep(0.3)
        self.box.store.schliessen()
        self.tmp.cleanup()

    def test_rahmen_und_text_speichern_und_verwenden(self):
        r = self.c.post("/api/betrieb/veranstaltung", json={"rahmen": "sofortbild", "karte_zeile1": "Danke!",
                                                            "karte_zeile2_aus": True})
        self.assertEqual(r.status_code, 200)
        v = self.box.store.aktive_veranstaltung()
        self.assertEqual((v["rahmen"], v["karte_zeile1"], v["karte_zeile2_aus"]), ("sofortbild", "Danke!", 1))
        self.assertNotEqual(v["namen"], "Danke!")   # Namen der Veranstaltung bleiben unverändert
        self.assertEqual(self.c.get("/api/konfig").json["ausschnitt"], ausschnitt(W, H, "sofortbild"))
        sid = sitzung_mit_foto(self.box)            # Karte entsteht mit dem neuen Rahmen
        with Image.open(self.box.store.sitzung(sid)["karte"]) as k:
            self.assertEqual(k.size, (W, H))

    def test_unbekannter_rahmen_abgelehnt(self):
        self.assertEqual(self.c.post("/api/betrieb/veranstaltung", json={"rahmen": "xyz"}).status_code, 400)

    def test_vorschau_ohne_und_mit_foto(self):
        for _ in range(2):
            r = self.c.get("/api/betrieb/kartenvorschau?rahmen=randlos_verlauf&breite=600&karte_zeile1=Hallo")
            self.assertEqual(r.status_code, 200)
            self.assertEqual(Image.open(io.BytesIO(r.data)).size, (600, 400))
            sitzung_mit_foto(self.box)

    def test_vorschau_nur_angemeldet(self):
        self.c.post("/api/betrieb/abmelden", json={})
        self.assertEqual(self.c.get("/api/betrieb/kartenvorschau").status_code, 401)

    def test_status_liefert_rahmenliste(self):
        self.assertEqual([r["id"] for r in self.c.get("/api/betrieb/status").json["rahmen"]], list(RAHMEN))


if __name__ == "__main__":
    unittest.main()
