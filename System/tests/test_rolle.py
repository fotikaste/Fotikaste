"""Papierrolle: eigener Zähler und Meldung des Druckers (2026-11-21)."""
from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path

from fotobox.drucker_cups import rest_laut_drucker
from fotobox.web import erstelle_app
from fotobox.wlan import SimuliertesWlan
from tests.test_fotobox import neue_box


class Rollenzaehler(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.box = neue_box(Path(self.tmp.name))
        self.c = erstelle_app(self.box, wlan=SimuliertesWlan()).test_client()
        self.c.post("/api/betrieb/anmelden", json={"pin": "1234"})
        self.vid = self.box.store.aktive_veranstaltung()["id"]

    def tearDown(self):
        time.sleep(0.2)
        self.box.store.schliessen()
        self.tmp.cleanup()

    def druck(self, n, simuliert=False, status="erfolgreich"):
        a, _ = self.box.store.neuer_druckauftrag(f"S-test-{time.monotonic_ns()}", self.vid, n, simuliert, "x.jpg")
        self.box.store.setze_druckstatus(a["id"], status)

    def test_anfangs_nicht_eingerichtet(self):
        r = self.c.get("/api/betrieb/status").json["rolle"]
        self.assertFalse(r["eingerichtet"])
        self.assertEqual(r["kapazitaet"], 400)

    def test_zieht_nur_echte_erfolgreiche_abzuege_ab(self):
        self.druck(3)                                   # vor dem Einlegen: zählt nicht
        r = self.c.post("/api/betrieb/rolle", json={"rest": 390}).json
        self.assertEqual((r["rest"], r["gedruckt_seit"]), (390, 0))
        time.sleep(1.1)                                 # Zeitstempel auf Sekunden genau
        self.druck(2)                                   # 2 Abzüge echt → abziehen
        self.druck(1)                                   # 1 echt → abziehen
        self.druck(5, simuliert=True)                   # Simulation zählt nicht
        self.druck(4, status="fehlgeschlagen")          # fehlgeschlagen zählt nicht
        r = self.c.get("/api/betrieb/status").json["rolle"]
        self.assertEqual((r["rest"], r["gedruckt_seit"]), (387, 3))
        self.assertFalse(r["knapp"])

    def test_neue_rolle_und_warnung_wenn_knapp(self):
        r = self.c.post("/api/betrieb/rolle", json={"rest": 400, "kapazitaet": 400}).json
        self.assertEqual(r["rest"], 400)
        r = self.c.post("/api/betrieb/rolle", json={"rest": 15}).json
        self.assertTrue(r["knapp"])

    def test_nie_unter_null(self):
        self.c.post("/api/betrieb/rolle", json={"rest": 1})
        time.sleep(1.1)
        self.druck(3)
        self.assertEqual(self.c.get("/api/betrieb/status").json["rolle"]["rest"], 0)

    def test_ungueltige_eingaben(self):
        for d in ({"rest": "abc"}, {"rest": -1}, {"rest": 5000}, {"rest": 10, "kapazitaet": 0}, {}):
            self.assertEqual(self.c.post("/api/betrieb/rolle", json=d).status_code, 400, d)

    def test_nur_angemeldet(self):
        self.c.post("/api/betrieb/abmelden", json={})
        self.assertEqual(self.c.post("/api/betrieb/rolle", json={"rest": 10}).status_code, 401)


class MeldungDesDruckers(unittest.TestCase):
    def test_bilder_aus_meldung(self):
        self.assertEqual(rest_laut_drucker(["390 native prints remaining on '4x6' media"]), 390)
        self.assertEqual(rest_laut_drucker(["Printer OK", "12 prints remaining"]), 12)

    def test_ohne_passende_meldung(self):
        self.assertIsNone(rest_laut_drucker([]))
        self.assertIsNone(rest_laut_drucker(["Ribbon low"]))


if __name__ == "__main__":
    unittest.main()
