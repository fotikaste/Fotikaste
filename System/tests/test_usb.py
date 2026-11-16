"""Export auf USB-Stick (für den Raspberry Pi im Vollbild-Betrieb)."""
from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from fotobox import usb
from fotobox.web import erstelle_app
from tests.test_fotobox import neue_box, sitzung_mit_foto


class UsbExport(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.stick = tempfile.TemporaryDirectory()
        self.box = neue_box(Path(self.tmp.name))
        self.c = erstelle_app(self.box).test_client()
        self.c.post("/api/betrieb/anmelden", json={"pin": "1234"})
        sitzung_mit_foto(self.box)
        self.vid = self.box.store.aktive_veranstaltung()["id"]
        self.sticks = [{"pfad": self.stick.name, "name": "TEST", "frei_mb": 1000}]

    def tearDown(self):
        time.sleep(0.3)
        self.box.store.schliessen()
        self.tmp.cleanup()
        self.stick.cleanup()

    def test_export_auf_stick(self):
        with mock.patch("fotobox.web.usb_sticks", return_value=self.sticks), \
             mock.patch("fotobox.web.auf_stick_schreiben_abschliessen") as sync:
            r = self.c.post(f"/api/betrieb/veranstaltung/{self.vid}/exportieren", json={"ziel": self.stick.name})
        self.assertEqual(r.status_code, 200, r.json)
        self.assertTrue(r.json["usb"])
        self.assertEqual((r.json["originale"], r.json["postkarten"]), (1, 1))
        self.assertTrue(Path(r.json["ordner"]).is_relative_to(Path(self.stick.name) / "Fotobox-Export"))
        self.assertEqual(len(list(Path(r.json["ordner"]).rglob("*.jpg"))), 2)
        sync.assert_called_once()

    def test_beliebiger_pfad_abgelehnt(self):
        with mock.patch("fotobox.web.usb_sticks", return_value=self.sticks):
            r = self.c.post(f"/api/betrieb/veranstaltung/{self.vid}/exportieren", json={"ziel": self.tmp.name})
        self.assertEqual(r.status_code, 400)

    def test_status_zeigt_sticks(self):
        with mock.patch("fotobox.web.usb_sticks", return_value=self.sticks):
            d = self.c.get("/api/betrieb/status").json
        self.assertEqual(d["usb_sticks"], self.sticks)
        self.assertIn("ordner_oeffnen_moeglich", d)


class UsbSuche(unittest.TestCase):
    def test_liefert_liste_ohne_absturz(self):
        sticks = usb.usb_sticks()   # echtes System: Liste, evtl. leer
        self.assertIsInstance(sticks, list)
        for s in sticks:
            self.assertEqual(set(s), {"pfad", "name", "frei_mb"})

    def test_fehler_bei_suche_gibt_leere_liste(self):
        with mock.patch("fotobox.usb._windows", side_effect=OSError), mock.patch("fotobox.usb._linux", side_effect=OSError):
            self.assertEqual(usb.usb_sticks(), [])


if __name__ == "__main__":
    unittest.main()
