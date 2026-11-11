"""Sitzungsablauf: das «Gehirn» der Fotobox.

Hier wird entschieden, was erlaubt ist – unabhängig von der Oberfläche:
  * immer nur eine aktive Sitzung und eine laufende Aufnahme
  * höchstens N Wiederholungen und M Abzüge
  * pro Sitzung höchstens EIN Druckauftrag (auch bei Doppeldruck oder Neustart)
  * Fotos der Gäste sind nur während ihrer eigenen Sitzung abrufbar
"""
from __future__ import annotations

import logging
import secrets
import shutil
import threading
import time
from pathlib import Path

from . import bild
from .drucker import SimulierterDrucker, freier_speicher_mb
from .galerie import GalerieFehler, R2Galerie, SimulierteGalerie
from .kamera import KameraFehler, SimulierteKamera, erstelle_kamera, mit_zeitlimit
from .store import Store, jetzt as _jetzt

log = logging.getLogger("fotobox")

KAMERA_ZEITLIMIT_S = 30  # muss grösser sein als das eigene Zeitlimit der echten Kamera (25 s)
DRUCK_ZEITLIMIT_S = 120
MIN_FREIER_SPEICHER_MB = 300
UPLOAD_INTERVALL_S = 15      # so oft versucht die Fotobox, wartende Fotos hochzuladen
MAX_UPLOAD_VERSUCHE = 200    # danach «fehlgeschlagen» (bei 15 s Abstand ca. 50 Minuten)


class FotoboxFehler(Exception):
    """code wird von der Oberfläche in eine freundliche Meldung übersetzt."""

    def __init__(self, code: str, text: str = ""):
        super().__init__(text or code)
        self.code = code


class Fotobox:
    def __init__(self, daten: Path, kamera=None, drucker=None, galerie=None,
                 sim_galerie_url="http://127.0.0.1:8080/galerie-sim"):
        self.daten = daten
        daten.mkdir(parents=True, exist_ok=True)
        self.store = Store(daten / "fotobox.db")
        self._feste_kamera = kamera
        self._sim_kamera = SimulierteKamera(lambda: self.store.einstellung("sim_kamera_verhalten"))
        self._echte_kameras = {}
        self._fester_drucker = drucker
        self._echte_drucker = {}
        self._sim_drucker = SimulierterDrucker(
            daten / "druck_simulation",
            verhalten=lambda: self.store.einstellung("sim_drucker_verhalten"),
            verhalten_zuruecksetzen=lambda: self.store.setze_einstellung("sim_drucker_verhalten", "ok"),
            dauer=lambda: self.store.einstellung("sim_druck_dauer_s"),
        )
        self._lock = threading.Lock()
        self._aktiv: str | None = None
        self._start_anfrage: str | None = None
        self._aufnahme_laeuft = False
        self._livebild_an = False
        self._livebild_zuletzt = 0.0
        self.speicher_mb = lambda: freier_speicher_mb(self.daten)
        self._feste_galerie = galerie
        self._sim_galerie = SimulierteGalerie(
            daten / "galerie_simulation", sim_galerie_url,
            verhalten=lambda: self.store.einstellung("sim_galerie_verhalten"))
        self._upload_lock = threading.Lock()
        threading.Thread(target=self._galerie_arbeiter, daemon=True).start()

        # Kamera-Prüfung im Hintergrund (dauert bei echter Kamera ca. 3 s), damit der
        # Gast beim Start nicht warten muss: status() liest dann nur den Zwischenspeicher.
        if kamera is None:
            threading.Thread(target=self._kamera_beobachten, daemon=True).start()

        # Aufräumen nach einem Neustart
        self.store.offene_sitzungen_beenden("neustart")
        n = self.store.unterbrochene_auftraege_markieren()
        if n:
            log.warning("%d Druckauftrag/-aufträge nach Neustart auf «unbekannt» gesetzt", n)

    @property
    def galerie(self):
        """Welche Galerie gilt, entscheidet «galerie_anbieter» – umschaltbar ohne Neustart."""
        if self._feste_galerie:
            return self._feste_galerie
        e = self.store.einstellungen()
        if e["galerie_anbieter"] == "r2":
            return R2Galerie(e["r2_konto_id"], e["r2_bucket"], e["r2_zugangs_id"], e["r2_geheimnis"],
                             e["r2_oeffentliche_url"], eu=bool(e["r2_eu"]))
        return self._sim_galerie

    @property
    def drucker(self):
        """Welcher Drucker gilt, entscheidet «drucker_modus» (simuliert | cups) – umschaltbar ohne Neustart."""
        if self._fester_drucker:
            return self._fester_drucker
        if self.e("drucker_modus") != "cups":
            return self._sim_drucker
        schluessel = (self.e("drucker_name"), self.e("druck_medium"))
        if schluessel not in self._echte_drucker:
            from .drucker_cups import CupsDrucker  # noqa: PLC0415
            self._echte_drucker[schluessel] = CupsDrucker(druckername=schluessel[0], medium=schluessel[1])
        return self._echte_drucker[schluessel]

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

    def _kamera_beobachten(self):
        while True:
            try:
                # Livebild-Wächter: Holt niemand mehr Bilder ab (z. B. Browser geschlossen),
                # wird das Livebild gestoppt – schont Akku und Sensor.
                if self._livebild_an and time.monotonic() - self._livebild_zuletzt > 10:
                    log.info("Livebild gestoppt (keine Abrufe mehr)")
                    self.livebild_stoppen()
                k = self.kamera
                if not k.simuliert:
                    k.status(frisch=True)  # frische Prüfung, Ergebnis landet im Zwischenspeicher
            except Exception:  # noqa: BLE001 – z. B. Datenbank geschlossen beim Beenden
                return
            time.sleep(6)

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
            v = self.store.veranstaltung(s["veranstaltung_id"])
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
                               thema_name=v["thema"], namen=v["namen"], datum_text=v["datum_text"])
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
            self.livebild_stoppen()  # nach dem Foto wird kein Livebild mehr gebraucht

    # ---------- Livebild ----------
    def livebild_starten(self, sid: str) -> bool:
        """True = Livebild läuft. False = kein Livebild (ausgeschaltet oder Kamera kann es nicht);
        der Ablauf funktioniert dann einfach ohne."""
        with self._lock:
            self._pruefe_aktiv(sid)
        if not self.e("livebild"):
            return False
        try:
            self.kamera.livebild_start()
        except KameraFehler as e:
            log.warning("Livebild nicht verfügbar: %s", e)
            return False
        self._livebild_an = True
        self._livebild_zuletzt = time.monotonic()
        return True

    def livebild_bild(self, sid: str) -> bytes:
        with self._lock:
            self._pruefe_aktiv(sid)          # Livebild nur für die laufende Sitzung
        if not self._livebild_an:
            raise FotoboxFehler("kein_livebild")
        self._livebild_zuletzt = time.monotonic()
        try:
            return self.kamera.livebild_bild()
        except KameraFehler as e:
            raise FotoboxFehler("kein_livebild", str(e)) from e

    def vorfokussieren(self, sid: str) -> bool:
        """Beim Start des Countdowns: Kamera schon scharfstellen lassen (nur mit laufendem Livebild)."""
        with self._lock:
            self._pruefe_aktiv(sid)
        if not self._livebild_an:
            return False
        try:
            self.kamera.vorfokussieren()
            return True
        except Exception:  # noqa: BLE001 – ohne Vorfokus stellt die Kamera beim Auslösen selbst scharf
            log.exception("Vorfokussieren fehlgeschlagen")
            return False

    def livebild_stoppen(self):
        if self._livebild_an:
            self._livebild_an = False
            try:
                self.kamera.livebild_stop()
            except Exception:  # noqa: BLE001 – Stoppen darf nie den Ablauf stören
                log.exception("Livebild stoppen fehlgeschlagen")

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
        drucker = self.drucker  # derselbe Drucker auch fürs Beobachten, selbst wenn umgeschaltet wird
        try:
            drucker.einreichen(did, Path(auftrag["datei"]), auftrag["abzuege"])
        except Exception as e:  # noqa: BLE001
            log.exception("Druckauftrag %s konnte nicht übergeben werden", did)
            self.store.setze_druckstatus(did, "fehlgeschlagen", f"Übergabe fehlgeschlagen: {e}")
            return
        self.store.setze_druckstatus(did, "warteschlange")
        log.info("Druckauftrag %s übergeben (%d Abzug/Abzüge)", did, auftrag["abzuege"])
        threading.Thread(target=self._druck_beobachten, args=(did, drucker), daemon=True).start()

    def _druck_beobachten(self, did: str, drucker=None):
        drucker = drucker or self.drucker
        ende = time.monotonic() + DRUCK_ZEITLIMIT_S
        while time.monotonic() < ende:
            erg = drucker.ergebnis(did)
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
        self.livebild_stoppen()  # nach Sitzungsende nie ein Livebild weiterlaufen lassen

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

    # ---------- Veranstaltungen (Betreiber) ----------
    def veranstaltung_anlegen(self, anlass, namen, datum_text, thema, aktivieren=False) -> dict:
        with self._lock:
            if aktivieren and (self._aktiv or self._aufnahme_laeuft):
                raise FotoboxFehler("sitzung_laeuft", "Bitte warten, bis die laufende Gästesitzung beendet ist")
            v = self.store.neue_veranstaltung(anlass, namen, datum_text, thema, aktiv=aktivieren)
        log.info("Betreiber: Veranstaltung angelegt %s (%s %s)%s", v["id"], anlass, namen, " und aktiviert" if aktivieren else "")
        return v

    def veranstaltung_aktivieren(self, vid: str):
        with self._lock:
            if self._aktiv or self._aufnahme_laeuft:
                raise FotoboxFehler("sitzung_laeuft", "Bitte warten, bis die laufende Gästesitzung beendet ist")
            v = self.store.veranstaltung(vid)
            if not v:
                raise FotoboxFehler("veranstaltung_unbekannt")
            if v["bilder_status"] != "vorhanden":
                raise FotoboxFehler("aktion_ungueltig", "Bilder dieser Veranstaltung liegen im Papierkorb")
            self.store.aktiviere_veranstaltung(vid)
        log.info("Betreiber: Veranstaltung %s aktiviert", vid)

    def exportieren(self, vid: str, basis: Path) -> dict:
        """Kopiert Originale und Postkarten in einen Exportordner. Kopieren, nicht verschieben:
        Die Fotobox behält ihre Dateien. Bereits vorhandene Dateien werden übersprungen."""
        v = self.store.veranstaltung(vid)
        if not v:
            raise FotoboxFehler("veranstaltung_unbekannt")
        name = "".join(c if c.isalnum() or c in " -_&" else "_" for c in f"{v['anlass']} {v['namen']}").strip()
        ziel = basis / f"{name} ({v['erstellt'][:10]})"
        anzahl = {"originale": 0, "postkarten": 0}
        try:
            for art, unterordner in (("originale", "Originale"), ("karten", "Postkarten")):
                quelle = self.ordner(vid, art)
                if not quelle.exists():
                    continue
                (ziel / unterordner).mkdir(parents=True, exist_ok=True)
                for datei in sorted(quelle.glob("*.jpg")):
                    if "_FALSCHE_KAMERA" in datei.name:
                        continue
                    z = ziel / unterordner / datei.name
                    if not (z.exists() and z.stat().st_size == datei.stat().st_size):
                        shutil.copy2(datei, z)
                    anzahl["originale" if art == "originale" else "postkarten"] += 1
        except OSError as e:
            log.exception("Export fehlgeschlagen")
            raise FotoboxFehler("export", str(e)) from e
        log.info("Betreiber: Export %s nach %s (%s)", vid, ziel, anzahl)
        return {"ordner": str(ziel), **anzahl}

    def bilder_in_papierkorb(self, vid: str, bestaetigung: str):
        """Löscht NICHT endgültig, sondern verschiebt die Bilder in daten/papierkorb.
        Von dort kann man sie im Explorer zurückholen oder endgültig löschen."""
        if bestaetigung != "LÖSCHEN":
            raise FotoboxFehler("bestaetigung_fehlt", "Zum Bestätigen LÖSCHEN eingeben")
        with self._lock:
            v = self.store.veranstaltung(vid)
            if not v:
                raise FotoboxFehler("veranstaltung_unbekannt")
            if v["aktiv"]:
                raise FotoboxFehler("aktion_ungueltig", "Die aktive Veranstaltung kann nicht gelöscht werden – zuerst eine andere aktivieren")
            quelle = self.daten / "veranstaltungen" / vid
            if quelle.exists():
                ziel = self.daten / "papierkorb" / f"{vid}_{time.strftime('%Y%m%d-%H%M%S')}"
                ziel.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(quelle), str(ziel))
            self.store.setze_bilder_status(vid, "im_papierkorb")
        log.warning("Betreiber: Bilder der Veranstaltung %s in den Papierkorb verschoben", vid)

    # ---------- Online-Galerie ----------
    def galerie_freigeben(self, sid: str) -> dict:
        """Gast möchte sein Foto aufs Handy: Upload-Auftrag anlegen und die Adresse für den
        QR-Code sofort zurückgeben – auch wenn gerade kein Internet da ist."""
        with self._lock:
            s = self._pruefe_aktiv(sid)
        if self.e("galerie_modus") == "aus":
            raise FotoboxFehler("galerie_aus")
        if not s["karte"]:
            raise FotoboxFehler("keine_aufnahme")
        # Lange Zufallskennung: Die Adresse lässt sich nicht erraten (ca. 128 Bit)
        schluessel = f"{s['veranstaltung_id']}/{secrets.token_urlsafe(16)}.jpg"
        u = self.store.upload_anlegen(sid, s["veranstaltung_id"], s["karte"], schluessel, self.galerie.url(schluessel))
        threading.Thread(target=self.galerie_abarbeiten, daemon=True).start()  # sofort versuchen
        log.info("Sitzung %s: Foto für die Online-Galerie freigegeben", sid)
        return {"url": u["url"], "status": u["status"], "tage": int(self.e("galerie_tage"))}

    def galerie_abarbeiten(self, warten: bool = False) -> int:
        """Lädt alle wartenden Fotos hoch. Fehler (z. B. kein Internet) -> später erneut versuchen.
        warten=False: läuft schon ein Durchgang, sofort zurückkehren (Hintergrund-Arbeiter)."""
        if not self._upload_lock.acquire(blocking=warten, timeout=30 if warten else -1):
            return 0  # läuft schon
        hochgeladen = 0
        try:
            for u in self.store.uploads("wartend"):
                try:
                    self.galerie.hochladen(Path(u["datei"]), u["schluessel"])
                except (GalerieFehler, OSError) as e:
                    endgueltig = u["versuche"] + 1 >= MAX_UPLOAD_VERSUCHE
                    self.store.upload_ergebnis(u["id"], "fehlgeschlagen" if endgueltig else "wartend", str(e)[:300])
                    if endgueltig:
                        log.error("Upload %s endgültig fehlgeschlagen: %s", u["id"], e)
                    break  # ohne Internet die übrigen gar nicht erst versuchen
                self.store.upload_ergebnis(u["id"], "online")
                hochgeladen += 1
        finally:
            self._upload_lock.release()
        if hochgeladen:
            log.info("Online-Galerie: %d Foto(s) hochgeladen", hochgeladen)
        return hochgeladen

    def _galerie_arbeiter(self):
        while True:
            time.sleep(UPLOAD_INTERVALL_S)
            try:
                self.galerie_abarbeiten()
            except Exception:  # noqa: BLE001 – z. B. Datenbank geschlossen beim Beenden
                return

    def geraetestatus(self) -> dict:
        return {"kamera": {"name": self.kamera.name, "simuliert": self.kamera.simuliert, **self.kamera.status()},
                "drucker": {"name": self.drucker.name, "simuliert": self.drucker.simuliert, **self.drucker.status()},
                "galerie": {"name": self.galerie.name, "simuliert": self.galerie.simuliert, **self.galerie.status(),
                            **self.store.upload_zaehler()},
                "speicher_frei_mb": round(self.speicher_mb())}
