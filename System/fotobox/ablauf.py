"""Sitzungsablauf: das «Gehirn» der Fotobox.

Hier wird entschieden, was erlaubt ist – unabhängig von der Oberfläche:
  * immer nur eine aktive Sitzung und eine laufende Aufnahme
  * höchstens N Wiederholungen und M Abzüge
  * pro Sitzung höchstens EIN Druckauftrag (auch bei Doppeldruck oder Neustart)
  * Fotos der Gäste sind nur während ihrer eigenen Sitzung abrufbar
"""
from __future__ import annotations

import logging
import threading
import time
from pathlib import Path

from . import bild
from .drucker import SimulierterDrucker, freier_speicher_mb
from .kamera import KameraFehler, SimulierteKamera, erstelle_kamera, mit_zeitlimit
from .store import Store, jetzt as _jetzt

log = logging.getLogger("fotobox")

KAMERA_ZEITLIMIT_S = 30  # muss grösser sein als das eigene Zeitlimit der echten Kamera (25 s)
DRUCK_ZEITLIMIT_S = 120
MIN_FREIER_SPEICHER_MB = 300


class FotoboxFehler(Exception):
    """code wird von der Oberfläche in eine freundliche Meldung übersetzt."""

    def __init__(self, code: str, text: str = ""):
        super().__init__(text or code)
        self.code = code


class Fotobox:
    def __init__(self, daten: Path, kamera=None, drucker=None):
        self.daten = daten
        daten.mkdir(parents=True, exist_ok=True)
        self.store = Store(daten / "fotobox.db")
        self._feste_kamera = kamera
        self._sim_kamera = SimulierteKamera(lambda: self.store.einstellung("sim_kamera_verhalten"))
        self._echte_kameras = {}
        self.drucker = drucker or SimulierterDrucker(
            daten / "druck_simulation",
            verhalten=lambda: self.store.einstellung("sim_drucker_verhalten"),
            verhalten_zuruecksetzen=lambda: self.store.setze_einstellung("sim_drucker_verhalten", "ok"),
            dauer=lambda: self.store.einstellung("sim_druck_dauer_s"),
        )
        self._lock = threading.Lock()
        self._aktiv: str | None = None
        self._start_anfrage: str | None = None
        self._aufnahme_laeuft = False
        self.speicher_mb = lambda: freier_speicher_mb(self.daten)

        # Aufräumen nach einem Neustart
        self.store.offene_sitzungen_beenden("neustart")
        n = self.store.unterbrochene_auftraege_markieren()
        if n:
            log.warning("%d Druckauftrag/-aufträge nach Neustart auf «unbekannt» gesetzt", n)

    @property
    def kamera(self):
        """Welche Kamera gilt, entscheidet die Einstellung «kamera_modus» – umschaltbar ohne Neustart."""
        if self._feste_kamera:
            return self._feste_kamera
        modus = self.e("kamera_modus")
        if modus == "simuliert":
            return self._sim_kamera
        if modus not in self._echte_kameras:
            self._echte_kameras[modus] = erstelle_kamera(modus, None, lambda: bool(self.e("kamera_autofokus")))
        return self._echte_kameras[modus]

    # ---------- Hilfen ----------
    def e(self, schluessel):
        return self.store.einstellung(schluessel)

    def ordner(self, vid: str, art: str) -> Path:
        return self.daten / "veranstaltungen" / vid / art

    def _pruefe_aktiv(self, sid):
        if sid != self._aktiv:
            raise FotoboxFehler("sitzung_ungueltig", "Sitzung ist nicht (mehr) aktiv")
        s = self.store.sitzung(sid)
        if not s or s["status"] != "aktiv":
            raise FotoboxFehler("sitzung_ungueltig")
        return s

    def kontingent(self) -> dict:
        v = self.store.aktive_veranstaltung()
        z = self.store.zaehler(v["id"])
        modus_sim = self.drucker.simuliert
        verbraucht = z["simuliert"] if modus_sim else z["echt"]
        gesamt = int(self.e("druckkontingent"))
        return {"gesamt": gesamt, "verbraucht": verbraucht, "reserviert": z["reserviert"],
                "verbleibend": max(0, gesamt - verbraucht - z["reserviert"]), "modus_simuliert": modus_sim,
                "echt": z["echt"], "simuliert": z["simuliert"], "fehlgeschlagen": z["fehlgeschlagen"]}

    # ---------- Gästeablauf ----------
    def sitzung_starten(self, anfrage_id: str | None = None) -> dict:
        with self._lock:
            # Doppeldruck auf «Start»: dieselbe Anfrage liefert dieselbe Sitzung
            if anfrage_id and anfrage_id == self._start_anfrage and self._aktiv:
                return self.store.sitzung(self._aktiv)
            if self._aufnahme_laeuft:
                raise FotoboxFehler("beschaeftigt")
            if self.speicher_mb() < MIN_FREIER_SPEICHER_MB:
                log.error("Zu wenig freier Speicher: %.0f MB", self.speicher_mb())
                raise FotoboxFehler("speicher_voll")
            if not self.kamera.status()["bereit"]:
                log.error("Sitzung nicht gestartet: Kamera nicht bereit (%s)", self.kamera.status()["text"])
                raise FotoboxFehler("kamera_nicht_bereit")
            if self._aktiv:
                self.store.aktualisiere_sitzung(self._aktiv, status="abgebrochen", beendet=_jetzt())
            v = self.store.aktive_veranstaltung()
            s = self.store.neue_sitzung(v["id"])
            self._aktiv, self._start_anfrage = s["id"], anfrage_id
            log.info("Sitzung %s gestartet", s["id"])
            return s

    def aufnehmen(self, sid: str) -> dict:
        with self._lock:
            s = self._pruefe_aktiv(sid)
            if self._aufnahme_laeuft:
                raise FotoboxFehler("beschaeftigt")
            if s["aufnahmen"] >= 1 + int(self.e("max_wiederholungen")):
                raise FotoboxFehler("keine_wiederholung")
            self._aufnahme_laeuft = True
        try:
            v = self.store.aktive_veranstaltung()
            nr = s["aufnahmen"] + 1
            original = self.ordner(v["id"], "originale") / f"{sid}_{nr}.jpg"
            karte = self.ordner(v["id"], "karten") / f"{sid}.jpg"
            vorschau = self.ordner(v["id"], "vorschau") / f"{sid}.jpg"
            t0 = time.monotonic()
            try:
                mit_zeitlimit(lambda: self.kamera.aufnehmen(original), KAMERA_ZEITLIMIT_S)
            except KameraFehler as e:
                log.error("Kamerafehler in %s: %s (%s)", sid, e, e.code)
                raise FotoboxFehler("kamera_" + e.code) from e
            t1 = time.monotonic()
            try:
                vorschau.parent.mkdir(parents=True, exist_ok=True)
                bild.postkarte(original, karte, breite=int(self.e("druck_breite_px")),
                               hoehe=int(self.e("druck_hoehe_px")), dpi=int(self.e("druck_dpi")),
                               thema_name=self.e("thema"), namen=v["namen"], datum_text=v["datum_text"])
                bild.vorschau(karte, vorschau)
            except OSError as e:
                log.exception("Speichern fehlgeschlagen in %s", sid)
                raise FotoboxFehler("speichern", str(e)) from e
            log.info("Aufnahme %s #%d: Kamera %.1fs, Bild %.1fs", sid, nr, t1 - t0, time.monotonic() - t1)
            self.store.aktualisiere_sitzung(sid, aufnahmen=nr, original=str(original),
                                            karte=str(karte), vorschau=str(vorschau))
            return {"aufnahme": nr, "wiederholungen_uebrig": 1 + int(self.e("max_wiederholungen")) - nr}
        finally:
            with self._lock:
                self._aufnahme_laeuft = False

    def vorschau_datei(self, sid: str) -> Path:
        with self._lock:
            s = self._pruefe_aktiv(sid)
        if not s["vorschau"]:
            raise FotoboxFehler("keine_aufnahme")
        return Path(s["vorschau"])

    def drucken(self, sid: str, abzuege: int) -> dict:
        with self._lock:
            s = self._pruefe_aktiv(sid)
            if not s["karte"]:
                raise FotoboxFehler("keine_aufnahme")
            if not 1 <= abzuege <= int(self.e("max_abzuege_pro_sitzung")):
                raise FotoboxFehler("abzuege_ungueltig")
            vorhanden = [a for a in self.store.druckauftraege(limit=1000) if a["sitzung_id"] == sid]
            if not vorhanden and abzuege > self.kontingent()["verbleibend"]:
                raise FotoboxFehler("kontingent")
            auftrag, neu = self.store.neuer_druckauftrag(
                sid, s["veranstaltung_id"], abzuege, self.drucker.simuliert, s["karte"])
        if neu:
            self._einreichen(auftrag)
        else:
            log.info("Doppelter Druckwunsch für %s ignoriert (Auftrag %s)", sid, auftrag["id"])
        return self.store.druckauftrag(auftrag["id"])

    def _einreichen(self, auftrag: dict):
        did = auftrag["id"]
        try:
            self.drucker.einreichen(did, Path(auftrag["datei"]), auftrag["abzuege"])
        except Exception as e:  # noqa: BLE001
            log.exception("Druckauftrag %s konnte nicht übergeben werden", did)
            self.store.setze_druckstatus(did, "fehlgeschlagen", f"Übergabe fehlgeschlagen: {e}")
            return
        self.store.setze_druckstatus(did, "warteschlange")
        log.info("Druckauftrag %s übergeben (%d Abzug/Abzüge)", did, auftrag["abzuege"])
        threading.Thread(target=self._druck_beobachten, args=(did,), daemon=True).start()

    def _druck_beobachten(self, did: str):
        ende = time.monotonic() + DRUCK_ZEITLIMIT_S
        while time.monotonic() < ende:
            erg = self.drucker.ergebnis(did)
            if erg != "warteschlange":
                meldung = {"fehlgeschlagen": "Drucker meldet Fehler",
                           "unbekannt": "Drucker liefert keinen eindeutigen Status"}.get(erg)
                self.store.setze_druckstatus(did, erg, meldung)
                (log.info if erg == "erfolgreich" else log.error)("Druckauftrag %s: %s", did, erg)
                return
            time.sleep(0.3)
        self.store.setze_druckstatus(did, "unbekannt", "Zeitüberschreitung beim Warten auf den Drucker")
        log.error("Druckauftrag %s: Zeitüberschreitung", did)

    def druckstatus(self, did: str) -> str:
        a = self.store.druckauftrag(did)
        if not a:
            raise FotoboxFehler("auftrag_unbekannt")
        return a["status"]

    def sitzung_beenden(self, sid: str, grund: str = "beendet"):
        with self._lock:
            if sid == self._aktiv:
                self.store.aktualisiere_sitzung(sid, status=grund if grund in ("beendet", "abgebrochen", "inaktiv") else "beendet",
                                                beendet=_jetzt())
                self._aktiv = None
                self._start_anfrage = None
                log.info("Sitzung %s: %s", sid, grund)

    # ---------- Betreiber ----------
    def nachdrucken(self, did: str) -> dict:
        with self._lock:
            alt = self.store.druckauftrag(did)
            if not alt or alt["status"] != "fehlgeschlagen":
                raise FotoboxFehler("aktion_ungueltig", "Nur fehlgeschlagene Aufträge können nachgedruckt werden")
            nr = 1 + sum(1 for a in self.store.druckauftraege(limit=10000) if a["nachdruck_von"] == did)
            neu, _ = self.store.neuer_druckauftrag(f"{alt['sitzung_id']}#nachdruck{nr}", alt["veranstaltung_id"],
                                                   alt["abzuege"], self.drucker.simuliert, alt["datei"], nachdruck_von=did)
            self.store.setze_druckstatus(did, "ersetzt", f"Nachdruck: {neu['id']}")
        log.info("Betreiber: Nachdruck %s für %s", neu["id"], did)
        self._einreichen(neu)
        return self.store.druckauftrag(neu["id"])

    def auftrag_entscheiden(self, did: str, entscheidung: str):
        a = self.store.druckauftrag(did)
        if not a:
            raise FotoboxFehler("auftrag_unbekannt")
        erlaubt = {"unbekannt": {"wurde_gedruckt": "erfolgreich", "nicht_gedruckt": "fehlgeschlagen"},
                   "fehlgeschlagen": {"verwerfen": "verworfen"}}
        neu = erlaubt.get(a["status"], {}).get(entscheidung)
        if not neu:
            raise FotoboxFehler("aktion_ungueltig")
        self.store.setze_druckstatus(did, neu, f"Entscheid Betreiber: {entscheidung}")
        log.info("Betreiber: Auftrag %s %s -> %s", did, a["status"], neu)

    def geraetestatus(self) -> dict:
        return {"kamera": {"name": self.kamera.name, "simuliert": self.kamera.simuliert, **self.kamera.status()},
                "drucker": {"name": self.drucker.name, "simuliert": self.drucker.simuliert, **self.drucker.status()},
                "speicher_frei_mb": round(self.speicher_mb())}
