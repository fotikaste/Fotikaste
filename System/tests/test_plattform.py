"""Tests für die Anbindung an die Fotikaste-Plattform (Phase 5) – mit einem kleinen Test-Server,
der die Geräte-API nachahmt (läuft nur auf 127.0.0.1, kein Internet nötig)."""
from __future__ import annotations

import hashlib
import io
import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image

from fotobox.galerie import GalerieFehler, PlattformGalerie
from fotobox.web import erstelle_app
from tests.test_fotobox import neue_box, sitzung_mit_foto

TOKEN = "ab" * 32


class FalschePlattform(BaseHTTPRequestHandler):
    """Nachgebaute Geräte-API: prüft Token, merkt sich Anmeldungen und Uploads."""
    zustand: dict = {}

    def log_message(self, *a):  # ruhig
        pass

    def _antwort(self, code, daten):
        roh = json.dumps(daten).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(roh)))
        self.end_headers()
        self.wfile.write(roh)

    def _ok(self):
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self._antwort(401, {"text": "Geräte-Token fehlt oder ungültig."})
            return False
        return True

    def do_GET(self):
        if not self._ok():
            return
        z = self.zustand
        self._antwort(200, {"geraet": {"id": "g1", "name": "Testbox"}, "event": z.get("event"),
                            "bild": {"lange_seite_px": 1200, "jpeg_qualitaet": 85, "vorschau_px": 300}})

    def do_POST(self):
        if not self._ok():
            return
        z = self.zustand
        anm = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        z.setdefault("anmeldungen", []).append(anm)
        if z.get("antwort_code"):
            self._antwort(z["antwort_code"], {"text": "Test-Fehler"})
            return
        self._antwort(z.get("anmelde_code", 201), z.get("anmelde_antwort", {"photo_id": "p" * 32, "fehlend": ["web", "thumb"], "fertig": False}))

    def do_PUT(self):
        if not self._ok():
            return
        daten = self.rfile.read(int(self.headers["Content-Length"]))
        self.zustand.setdefault("uploads", {})[self.path.rsplit("/", 1)[1]] = daten
        self._antwort(200, {"fertig": True})


class PlattformTest(unittest.TestCase):
    def setUp(self):
        FalschePlattform.zustand = {"event": {"id": "e" * 32, "name": "Hochzeit Test"}}
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FalschePlattform)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.basis = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.merk = {}
        self.g = PlattformGalerie(self.basis, TOKEN, merken=self.merk.__setitem__, erinnern=lambda k: self.merk.get(k, ""), zeitlimit_s=5)
        self.tmp = tempfile.TemporaryDirectory()
        self.bild = Path(self.tmp.name) / "karte.jpg"
        Image.new("RGB", (1800, 1200), (200, 120, 90)).save(self.bild, "JPEG", quality=95)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def test_status_merkt_event_und_schluessel_enthaelt_es(self):
        self.assertIn("Hochzeit Test", self.g.status()["text"])
        self.assertEqual(self.merk["plattform_event_id"], "e" * 32)
        s = self.g.neuer_schluessel("lokal-1")
        event, gast = s.split("/")
        self.assertEqual(event, "e" * 32)
        self.assertGreaterEqual(len(gast), 22)                  # ca. 128 Bit Zufall
        self.assertEqual(self.g.url(s), f"{self.basis}/f/{gast}")

    def test_offline_seit_start_schluessel_mit_0(self):
        g = PlattformGalerie("http://127.0.0.1:9", TOKEN, zeitlimit_s=1)   # niemand hört zu
        self.assertTrue(g.neuer_schluessel("x").startswith("0/"))
        self.assertFalse(g.status()["bereit"])
        with self.assertRaises(GalerieFehler):
            g.hochladen(self.bild, g.neuer_schluessel("x"))

    def test_hochladen_varianten_pruefsummen_original_unveraendert(self):
        vorher = hashlib.sha256(self.bild.read_bytes()).hexdigest()
        self.g.status()
        s = self.g.neuer_schluessel("lokal")
        self.g.hochladen(self.bild, s)
        anm = FalschePlattform.zustand["anmeldungen"][0]
        up = FalschePlattform.zustand["uploads"]
        self.assertEqual(anm["event_id"], "e" * 32)
        self.assertEqual(anm["token_hash"], hashlib.sha256(s.split("/")[1].encode()).hexdigest())   # nur der Fingerabdruck geht zum Server
        self.assertNotIn(s.split("/")[1], json.dumps(anm))
        for v, kante in (("web", 1200), ("thumb", 300)):
            self.assertEqual(anm[v]["sha256"], hashlib.sha256(up[v]).hexdigest())
            self.assertEqual(anm[v]["bytes"], len(up[v]))
            with Image.open(io.BytesIO(up[v])) as b:
                self.assertEqual(max(b.size), kante)
        self.assertEqual(hashlib.sha256(self.bild.read_bytes()).hexdigest(), vorher)   # Original nie verändert

    def test_nie_vergroessern(self):
        klein = Path(self.tmp.name) / "klein.jpg"
        Image.new("RGB", (800, 533)).save(klein, "JPEG")
        self.g.status()
        self.g.hochladen(klein, self.g.neuer_schluessel("x"))
        with Image.open(io.BytesIO(FalschePlattform.zustand["uploads"]["web"])) as b:
            self.assertEqual(b.size, (800, 533))

    def test_schon_fertig_oder_nur_vorschau_fehlt(self):
        FalschePlattform.zustand["anmelde_antwort"] = {"photo_id": "p" * 32, "fehlend": [], "fertig": True}
        FalschePlattform.zustand["anmelde_code"] = 200
        self.g.hochladen(self.bild, self.g.neuer_schluessel("x"))
        self.assertNotIn("uploads", FalschePlattform.zustand)
        FalschePlattform.zustand.update(anmelde_antwort={"photo_id": "p" * 32, "fehlend": ["thumb"], "fertig": False}, anmelde_code=201)
        self.g.hochladen(self.bild, self.g.neuer_schluessel("x"))
        self.assertEqual(list(FalschePlattform.zustand["uploads"]), ["thumb"])

    def test_fehler_der_plattform_werden_gemeldet(self):
        FalschePlattform.zustand["antwort_code"] = 409
        with self.assertRaisesRegex(GalerieFehler, "409"):
            self.g.hochladen(self.bild, self.g.neuer_schluessel("x"))
        falsch = PlattformGalerie(self.basis, "cd" * 32, zeitlimit_s=5)
        with self.assertRaisesRegex(GalerieFehler, "401"):
            falsch.hochladen(self.bild, falsch.neuer_schluessel("x"))

    def test_kein_aktives_event(self):
        FalschePlattform.zustand["event"] = None
        st = self.g.status()
        self.assertFalse(st["bereit"])
        self.assertIn("kein aktives Event", st["text"])


class FotoboxMitPlattformTest(unittest.TestCase):
    def setUp(self):
        FalschePlattform.zustand = {"event": {"id": "e" * 32, "name": "Firmenfest"}}
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FalschePlattform)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.basis = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.tmp = tempfile.TemporaryDirectory()
        self.box = neue_box(Path(self.tmp.name))
        self.c = erstelle_app(self.box).test_client()
        self.c.post("/api/betrieb/anmelden", json={"pin": "1234"})

    def tearDown(self):
        self.box.store.schliessen()
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def test_einrichten_und_hochladen_ueber_die_betriebsseite(self):
        self.assertEqual(self.c.post("/api/betrieb/plattform", json={"plattform_url": "ftp://x", "plattform_token": TOKEN}).status_code, 400)
        self.assertEqual(self.c.post("/api/betrieb/plattform", json={"plattform_url": self.basis, "plattform_token": "zu-kurz"}).status_code, 400)
        self.assertEqual(self.c.post("/api/betrieb/plattform", json={"plattform_url": "http://beispiel.ch", "plattform_token": TOKEN}).status_code, 400)  # http nur lokal
        self.assertEqual(self.c.post("/api/betrieb/plattform", json={"plattform_url": self.basis, "plattform_token": TOKEN}).status_code, 200)
        self.assertEqual(self.c.post("/api/betrieb/einstellungen", json={"galerie_anbieter": "irgendwas"}).status_code, 400)
        self.assertEqual(self.c.post("/api/betrieb/einstellungen", json={"plattform_event_id": "x"}).status_code, 400)  # nur intern
        self.assertEqual(self.c.post("/api/betrieb/einstellungen", json={"galerie_anbieter": "plattform"}).status_code, 200)
        t = self.c.post("/api/betrieb/plattform/testen").get_json()
        self.assertTrue(t["ok"])
        self.assertIn("Firmenfest", " ".join(t["schritte"]))
        status = self.c.get("/api/betrieb/status").get_json()
        self.assertNotIn(TOKEN, json.dumps(status))                       # Token nie an den Browser
        self.assertTrue(status["einstellungen"]["plattform_token_gesetzt"])

        sid = sitzung_mit_foto(self.box)
        erg = self.box.galerie_freigeben(sid)
        self.assertTrue(erg["url"].startswith(f"{self.basis}/f/"))
        self.box.galerie_abarbeiten(warten=True)
        self.assertEqual(self.box.store.upload_zaehler()["online"], 1)
        self.assertEqual(set(FalschePlattform.zustand["uploads"]), {"web", "thumb"})

    def test_ohne_internet_qr_sofort_upload_spaeter(self):
        self.box.store.setze_einstellung("plattform_url", "http://127.0.0.1:9")    # nicht erreichbar
        self.box.store.setze_einstellung("plattform_token", TOKEN)
        self.box.store.setze_einstellung("galerie_anbieter", "plattform")
        sid = sitzung_mit_foto(self.box)
        erg = self.box.galerie_freigeben(sid)
        self.assertTrue(erg["url"].startswith("http://127.0.0.1:9/f/"))   # QR-Code gibt es trotzdem
        self.box.galerie_abarbeiten(warten=True)
        self.assertEqual(self.box.store.upload_zaehler()["wartend"], 1)
        self.box.store.setze_einstellung("plattform_url", self.basis)       # «Internet wieder da»
        self.box.galerie_abarbeiten(warten=True)
        self.assertEqual(self.box.store.upload_zaehler()["online"], 1)
        self.assertIsNone(FalschePlattform.zustand["anmeldungen"][0]["event_id"])   # offline entstanden → Plattform wählt aktives Event


if __name__ == "__main__":
    unittest.main()
