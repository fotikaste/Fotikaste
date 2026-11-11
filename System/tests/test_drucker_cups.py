"""Tests für den CUPS-Druckbaustein gegen einen kleinen nachgebildeten IPP-Server."""
from __future__ import annotations

import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image

from fotobox import drucker_cups as dc
from fotobox.ablauf import Fotobox
from fotobox.drucker import DruckFehler


class FalschesCups:
    """Merkt sich Aufträge und antwortet wie CUPS (nur die Teile, die wir brauchen)."""

    def __init__(self):
        self.auftraege = {}          # job-id -> {"zustand", "attr", "daten"}
        self.naechste_id = 41
        self.drucker_zustand = 3
        self.gruende = ["none"]
        self.pegel = [77]
        self.annehmen = True
        self.drucker_fehlt = False
        cups = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                roh = self.rfile.read(int(self.headers["Content-Length"]))
                antwort = cups.bearbeiten(roh, self.path)
                self.send_response(200)
                self.send_header("Content-Type", "application/ipp")
                self.send_header("Content-Length", str(len(antwort)))
                self.end_headers()
                self.wfile.write(antwort)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def bearbeiten(self, roh: bytes, pfad: str) -> bytes:
        import struct
        _, _, op, nr = struct.unpack(">BBHI", roh[:8])
        # Anfrage mit demselben Leser auswerten; Daten nach dem End-Tag abtrennen
        _, attr = dc.ipp_antwort_lesen(roh)
        ende = self._ende_index(roh)
        daten = roh[ende + 1:]
        basis = dc._attr(dc.T_CHARSET, "attributes-charset", "utf-8") + dc._attr(
            dc.T_SPRACHE, "attributes-natural-language", "de")
        if self.drucker_fehlt:
            return struct.pack(">BBHI", 2, 0, 0x0406, nr) + bytes([1]) + basis + bytes([3])
        if op == dc.OP_PRINT_JOB:
            jid = self.naechste_id
            self.naechste_id += 1
            self.auftraege[jid] = {"zustand": 3, "attr": attr, "daten": daten}
            rest = bytes([2]) + dc._attr(dc.T_INTEGER, "job-id", jid) + dc._attr(dc.T_ENUM, "job-state", 3)
        elif op == dc.OP_GET_JOB:
            jid = attr["job-id"][0]
            rest = bytes([2]) + dc._attr(dc.T_ENUM, "job-state", self.auftraege[jid]["zustand"])
        else:
            rest = (bytes([4]) + dc._attr(dc.T_ENUM, "printer-state", self.drucker_zustand)
                    + dc._attr(dc.T_KEYWORD, "printer-state-reasons", self.gruende)
                    + dc._attr(dc.T_BOOLEAN, "printer-is-accepting-jobs", self.annehmen)
                    + dc._attr(dc.T_INTEGER, "marker-levels", self.pegel))
        return struct.pack(">BBHI", 2, 0, 0, nr) + bytes([1]) + basis + rest + bytes([3])

    @staticmethod
    def _ende_index(roh: bytes) -> int:
        import struct
        i = 8
        while i < len(roh):
            tag = roh[i]
            if tag == 3:
                return i
            i += 1
            if tag < 0x10:
                continue
            (n,) = struct.unpack(">H", roh[i:i + 2]); i += 2 + n
            (v,) = struct.unpack(">H", roh[i:i + 2]); i += 2 + v
        return len(roh)

    def stop(self):
        self.server.shutdown()
        self.server.server_close()


class CupsBaustein(unittest.TestCase):
    def setUp(self):
        self.cups = FalschesCups()
        self.d = dc.CupsDrucker("DS620", server=self.cups.url, zeitlimit_s=3)
        self.tmp = tempfile.TemporaryDirectory()
        self.karte = Path(self.tmp.name) / "karte.jpg"
        Image.new("RGB", (1800, 1200), "white").save(self.karte)

    def tearDown(self):
        self.cups.stop()
        self.tmp.cleanup()

    def test_ipp_hin_und_zurueck(self):
        roh = dc.ipp_anfrage(dc.OP_GET_PRINTER, 7,
                             dc._attr(dc.T_KEYWORD, "requested-attributes", ["a", "b"])
                             + dc._attr(dc.T_INTEGER, "copies", 2) + dc._attr(dc.T_BOOLEAN, "x", True))
        _, attr = dc.ipp_antwort_lesen(roh)
        self.assertEqual(attr["requested-attributes"], ["a", "b"])
        self.assertEqual(attr["copies"], [2])
        self.assertEqual(attr["x"], [True])

    def test_einreichen_mit_kopien_medium_und_bild(self):
        self.d.einreichen("D-1", self.karte, 2)
        a = self.cups.auftraege[41]
        self.assertEqual(a["attr"]["copies"], [2])
        self.assertEqual(a["attr"]["media"], ["w288h432"])
        self.assertEqual(a["attr"]["document-format"], ["image/jpeg"])
        self.assertEqual(a["attr"]["printer-uri"], ["ipp://localhost/printers/DS620"])
        self.assertEqual(a["daten"], self.karte.read_bytes())

    def test_ergebnis_folgt_dem_cups_auftrag(self):
        self.d.einreichen("D-1", self.karte, 1)
        self.assertEqual(self.d.ergebnis("D-1"), "warteschlange")
        self.cups.auftraege[41]["zustand"] = 5
        self.assertEqual(self.d.ergebnis("D-1"), "warteschlange")
        self.cups.auftraege[41]["zustand"] = 6   # angehalten (z. B. Papier leer): NICHT fehlgeschlagen
        self.assertEqual(self.d.ergebnis("D-1"), "warteschlange")
        self.cups.auftraege[41]["zustand"] = 9
        self.assertEqual(self.d.ergebnis("D-1"), "erfolgreich")

    def test_abgebrochen_ist_fehlgeschlagen(self):
        self.d.einreichen("D-1", self.karte, 1)
        self.cups.auftraege[41]["zustand"] = 8
        self.assertEqual(self.d.ergebnis("D-1"), "fehlgeschlagen")

    def test_unbekannter_auftrag(self):
        self.assertEqual(self.d.ergebnis("D-nie"), "unbekannt")

    def test_status_bereit_mit_papierstand(self):
        s = self.d.status(frisch=True)
        self.assertTrue(s["bereit"])
        self.assertIn("77 %", s["text"])

    def test_status_papier_leer(self):
        self.cups.gruende = ["media-empty-error"]
        s = self.d.status(frisch=True)
        self.assertFalse(s["bereit"])
        self.assertIn("Papier leer", s["text"])

    def test_status_drucker_aus(self):
        self.cups.gruende = ["offline-report"]
        self.assertIn("ausgeschaltet", self.d.status(frisch=True)["text"])

    def test_drucker_nicht_eingerichtet(self):
        self.cups.drucker_fehlt = True
        self.assertIn("nicht eingerichtet", self.d.status(frisch=True)["text"])
        with self.assertRaises(DruckFehler):
            self.d.einreichen("D-1", self.karte, 1)

    def test_cups_nicht_erreichbar(self):
        d = dc.CupsDrucker("DS620", server="http://127.0.0.1:9", zeitlimit_s=1)
        self.assertFalse(d.status()["bereit"])
        self.assertIn("nicht erreichbar", d.status()["text"])


class CupsImAblauf(unittest.TestCase):
    """Ganzer Gästeablauf mit drucker_modus=cups gegen das nachgebildete CUPS."""

    def setUp(self):
        self.cups = FalschesCups()
        self.tmp = tempfile.TemporaryDirectory()
        self.box = Fotobox(Path(self.tmp.name))
        self.box.store.setze_einstellung("drucker_modus", "cups")
        self.box._echte_drucker[("DS620", "w288h432")] = dc.CupsDrucker("DS620", server=self.cups.url)

    def tearDown(self):
        self.cups.stop()
        self.box.store.schliessen() if hasattr(self.box.store, "schliessen") else None
        self.tmp.cleanup()

    def test_druck_einmal_uebergeben_und_erfolgreich(self):
        s = self.box.sitzung_starten()
        self.box.aufnehmen(s["id"])
        a = self.box.drucken(s["id"], 2)
        self.box.drucken(s["id"], 2)             # Doppeldruck auf «Drucken»
        self.assertFalse(a["simuliert"])
        self.assertEqual(len(self.cups.auftraege), 1)
        self.cups.auftraege[41]["zustand"] = 9
        ende = time.monotonic() + 5
        while self.box.druckstatus(a["id"]) != "erfolgreich" and time.monotonic() < ende:
            time.sleep(0.1)
        self.assertEqual(self.box.druckstatus(a["id"]), "erfolgreich")
        self.assertIn("Echter Drucker", self.box.geraetestatus()["drucker"]["name"])


if __name__ == "__main__":
    unittest.main()
