"""Automatische Tests der Fotobox (simulierte Kamera und simulierter Drucker).

Ausführen (im Ordner System):  .venv\\Scripts\\python.exe -m unittest -v
"""
from __future__ import annotations

import hashlib
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

from fotobox import ablauf
from fotobox.ablauf import Fotobox, FotoboxFehler
from fotobox.web import erstelle_app


def neue_box(ordner: Path) -> Fotobox:
    box = Fotobox(ordner)
    box.kamera.breite, box.kamera.hoehe, box.kamera.verzoegerung_s = 900, 600, 0.0  # klein = schnell
    box.store.setze_einstellung("sim_druck_dauer_s", 0.2)
    return box


def warte_auf_druck(box, did, timeout=5):
    ende = time.monotonic() + timeout
    while time.monotonic() < ende:
        s = box.druckstatus(did)
        if s not in ("angefordert", "warteschlange"):
            return s
        time.sleep(0.05)
    raise AssertionError("Druckauftrag wurde nicht fertig")


def sitzung_mit_foto(box):
    s = box.sitzung_starten()
    box.aufnehmen(s["id"])
    return s["id"]


class Grundablauf(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.daten = Path(self.tmp.name)
        self.box = neue_box(self.daten)

    def tearDown(self):
        time.sleep(0.3)  # Hintergrund-Beobachter fertig werden lassen
        self.box.store.schliessen()
        self.tmp.cleanup()

    def test_zehn_sitzungen_hintereinander(self):
        for _ in range(10):
            sid = sitzung_mit_foto(self.box)
            a = self.box.drucken(sid, 1)
            self.assertEqual(warte_auf_druck(self.box, a["id"]), "erfolgreich")
            self.box.sitzung_beenden(sid)
        v = self.box.store.aktive_veranstaltung()
        self.assertEqual(len(list(self.box.ordner(v["id"], "originale").glob("*.jpg"))), 10)
        self.assertEqual(len(list(self.box.ordner(v["id"], "karten").glob("*.jpg"))), 10)
        self.assertEqual(len(list((self.daten / "druck_simulation").glob("*_SIMULATION.jpg"))), 10)
        z = self.box.kontingent()
        self.assertEqual((z["simuliert"], z["echt"], z["verbleibend"]), (10, 0, 290))

    def test_postkarte_hat_druckformat(self):
        sid = sitzung_mit_foto(self.box)
        karte = Path(self.box.store.sitzung(sid)["karte"])
        with Image.open(karte) as k:
            self.assertEqual(k.size, (1800, 1200))
            self.assertEqual(round(k.info["dpi"][0]), 300)

    def test_original_bleibt_unveraendert(self):
        sid = sitzung_mit_foto(self.box)
        original = Path(self.box.store.sitzung(sid)["original"])
        vorher = hashlib.sha256(original.read_bytes()).hexdigest()
        a = self.box.drucken(sid, 1)
        warte_auf_druck(self.box, a["id"])
        self.assertEqual(hashlib.sha256(original.read_bytes()).hexdigest(), vorher)

    def test_doppelstart_liefert_dieselbe_sitzung(self):
        a = self.box.sitzung_starten("anfrage-1")
        b = self.box.sitzung_starten("anfrage-1")
        self.assertEqual(a["id"], b["id"])

    def test_doppeldruck_erzeugt_nur_einen_auftrag(self):
        sid = sitzung_mit_foto(self.box)
        ergebnisse = []
        threads = [threading.Thread(target=lambda: ergebnisse.append(self.box.drucken(sid, 2)["id"])) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(len(set(ergebnisse)), 1)
        self.assertEqual(len(self.box.store.druckauftraege()), 1)

    def test_wiederholungen_sind_begrenzt(self):
        s = self.box.sitzung_starten()
        for _ in range(3):  # 1 Aufnahme + 2 Wiederholungen
            self.box.aufnehmen(s["id"])
        with self.assertRaises(FotoboxFehler) as f:
            self.box.aufnehmen(s["id"])
        self.assertEqual(f.exception.code, "keine_wiederholung")

    def test_zu_viele_abzuege_abgelehnt(self):
        sid = sitzung_mit_foto(self.box)
        with self.assertRaises(FotoboxFehler) as f:
            self.box.drucken(sid, 3)
        self.assertEqual(f.exception.code, "abzuege_ungueltig")

    def test_abbruch_und_privatsphaere(self):
        sid = sitzung_mit_foto(self.box)
        self.assertTrue(self.box.vorschau_datei(sid).exists())
        self.box.sitzung_beenden(sid, "inaktiv")
        self.assertEqual(self.box.store.sitzung(sid)["status"], "inaktiv")
        with self.assertRaises(FotoboxFehler):
            self.box.vorschau_datei(sid)  # Foto ist für die Oberfläche nicht mehr abrufbar
        with self.assertRaises(FotoboxFehler):
            self.box.drucken(sid, 1)

    def test_neue_sitzung_bricht_alte_ab(self):
        alt = sitzung_mit_foto(self.box)
        self.box.sitzung_starten()
        self.assertEqual(self.box.store.sitzung(alt)["status"], "abgebrochen")


class Kamerafehler(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.box = neue_box(Path(self.tmp.name))

    def tearDown(self):
        self.box.store.schliessen()
        self.tmp.cleanup()

    def test_kamera_nicht_verbunden_beim_start(self):
        self.box.store.setze_einstellung("sim_kamera_verhalten", "nicht_verbunden")
        with self.assertRaises(FotoboxFehler) as f:
            self.box.sitzung_starten()
        self.assertEqual(f.exception.code, "kamera_nicht_bereit")

    def test_kamera_getrennt_waehrend_aufnahme_und_wiederholung(self):
        s = self.box.sitzung_starten()
        self.box.store.setze_einstellung("sim_kamera_verhalten", "nicht_verbunden")
        with self.assertRaises(FotoboxFehler) as f:
            self.box.aufnehmen(s["id"])
        self.assertEqual(f.exception.code, "kamera_nicht_verbunden")
        self.box.store.setze_einstellung("sim_kamera_verhalten", "ok")
        erg = self.box.aufnehmen(s["id"])  # kontrollierte Wiederholung klappt
        self.assertEqual(erg["aufnahme"], 1)  # Fehlversuch zählt nicht als Wiederholung

    def test_zeitueberschreitung(self):
        s = self.box.sitzung_starten()
        self.box.store.setze_einstellung("sim_kamera_verhalten", "zeitueberschreitung")
        with mock.patch.object(ablauf, "KAMERA_ZEITLIMIT_S", 0.5):
            t0 = time.monotonic()
            with self.assertRaises(FotoboxFehler) as f:
                self.box.aufnehmen(s["id"])
        self.assertEqual(f.exception.code, "kamera_zeitueberschreitung")
        self.assertLess(time.monotonic() - t0, 3)


class FalscheKamera(unittest.TestCase):
    def test_nur_canon_fotos_werden_akzeptiert(self):
        from fotobox.kamera import KameraFehler, pruefe_canon
        with tempfile.TemporaryDirectory() as tmp:
            webcam = Path(tmp) / "webcam.jpg"
            Image.new("RGB", (64, 48)).save(webcam)
            with self.assertRaises(KameraFehler) as f:
                pruefe_canon(webcam)
            self.assertEqual(f.exception.code, "falsche_kamera")
            self.assertTrue((Path(tmp) / "webcam_FALSCHE_KAMERA.jpg").exists())

            canon = Path(tmp) / "canon.jpg"
            exif = Image.Exif()
            exif[271] = "Canon"
            Image.new("RGB", (64, 48)).save(canon, exif=exif)
            pruefe_canon(canon)  # darf keinen Fehler werfen


class Druckfehler(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.box = neue_box(Path(self.tmp.name))

    def tearDown(self):
        time.sleep(0.3)
        self.box.store.schliessen()
        self.tmp.cleanup()

    def test_fehlgeschlagen_und_nachdruck(self):
        self.box.store.setze_einstellung("sim_drucker_verhalten", "naechster_fehlgeschlagen")
        sid = sitzung_mit_foto(self.box)
        a = self.box.drucken(sid, 1)
        self.assertEqual(warte_auf_druck(self.box, a["id"]), "fehlgeschlagen")
        self.assertEqual(self.box.store.einstellung("sim_drucker_verhalten"), "ok")  # gilt nur einmal
        self.assertEqual(self.box.kontingent()["simuliert"], 0)
        neu = self.box.nachdrucken(a["id"])
        self.assertEqual(warte_auf_druck(self.box, neu["id"]), "erfolgreich")
        self.assertEqual(self.box.store.druckauftrag(a["id"])["status"], "ersetzt")
        self.assertEqual(self.box.kontingent()["simuliert"], 1)
        with self.assertRaises(FotoboxFehler):
            self.box.nachdrucken(a["id"])  # kein zweiter Nachdruck desselben Auftrags

    def test_unbekannt_braucht_entscheid(self):
        self.box.store.setze_einstellung("sim_drucker_verhalten", "naechster_unbekannt")
        sid = sitzung_mit_foto(self.box)
        a = self.box.drucken(sid, 2)
        self.assertEqual(warte_auf_druck(self.box, a["id"]), "unbekannt")
        k = self.box.kontingent()
        self.assertEqual((k["simuliert"], k["reserviert"]), (0, 2))  # reserviert, aber nicht gezählt
        with self.assertRaises(FotoboxFehler):
            self.box.nachdrucken(a["id"])  # unklare Aufträge nie blind nachdrucken
        self.box.auftrag_entscheiden(a["id"], "wurde_gedruckt")
        k = self.box.kontingent()
        self.assertEqual((k["simuliert"], k["reserviert"]), (2, 0))

    def test_drucklimit(self):
        self.box.store.setze_einstellung("druckkontingent", 3)
        sid = sitzung_mit_foto(self.box)
        warte_auf_druck(self.box, self.box.drucken(sid, 2)["id"])
        self.box.sitzung_beenden(sid)
        sid = sitzung_mit_foto(self.box)
        with self.assertRaises(FotoboxFehler) as f:
            self.box.drucken(sid, 2)
        self.assertEqual(f.exception.code, "kontingent")
        warte_auf_druck(self.box, self.box.drucken(sid, 1)["id"])
        self.assertEqual(self.box.kontingent()["verbleibend"], 0)


class NeustartUndSpeicher(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.daten = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_neustart_waehrend_druck(self):
        box = neue_box(self.daten)
        box.store.setze_einstellung("sim_druck_dauer_s", 30)
        box.store.setze_einstellung("countdown_s", 5)
        sid = sitzung_mit_foto(box)
        a = box.drucken(sid, 1)
        self.assertEqual(box.druckstatus(a["id"]), "warteschlange")
        box.store.schliessen()  # «Absturz»

        box2 = neue_box(self.daten)
        self.assertEqual(box2.druckstatus(a["id"]), "unbekannt")       # nicht automatisch wiederholt
        self.assertEqual(len(box2.store.druckauftraege()), 1)
        self.assertEqual(box2.store.sitzung(sid)["status"], "neustart")
        self.assertEqual(box2.store.einstellung("countdown_s"), 5)      # Einstellung erhalten
        with self.assertRaises(FotoboxFehler):
            box2.drucken(sid, 1)  # alte Sitzung kann nicht erneut drucken
        box2.store.schliessen()

    def test_zaehler_ueberleben_neustart(self):
        box = neue_box(self.daten)
        sid = sitzung_mit_foto(box)
        warte_auf_druck(box, box.drucken(sid, 2)["id"])
        box.store.schliessen()
        box2 = neue_box(self.daten)
        self.assertEqual(box2.kontingent()["simuliert"], 2)
        box2.store.schliessen()

    def test_fehler_beim_speichern(self):
        box = neue_box(self.daten)
        s = box.sitzung_starten()
        with mock.patch("fotobox.bild.postkarte", side_effect=OSError("Datenträger voll")):
            with self.assertRaises(FotoboxFehler) as f:
                box.aufnehmen(s["id"])
        self.assertEqual(f.exception.code, "speichern")
        self.assertEqual(box.aufnehmen(s["id"])["aufnahme"], 1)  # danach geht es weiter
        box.store.schliessen()

    def test_speicher_voll(self):
        box = neue_box(self.daten)
        box.speicher_mb = lambda: 50
        with self.assertRaises(FotoboxFehler) as f:
            box.sitzung_starten()
        self.assertEqual(f.exception.code, "speicher_voll")
        box.store.schliessen()


class Veranstaltungen(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.daten = Path(self.tmp.name)
        self.box = neue_box(self.daten / "daten")

    def tearDown(self):
        time.sleep(0.3)
        self.box.store.schliessen()
        self.tmp.cleanup()

    def test_wechsel_mit_eigenem_thema_ordner_und_kontingent(self):
        alt = self.box.store.aktive_veranstaltung()
        sid = sitzung_mit_foto(self.box)
        warte_auf_druck(self.box, self.box.drucken(sid, 2)["id"])
        self.box.sitzung_beenden(sid)

        neu = self.box.veranstaltung_anlegen("Geburtstag", "Mia", "1. Mai", "sommer", aktivieren=True)
        self.assertEqual(self.box.store.aktive_veranstaltung()["id"], neu["id"])
        self.assertEqual(self.box.kontingent()["verbleibend"], 300)        # eigenes Kontingent
        sid = sitzung_mit_foto(self.box)
        self.assertIn(neu["id"], self.box.store.sitzung(sid)["karte"])      # eigener Ordner
        self.assertEqual(self.box.store.veranstaltung(neu["id"])["thema"], "sommer")
        self.assertEqual(self.box.store.veranstaltung(alt["id"])["thema"], "elegant")

    def test_kein_wechsel_waehrend_sitzung(self):
        neu = self.box.veranstaltung_anlegen("Fest", "Team", "", "winter")
        self.box.sitzung_starten()
        with self.assertRaises(FotoboxFehler) as f:
            self.box.veranstaltung_aktivieren(neu["id"])
        self.assertEqual(f.exception.code, "sitzung_laeuft")

    def test_export_kopiert_und_behaelt_originale(self):
        v = self.box.store.aktive_veranstaltung()
        for _ in range(2):
            self.box.sitzung_beenden(sitzung_mit_foto(self.box))
        erg = self.box.exportieren(v["id"], self.daten / "export")
        self.assertEqual((erg["originale"], erg["postkarten"]), (2, 2))
        self.assertEqual(len(list((Path(erg["ordner"]) / "Originale").glob("*.jpg"))), 2)
        self.assertEqual(len(list(self.box.ordner(v["id"], "originale").glob("*.jpg"))), 2)  # nichts verschoben
        erg2 = self.box.exportieren(v["id"], self.daten / "export")                          # zweimal ist ok
        self.assertEqual(erg2["originale"], 2)

    def test_loeschen_nur_mit_bestaetigung_und_in_papierkorb(self):
        alt = self.box.store.aktive_veranstaltung()
        self.box.sitzung_beenden(sitzung_mit_foto(self.box))
        with self.assertRaises(FotoboxFehler):
            self.box.bilder_in_papierkorb(alt["id"], "LÖSCHEN")  # aktive Veranstaltung: nicht erlaubt
        self.box.veranstaltung_anlegen("Neu", "X", "", "minimal", aktivieren=True)
        with self.assertRaises(FotoboxFehler) as f:
            self.box.bilder_in_papierkorb(alt["id"], "ja")
        self.assertEqual(f.exception.code, "bestaetigung_fehlt")
        self.assertTrue(self.box.ordner(alt["id"], "originale").exists())
        self.box.bilder_in_papierkorb(alt["id"], "LÖSCHEN")
        self.assertFalse(self.box.ordner(alt["id"], "originale").exists())
        papierkorb = list((self.daten / "daten" / "papierkorb").glob(f"{alt['id']}_*/originale/*.jpg"))
        self.assertEqual(len(papierkorb), 1)                                   # nicht endgültig gelöscht
        self.assertEqual(self.box.store.veranstaltung(alt["id"])["bilder_status"], "im_papierkorb")

    def test_alte_datenbank_wird_ergaenzt(self):
        import sqlite3
        from fotobox.store import Store
        pfad = self.daten / "alt.db"
        db = sqlite3.connect(pfad)
        db.execute("CREATE TABLE veranstaltungen (id TEXT PRIMARY KEY, anlass TEXT, namen TEXT, datum_text TEXT, "
                   "erstellt TEXT NOT NULL, aktiv INTEGER NOT NULL DEFAULT 0)")
        db.execute("INSERT INTO veranstaltungen VALUES ('V-1', 'Fest', 'Alt', '', '2026-01-01', 1)")
        db.commit()
        db.close()
        s = Store(pfad)
        v = s.aktive_veranstaltung()
        self.assertEqual((v["id"], v["thema"], v["bilder_status"]), ("V-1", "elegant", "vorhanden"))
        s.schliessen()


class Webschnittstelle(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.box = neue_box(Path(self.tmp.name))
        self.c = erstelle_app(self.box).test_client()

    def tearDown(self):
        time.sleep(0.3)
        self.box.store.schliessen()
        self.tmp.cleanup()

    def test_gaesteablauf_ueber_api(self):
        self.assertEqual(self.c.get("/").status_code, 200)
        sid = self.c.post("/api/sitzung", json={"anfrage_id": "x"}).json["id"]
        self.assertEqual(self.c.post(f"/api/sitzung/{sid}/aufnahme", json={}).status_code, 200)
        r = self.c.get(f"/api/sitzung/{sid}/vorschau.jpg")
        self.assertEqual(r.status_code, 200)
        self.assertIn("no-store", r.headers["Cache-Control"])
        r.close()
        did = self.c.post(f"/api/sitzung/{sid}/drucken", json={"abzuege": 1}).json["auftrag_id"]
        self.assertEqual(warte_auf_druck(self.box, did), "erfolgreich")
        self.c.post(f"/api/sitzung/{sid}/ende", json={"grund": "beendet"})
        self.assertEqual(self.c.get(f"/api/sitzung/{sid}/vorschau.jpg").status_code, 409)

    def test_betrieb_braucht_pin(self):
        self.assertEqual(self.c.get("/api/betrieb/status").status_code, 401)
        self.assertEqual(self.c.post("/api/betrieb/anmelden", json={"pin": "0000"}).status_code, 403)
        self.assertEqual(self.c.post("/api/betrieb/anmelden", json={"pin": "1234"}).status_code, 200)
        d = self.c.get("/api/betrieb/status").json
        self.assertNotIn("betreiber_pin", d["einstellungen"])
        self.assertEqual(self.c.post("/api/betrieb/einstellungen", json={"countdown_s": "5"}).status_code, 200)
        self.assertEqual(self.box.store.einstellung("countdown_s"), 5)
        self.assertEqual(self.c.post("/api/betrieb/einstellungen", json={"gibtsnicht": 1}).status_code, 400)
        # PIN lässt sich nicht über die allgemeinen Einstellungen ändern
        self.assertEqual(self.c.post("/api/betrieb/einstellungen", json={"betreiber_pin": "9999"}).status_code, 400)

    def test_pin_aendern(self):
        self.c.post("/api/betrieb/anmelden", json={"pin": "1234"})
        self.assertEqual(self.c.post("/api/betrieb/pin", json={"alt": "1111", "neu": "5678"}).status_code, 403)
        self.assertEqual(self.c.post("/api/betrieb/pin", json={"alt": "1234", "neu": "12"}).status_code, 400)
        self.assertEqual(self.c.post("/api/betrieb/pin", json={"alt": "1234", "neu": "5678"}).status_code, 200)
        self.assertFalse(self.c.get("/api/betrieb/status").json["standard_pin"])
        self.c.post("/api/betrieb/abmelden")
        self.assertEqual(self.c.post("/api/betrieb/anmelden", json={"pin": "5678"}).status_code, 200)

    def test_automatische_abmeldung(self):
        from fotobox import web
        self.c.post("/api/betrieb/anmelden", json={"pin": "1234"})
        with mock.patch.object(web, "ABMELDEN_NACH_S", 0.5):
            self.assertEqual(self.c.get("/api/betrieb/status", headers={"X-Hintergrund": "1"}).status_code, 200)
            time.sleep(0.7)
            # Hintergrund-Aktualisierung hat die Anmeldung NICHT verlängert
            self.assertEqual(self.c.get("/api/betrieb/status", headers={"X-Hintergrund": "1"}).status_code, 401)

    def test_bilder_loeschen_braucht_pin(self):
        self.c.post("/api/betrieb/anmelden", json={"pin": "1234"})
        alt = self.box.store.aktive_veranstaltung()["id"]
        self.c.post("/api/betrieb/veranstaltungen", json={"namen": "Neu", "aktivieren": True})
        r = self.c.post(f"/api/betrieb/veranstaltung/{alt}/bilder_loeschen", json={"bestaetigung": "LÖSCHEN", "pin": "0000"})
        self.assertEqual(r.status_code, 403)
        r = self.c.post(f"/api/betrieb/veranstaltung/{alt}/bilder_loeschen", json={"bestaetigung": "LÖSCHEN", "pin": "1234"})
        self.assertEqual(r.status_code, 200)


if __name__ == "__main__":
    unittest.main()
