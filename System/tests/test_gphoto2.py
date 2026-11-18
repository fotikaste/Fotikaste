"""Tests für den gphoto2-Baustein mit einer nachgebildeten gphoto2-Bibliothek
(das echte Paket gibt es unter Windows nicht)."""
from __future__ import annotations

import io
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace

from PIL import Image

from fotobox.kamera import KameraFehler
from fotobox.kamera_gphoto2 import Gphoto2Kamera


def jpeg(hersteller="Canon"):
    b = Image.new("RGB", (60, 40), (200, 100, 50))
    ex = Image.Exif()
    ex[271] = hersteller
    p = io.BytesIO()
    b.save(p, "JPEG", exif=ex)
    return p.getvalue()


class FalscherGp:
    """Nachbildung der wenigen gphoto2-Funktionen, die der Baustein benutzt."""
    GP_EVENT_TIMEOUT, GP_EVENT_FILE_ADDED = 1, 2
    GP_CAPTURE_IMAGE, GP_FILE_TYPE_NORMAL = 0, 1

    class GPhoto2Error(Exception):
        def __init__(self, code):
            super().__init__(f"Fehler {code}")
            self.code = code

    def __init__(self):
        self.protokoll = []
        self.init_fehler = None
        self.capture_fehler = None
        self.hersteller = "Canon"
        self.offen = 0
        gp = self

        class Widget:
            def __init__(self, name):
                self.name, self.wert = name, {"batterylevel": "50%"}.get(name, 0)

            def get_value(self):
                return self.wert

            def set_value(self, w):
                self.wert = w

        class Datei:
            def save(self, pfad):
                Path(pfad).write_bytes(jpeg(gp.hersteller))

            def get_data_and_size(self):
                return jpeg()

        class Camera:
            def __init__(self):
                self.ereignisse = []

            def init(self):
                gp.protokoll.append("init")
                if gp.init_fehler:
                    raise gp.GPhoto2Error(gp.init_fehler)
                gp.offen += 1

            def exit(self):
                gp.protokoll.append("exit")
                gp.offen -= 1

            def get_single_config(self, name):
                return Widget(name)

            def set_single_config(self, name, w):
                gp.protokoll.append(f"{name}={w.wert}")
                if name == "eosremoterelease" and w.wert == "Release Full":
                    self.ereignisse.append((gp.GP_EVENT_FILE_ADDED, SimpleNamespace(folder="/", name="rr.jpg")))

            def wait_for_event(self, ms):
                return self.ereignisse.pop(0) if self.ereignisse else (gp.GP_EVENT_TIMEOUT, None)

            def capture(self, art):
                gp.protokoll.append("capture")
                if gp.capture_fehler:
                    raise gp.GPhoto2Error(gp.capture_fehler)
                return SimpleNamespace(folder="/", name="IMG.jpg")

            def file_get(self, ordner, name, art):
                gp.protokoll.append(f"hole {name}")
                return Datei()

            def capture_preview(self):
                gp.protokoll.append("preview")
                return Datei()

        self.Camera = Camera


class Gphoto2Baustein(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ziel = Path(self.tmp.name) / "a" / "foto.jpg"
        self.gp = FalscherGp()
        self.k = Gphoto2Kamera(gp=self.gp)

    def tearDown(self):
        self.tmp.cleanup()

    def test_ohne_gphoto2_nicht_bereit(self):
        k = Gphoto2Kamera(gp=None)
        k.gp = None
        self.assertFalse(k.status()["bereit"])
        self.assertIn("nicht installiert", k.status()["text"])
        with self.assertRaises(KameraFehler) as f:
            k.aufnehmen(self.ziel)
        self.assertEqual(f.exception.code, "nicht_verbunden")

    def test_status_mit_akku_und_eine_verbindung(self):
        s = self.k.status()
        self.assertTrue(s["bereit"])
        self.assertIn("50%", s["text"])
        self.k.status(frisch=True)
        self.assertEqual(self.gp.protokoll.count("init"), 1)  # Verbindung bleibt offen
        self.assertIn("capturetarget=Internal RAM", self.gp.protokoll)

    def test_aufnahme_ohne_livebild_normal(self):
        self.k.aufnehmen(self.ziel)
        self.assertTrue(self.ziel.exists())
        self.assertIn("capture", self.gp.protokoll)
        self.assertFalse(list(self.ziel.parent.glob("*.teil")))

    def test_vorfokus_dann_fernausloeser(self):
        self.k.livebild_start()
        self.assertTrue(self.k.livebild_bild().startswith(b"\xff\xd8"))
        self.k.vorfokussieren()
        self.k.aufnehmen(self.ziel)
        p = self.gp.protokoll
        self.assertNotIn("capture", p)
        self.assertLess(p.index("autofocusdrive=1"), p.index("autofocusdrive=0"))
        self.assertLess(p.index("eosremoterelease=Immediate"), p.index("eosremoterelease=Release Full"))
        self.assertIn("hole rr.jpg", p)
        self.k.livebild_stop()
        self.assertEqual(p[-1], "viewfinder=0")

    def test_ausloesen_hat_vorrang_vor_livebild(self):
        # Während ausgelöst wird, werden Livebild-Abrufe sofort abgewiesen (kein Warten auf die Kamera),
        # danach funktioniert das Livebild wieder.
        self.k.livebild_start()
        self.k.vorfokussieren()
        ergebnisse = []
        original = self.k._setzen

        def setzen_und_livebild_versuchen(name, wert):
            if name == "eosremoterelease" and wert == "Immediate":
                t0 = time.monotonic()
                try:
                    self.k.livebild_bild()
                    ergebnisse.append("bild")
                except KameraFehler as f:
                    ergebnisse.append((f.code, time.monotonic() - t0))
            return original(name, wert)
        self.k._setzen = setzen_und_livebild_versuchen
        with self.assertLogs("fotobox", level="INFO") as protokoll:
            self.k.aufnehmen(self.ziel)
        self.assertEqual(ergebnisse[0][0], "kein_livebild")
        self.assertLess(ergebnisse[0][1], 0.1)
        self.assertTrue(any("Vorfokus (vor" in z for z in protokoll.output))
        self.assertTrue(any("Foto nach" in z for z in protokoll.output))
        self.assertTrue(self.k.livebild_bild().startswith(b"\xff\xd8"))

    def test_vorfokus_ohne_livebild_tut_nichts(self):
        self.k.vorfokussieren()
        self.k.aufnehmen(self.ziel)
        self.assertNotIn("autofocusdrive=1", self.gp.protokoll)
        self.assertIn("capture", self.gp.protokoll)

    def test_kamera_fehlt(self):
        self.gp.init_fehler = -105
        self.assertFalse(self.k.status(frisch=True)["bereit"])
        with self.assertRaises(KameraFehler) as f:
            self.k.aufnehmen(self.ziel)
        self.assertEqual(f.exception.code, "nicht_verbunden")

    def test_belegt_von_anderem_programm(self):
        self.gp.init_fehler = -53
        self.assertIn("anderes Programm", self.k.status(frisch=True)["text"])

    def test_fehler_trennt_und_verbindet_neu(self):
        self.k.status()
        self.gp.capture_fehler = -7
        with self.assertRaises(KameraFehler) as f:
            self.k.aufnehmen(self.ziel)
        self.assertEqual(f.exception.code, "nicht_verbunden")
        self.assertEqual(self.gp.offen, 0)
        self.gp.capture_fehler = None
        self.k.aufnehmen(self.ziel)
        self.assertEqual(self.gp.protokoll.count("init"), 2)

    def test_falsche_kamera_abgelehnt(self):
        self.gp.hersteller = "Lenovo"
        with self.assertRaises(KameraFehler) as f:
            self.k.aufnehmen(self.ziel)
        self.assertEqual(f.exception.code, "falsche_kamera")

    def test_besetzt_meldet_zeitueberschreitung_statt_zu_haengen(self):
        self.k.LOCK_WARTEN_S = 0.2
        self.k._lock.acquire()
        try:
            with self.assertRaises(KameraFehler) as f:
                self.k.aufnehmen(self.ziel)
            self.assertEqual(f.exception.code, "zeitueberschreitung")
            # Status blockiert nie, auch nicht während einer laufenden Aufnahme
            t = threading.Thread(target=self.k.status, kwargs={"frisch": True})
            t.start(); t.join(1)
            self.assertFalse(t.is_alive())
        finally:
            self.k._lock.release()


if __name__ == "__main__":
    unittest.main()
