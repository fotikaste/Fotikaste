"""«Internet einrichten»: WLAN-Baustein und abgesicherte Schnittstelle (2026-11-18)."""
from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from fotobox.web import erstelle_app
from fotobox.wlan import NmcliWlan, SimuliertesWlan, WlanFehler, fehler_text, netze_auswerten, nmcli_zeile
from tests.test_fotobox import neue_box

# So sieht «nmcli -t -f IN-USE,SSID,SIGNAL,SECURITY device wifi list» aus (Doppelpunkte im Namen maskiert)
BEISPIEL = r"""
 :Lokal-Gaeste:82:WPA2
*:Zuhause\:5G:70:WPA2 WPA3
 :Lokal-Gaeste:40:WPA2
 ::65:WPA2
 :Offenes Cafe:30:
 :Mit \\ Backslash:20:--
"""


class NmcliAuswertung(unittest.TestCase):
    def test_zeile_mit_maskierten_zeichen(self):
        self.assertEqual(nmcli_zeile(r"*:Zuhause\:5G:70:WPA2"), ["*", "Zuhause:5G", "70", "WPA2"])
        self.assertEqual(nmcli_zeile(r" :A\\B:1:"), [" ", "A\\B", "1", ""])

    def test_netze_ohne_doppelte_und_sortiert(self):
        netze = netze_auswerten(BEISPIEL)
        namen = [n["ssid"] for n in netze]
        self.assertEqual(namen[0], "Zuhause:5G")                       # verbundenes Netz zuerst
        self.assertEqual(namen.count("Lokal-Gaeste"), 1)               # doppelt gesehen → einmal
        self.assertEqual(next(n for n in netze if n["ssid"] == "Lokal-Gaeste")["signal"], 82)
        self.assertNotIn("", namen)                                    # versteckte Netze weg
        offen = {n["ssid"]: n["gesichert"] for n in netze}
        self.assertFalse(offen["Offenes Cafe"])
        self.assertFalse(offen["Mit \\ Backslash"])
        self.assertTrue(offen["Lokal-Gaeste"])

    def test_fehlertexte_verstaendlich(self):
        self.assertIn("Passwort falsch", fehler_text("Error: Connection activation failed: Secrets were required, but not provided."))
        self.assertIn("nicht gefunden", fehler_text("Error: No network with SSID 'X' found."))
        self.assertIn("Vermieter", fehler_text("Error: Not authorized to control networking."))

    def test_nmcli_passwort_nicht_in_fehlermeldung(self):
        w = NmcliWlan()
        antwort = mock.Mock(returncode=4, stdout="", stderr="Error: ... psk=geheim123 ...")
        with mock.patch("subprocess.run", return_value=antwort) as lauf:
            with self.assertRaises(WlanFehler) as f:
                w.verbinden("Lokal", "geheim123")
        self.assertNotIn("geheim123", str(f.exception))
        self.assertEqual(lauf.call_args.args[0][:5], ["nmcli", "device", "wifi", "connect", "Lokal"])

    def test_nmcli_status(self):
        w = NmcliWlan()
        antworten = [mock.Mock(returncode=0, stdout="no:Nachbar\nyes:Lokal-Gaeste\n", stderr=""),
                     mock.Mock(returncode=0, stdout="full\n", stderr="")]
        with mock.patch("subprocess.run", side_effect=antworten):
            self.assertEqual(w.status(), {"verbunden": True, "ssid": "Lokal-Gaeste", "internet": "ja"})


class Schnittstelle(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.box = neue_box(Path(self.tmp.name))
        self.wlan = SimuliertesWlan()
        self.c = erstelle_app(self.box, wlan=self.wlan).test_client()

    def tearDown(self):
        time.sleep(0.2)
        self.box.store.schliessen()
        self.tmp.cleanup()

    def betreiber(self):
        self.c.post("/api/betrieb/anmelden", json={"pin": "1234"})

    def test_ohne_code_nur_status(self):
        s = self.c.get("/api/wlan/status").json
        self.assertEqual((s["verbunden"], s["angemeldet"]), (False, False))
        self.assertEqual(self.c.get("/api/wlan/netze").status_code, 401)
        self.assertEqual(self.c.post("/api/wlan/verbinden", json={"ssid": "Lokal-Gaeste", "passwort": "x"}).status_code, 401)

    def test_kunden_code_erlaubt_nur_wlan(self):
        self.betreiber()
        self.assertEqual(self.c.post("/api/betrieb/einstellungen", json={"wlan_code": "4711"}).status_code, 200)
        self.c.post("/api/betrieb/abmelden", json={})
        self.assertEqual(self.c.post("/api/wlan/anmelden", json={"code": "0000"}).status_code, 403)
        self.assertEqual(self.c.post("/api/wlan/anmelden", json={"code": "4711"}).status_code, 200)
        self.assertEqual(self.c.get("/api/wlan/netze").status_code, 200)
        self.assertEqual(self.c.get("/api/betrieb/status").status_code, 401)   # Betrieb bleibt gesperrt

    def test_ohne_kunden_code_geht_betreiber_pin(self):
        self.assertEqual(self.c.post("/api/wlan/anmelden", json={"code": ""}).status_code, 403)   # leerer Code nie gültig
        self.assertEqual(self.c.post("/api/wlan/anmelden", json={"code": "1234"}).status_code, 200)

    def test_betreiber_darf_direkt(self):
        self.betreiber()
        self.assertTrue(self.c.get("/api/wlan/status").json["angemeldet"])
        self.assertEqual(self.c.get("/api/wlan/netze").status_code, 200)

    def test_verbinden_falsch_und_richtig_ohne_passwort_im_protokoll(self):
        self.betreiber()
        with self.assertLogs("fotobox", level="INFO") as protokoll:
            r = self.c.post("/api/wlan/verbinden", json={"ssid": "Lokal-Gaeste", "passwort": "falsch999"})
            self.assertEqual(r.status_code, 400)
            self.assertIn("Passwort falsch", r.json["text"])
            r = self.c.post("/api/wlan/verbinden", json={"ssid": "Lokal-Gaeste", "passwort": "richtig123"})
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json["ssid"], "Lokal-Gaeste")
        alles = "\n".join(protokoll.output)
        self.assertNotIn("falsch999", alles)
        self.assertNotIn("richtig123", alles)

    def test_kunden_code_pruefung(self):
        self.betreiber()
        for falsch in ("12", "abcd", "123456789", "1234"):   # 1234 = Betreiber-PIN
            r = self.c.post("/api/betrieb/einstellungen", json={"wlan_code": falsch})
            self.assertEqual(r.status_code, 400, falsch)
        self.assertEqual(self.c.post("/api/betrieb/einstellungen", json={"wlan_code": ""}).status_code, 200)

    def test_seite_erreichbar(self):
        with self.c.get("/internet") as r:
            self.assertEqual(r.status_code, 200)
            self.assertIn("Internet einrichten", r.get_data(as_text=True))


if __name__ == "__main__":
    unittest.main()
