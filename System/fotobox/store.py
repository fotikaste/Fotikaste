"""Speicher: Einstellungen, Veranstaltungen, Sitzungen und Druckaufträge in einer SQLite-Datei.

SQLite schreibt jede Änderung in einer «Transaktion». Stürzt das Programm mitten
im Schreiben ab, bleibt der alte, gültige Stand erhalten. Darum überleben Zähler
und Druckaufträge einen Neustart.
"""
from __future__ import annotations

import json
import secrets
import sqlite3
import threading
from datetime import datetime
from pathlib import Path

# Standardwerte. Jede Einstellung ist später im Betreiberbereich änderbar.
STANDARD_EINSTELLUNGEN = {
    "thema": "elegant",
    "countdown_s": 3,
    "max_wiederholungen": 2,
    "max_abzuege_pro_sitzung": 2,
    "inaktiv_s": 60,           # ohne Taste bis zur Frage «Noch da?»
    "inaktiv_warnung_s": 10,   # Dauer der Frage, danach zurück zum Start
    "abschluss_s": 8,          # Dankesbildschirm bis zur Rückkehr
    "druckkontingent": 300,
    "betreiber_pin": "1234",
    # Druckformat (Beispielformat für den Prototyp: Postkarte 10x15 cm quer, 300 dpi)
    "druck_breite_px": 1800,
    "druck_hoehe_px": 1200,
    "druck_dpi": 300,
    # Simulation
    "kamera_modus": "simuliert",       # simuliert | digicamcontrol_app (schnell) | digicamcontrol (langsam) | (später: gphoto2)
    "kamera_autofokus": False,         # False = ohne Scharfstellen auslösen (Objektiv auf MF stellen)
    "sim_kamera_verhalten": "ok",      # ok | nicht_verbunden | zeitueberschreitung
    "drucker_modus": "simuliert",
    "sim_drucker_verhalten": "ok",     # ok | naechster_fehlgeschlagen | naechster_unbekannt
    "sim_druck_dauer_s": 3,
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS einstellungen (schluessel TEXT PRIMARY KEY, wert TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS veranstaltungen (
    id TEXT PRIMARY KEY, anlass TEXT, namen TEXT, datum_text TEXT,
    erstellt TEXT NOT NULL, aktiv INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sitzungen (
    id TEXT PRIMARY KEY, veranstaltung_id TEXT NOT NULL, status TEXT NOT NULL,
    gestartet TEXT NOT NULL, beendet TEXT, aufnahmen INTEGER NOT NULL DEFAULT 0,
    original TEXT, karte TEXT, vorschau TEXT);
CREATE TABLE IF NOT EXISTS druckauftraege (
    id TEXT PRIMARY KEY, sitzung_id TEXT NOT NULL UNIQUE, veranstaltung_id TEXT NOT NULL,
    abzuege INTEGER NOT NULL, status TEXT NOT NULL, simuliert INTEGER NOT NULL,
    datei TEXT, meldung TEXT, erstellt TEXT NOT NULL, aktualisiert TEXT NOT NULL,
    nachdruck_von TEXT);
"""
# Hinweis: sitzung_id ist UNIQUE. Die Datenbank selbst verhindert so einen
# zweiten Druckauftrag für dieselbe Sitzung (z. B. bei Doppeldruck auf «Drucken»).
# Nachdrucke durch den Betreiber erhalten eine eigene Pseudo-Sitzungskennung.

# angefordert   -> Auftrag angelegt, noch nicht an den Drucker übergeben
# warteschlange -> an Drucker/Betriebssystem übergeben (noch KEIN Beweis für einen Abzug)
# erfolgreich   -> Abzug bestätigt (zählt fürs Kontingent)
# fehlgeschlagen-> sicher nicht gedruckt; Betreiber entscheidet: nachdrucken oder verwerfen
# unbekannt     -> Ausgang unklar; Betreiber prüft am Drucker und entscheidet
# ersetzt       -> fehlgeschlagener Auftrag, für den ein Nachdruck angelegt wurde
# verworfen     -> Betreiber hat entschieden, nicht nachzudrucken
DRUCK_STATUS = ("angefordert", "warteschlange", "erfolgreich", "fehlgeschlagen", "unbekannt", "ersetzt", "verworfen")


def jetzt() -> str:
    return datetime.now().isoformat(timespec="seconds")


def neue_id(prefix: str) -> str:
    return f"{prefix}-{datetime.now():%Y%m%d-%H%M%S}-{secrets.token_hex(3)}"


class Store:
    def __init__(self, db_pfad: Path):
        db_pfad.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._db = sqlite3.connect(db_pfad, check_same_thread=False, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=FULL")
        self._db.executescript(SCHEMA)

    def schliessen(self):
        with self._lock:
            self._db.close()

    def _q(self, sql, args=()):
        with self._lock:
            return self._db.execute(sql, args)

    # ---------- Einstellungen ----------
    def einstellungen(self) -> dict:
        werte = dict(STANDARD_EINSTELLUNGEN)
        for row in self._q("SELECT schluessel, wert FROM einstellungen"):
            werte[row["schluessel"]] = json.loads(row["wert"])
        return werte

    def einstellung(self, schluessel):
        return self.einstellungen()[schluessel]

    def setze_einstellung(self, schluessel, wert):
        if schluessel not in STANDARD_EINSTELLUNGEN:
            raise KeyError(schluessel)
        self._q("INSERT INTO einstellungen VALUES (?, ?) ON CONFLICT(schluessel) DO UPDATE SET wert=excluded.wert",
                (schluessel, json.dumps(wert)))

    def geheimschluessel(self) -> str:
        row = self._q("SELECT wert FROM einstellungen WHERE schluessel='_geheim'").fetchone()
        if row:
            return json.loads(row["wert"])
        s = secrets.token_hex(32)
        self._q("INSERT INTO einstellungen VALUES ('_geheim', ?)", (json.dumps(s),))
        return s

    # ---------- Veranstaltungen ----------
    def aktive_veranstaltung(self) -> dict:
        row = self._q("SELECT * FROM veranstaltungen WHERE aktiv=1").fetchone()
        if row:
            return dict(row)
        vid = neue_id("V")
        self._q("INSERT INTO veranstaltungen VALUES (?, ?, ?, ?, ?, 1)",
                (vid, "Hochzeit", "Lea & Noah", "Samstag, 14. Juni 2027", jetzt()))
        return self.aktive_veranstaltung()

    def aendere_veranstaltung(self, vid, anlass, namen, datum_text):
        self._q("UPDATE veranstaltungen SET anlass=?, namen=?, datum_text=? WHERE id=?",
                (anlass, namen, datum_text, vid))

    # ---------- Sitzungen ----------
    def neue_sitzung(self, veranstaltung_id) -> dict:
        sid = neue_id("S")
        self._q("INSERT INTO sitzungen (id, veranstaltung_id, status, gestartet) VALUES (?, ?, 'aktiv', ?)",
                (sid, veranstaltung_id, jetzt()))
        return self.sitzung(sid)

    def sitzung(self, sid):
        row = self._q("SELECT * FROM sitzungen WHERE id=?", (sid,)).fetchone()
        return dict(row) if row else None

    def aktualisiere_sitzung(self, sid, **felder):
        teile = ", ".join(f"{k}=?" for k in felder)
        self._q(f"UPDATE sitzungen SET {teile} WHERE id=?", (*felder.values(), sid))

    def offene_sitzungen_beenden(self, grund="neustart"):
        self._q("UPDATE sitzungen SET status=?, beendet=? WHERE status='aktiv'", (grund, jetzt()))

    def anzahl_sitzungen(self, veranstaltung_id) -> int:
        return self._q("SELECT COUNT(*) FROM sitzungen WHERE veranstaltung_id=?", (veranstaltung_id,)).fetchone()[0]

    # ---------- Druckaufträge ----------
    def neuer_druckauftrag(self, sitzung_id, veranstaltung_id, abzuege, simuliert, datei, nachdruck_von=None):
        """Legt einen Auftrag an. Existiert für die Sitzung schon einer, wird dieser zurückgegeben."""
        with self._lock:
            vorhanden = self._q("SELECT * FROM druckauftraege WHERE sitzung_id=?", (sitzung_id,)).fetchone()
            if vorhanden:
                return dict(vorhanden), False
            did = neue_id("D")
            t = jetzt()
            self._q("INSERT INTO druckauftraege VALUES (?, ?, ?, ?, 'angefordert', ?, ?, NULL, ?, ?, ?)",
                    (did, sitzung_id, veranstaltung_id, abzuege, int(simuliert), datei, t, t, nachdruck_von))
            return self.druckauftrag(did), True

    def druckauftrag(self, did):
        row = self._q("SELECT * FROM druckauftraege WHERE id=?", (did,)).fetchone()
        return dict(row) if row else None

    def setze_druckstatus(self, did, status, meldung=None):
        assert status in DRUCK_STATUS, status
        self._q("UPDATE druckauftraege SET status=?, meldung=?, aktualisiert=? WHERE id=?",
                (status, meldung, jetzt(), did))

    def druckauftraege(self, nur_probleme=False, limit=50):
        sql = "SELECT * FROM druckauftraege"
        if nur_probleme:
            sql += " WHERE status IN ('fehlgeschlagen', 'unbekannt')"
        sql += " ORDER BY erstellt DESC LIMIT ?"
        return [dict(r) for r in self._q(sql, (limit,))]

    def unterbrochene_auftraege_markieren(self) -> int:
        """Nach einem Neustart: Aufträge, deren Ausgang wir nicht kennen, werden «unbekannt».
        Sie werden NIE automatisch wiederholt – der Betreiber entscheidet."""
        cur = self._q("UPDATE druckauftraege SET status='unbekannt', meldung='Programm wurde während des Drucks beendet', "
                      "aktualisiert=? WHERE status IN ('angefordert', 'warteschlange')", (jetzt(),))
        return cur.rowcount

    def zaehler(self, veranstaltung_id=None) -> dict:
        """Gedruckte Abzüge, getrennt nach simuliert und echt. Offene/unklare Aufträge zählen
        als «reserviert», damit das Kontingent nicht überschritten werden kann."""
        where, args = "", ()
        if veranstaltung_id:
            where, args = "WHERE veranstaltung_id=?", (veranstaltung_id,)
        z = {"echt": 0, "simuliert": 0, "reserviert": 0, "fehlgeschlagen": 0}
        for r in self._q(f"SELECT status, simuliert, SUM(abzuege) n FROM druckauftraege {where} GROUP BY status, simuliert", args):
            n = r["n"] or 0
            if r["status"] == "erfolgreich":
                z["simuliert" if r["simuliert"] else "echt"] += n
            elif r["status"] in ("angefordert", "warteschlange", "unbekannt"):
                z["reserviert"] += n
            elif r["status"] == "fehlgeschlagen":
                z["fehlgeschlagen"] += n
        return z
