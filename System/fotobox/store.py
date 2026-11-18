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
    "kamera_modus": "simuliert",       # simuliert | digicamcontrol_app (schnell) | digicamcontrol (langsam) | gphoto2 (Linux/Pi)
    "livebild": True,                  # Livebild während der Sitzung zeigen (falls die Kamera es kann)
    "kamera_autofokus": False,        # False = ohne Scharfstellen auslösen (Objektiv auf MF stellen)
    "sim_kamera_verhalten": "ok",      # ok | nicht_verbunden | zeitueberschreitung
    "drucker_modus": "simuliert",      # simuliert | cups (echter Drucker unter Linux / Raspberry Pi)
    "drucker_name": "DS620",           # Name des Druckers in CUPS
    "druck_medium": "w288h432",        # CUPS-Papiergrösse: 4x6 Zoll = 10x15 cm
    "sim_drucker_verhalten": "ok",     # ok | naechster_fehlgeschlagen | naechster_unbekannt
    "sim_druck_dauer_s": 3,
    # Online-Galerie (Fotos fürs Handy per QR-Code)
    "galerie_modus": "nachfrage",      # aus | nachfrage (Gast entscheidet) | immer
    "galerie_anbieter": "simuliert",   # simuliert | r2 (Cloudflare R2)
    # Cloudflare R2 – Werte aus dem Cloudflare-Dashboard (Geheimnis nie anzeigen/zurückgeben!)
    "r2_konto_id": "",
    "r2_bucket": "",
    "r2_eu": True,                     # Bucket mit Speicherort «EU» (beim Anlegen festgelegt)
    "r2_oeffentliche_url": "",         # z. B. die «Public Development URL» des Buckets
    "r2_zugangs_id": "",
    "r2_geheimnis": "",
    "galerie_tage": 30,                # so lange bleibt ein Foto online (Hinweis für Gäste)
    "sim_galerie_verhalten": "ok",     # ok | offline (Simulation: kein Internet)
    "wlan_code": "",                   # Kunden-Code für «Internet einrichten» (4–8 Ziffern); leer = nur mit Betreiber-PIN
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
CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY, sitzung_id TEXT NOT NULL UNIQUE, veranstaltung_id TEXT NOT NULL,
    datei TEXT NOT NULL, schluessel TEXT NOT NULL, url TEXT NOT NULL, status TEXT NOT NULL,
    versuche INTEGER NOT NULL DEFAULT 0, meldung TEXT, erstellt TEXT NOT NULL, aktualisiert TEXT NOT NULL);
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


class _Ergebnis:
    """Bereits vollständig gelesenes Abfrageergebnis (verhält sich wie ein sqlite-Cursor)."""

    def __init__(self, zeilen, rowcount):
        self._zeilen, self.rowcount = zeilen, rowcount

    def fetchone(self):
        return self._zeilen[0] if self._zeilen else None

    def fetchall(self):
        return self._zeilen

    def __iter__(self):
        return iter(self._zeilen)


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
        self._migrieren()

    def _migrieren(self):
        """Ergänzt neue Spalten in bestehenden Datenbanken, ohne Daten zu verlieren."""
        spalten = {r["name"] for r in self._q("PRAGMA table_info(veranstaltungen)")}
        if "thema" not in spalten:
            self._q("ALTER TABLE veranstaltungen ADD COLUMN thema TEXT")
        if "bilder_status" not in spalten:
            self._q("ALTER TABLE veranstaltungen ADD COLUMN bilder_status TEXT NOT NULL DEFAULT 'vorhanden'")
        # Postkarte (2026-11-16): Rahmen und eigener Kartentext. Leer = Namen/Datum der Veranstaltung.
        if "rahmen" not in spalten:
            self._q("ALTER TABLE veranstaltungen ADD COLUMN rahmen TEXT NOT NULL DEFAULT 'klassisch'")
        if "karte_zeile1" not in spalten:
            self._q("ALTER TABLE veranstaltungen ADD COLUMN karte_zeile1 TEXT NOT NULL DEFAULT ''")
        if "karte_zeile2" not in spalten:
            self._q("ALTER TABLE veranstaltungen ADD COLUMN karte_zeile2 TEXT NOT NULL DEFAULT ''")
        if "karte_zeile2_aus" not in spalten:
            self._q("ALTER TABLE veranstaltungen ADD COLUMN karte_zeile2_aus INTEGER NOT NULL DEFAULT 0")

    def schliessen(self):
        with self._lock:
            self._db.close()

    def _q(self, sql, args=()):
        """Führt eine Abfrage aus und liest das Ergebnis vollständig, solange die Sperre gilt.
        Wichtig, weil mehrere Hintergrund-Arbeiter (Druck, Kamera, Upload) dieselbe Verbindung
        nutzen: Ein halb gelesenes Ergebnis könnte sonst von einer anderen Abfrage überschrieben werden."""
        with self._lock:
            cur = self._db.execute(sql, args)
            return _Ergebnis(cur.fetchall(), cur.rowcount)

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
            return self._mit_thema(dict(row))
        self.neue_veranstaltung("Hochzeit", "Lea & Noah", "Samstag, 14. Juni 2027", aktiv=True)
        return self.aktive_veranstaltung()

    def _mit_thema(self, v: dict) -> dict:
        v["thema"] = v.get("thema") or self.einstellung("thema")
        return v

    def neue_veranstaltung(self, anlass, namen, datum_text, thema=None, aktiv=False) -> dict:
        vid = neue_id("V")
        with self._lock:
            if aktiv:
                self._q("UPDATE veranstaltungen SET aktiv=0")
            self._q("INSERT INTO veranstaltungen (id, anlass, namen, datum_text, erstellt, aktiv, thema) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (vid, anlass, namen, datum_text, jetzt(), int(aktiv), thema or self.einstellung("thema")))
        return self.veranstaltung(vid)

    def veranstaltung(self, vid):
        row = self._q("SELECT * FROM veranstaltungen WHERE id=?", (vid,)).fetchone()
        return self._mit_thema(dict(row)) if row else None

    def veranstaltungen(self) -> list[dict]:
        sql = """SELECT v.*,
                   (SELECT COUNT(*) FROM sitzungen s WHERE s.veranstaltung_id=v.id) AS sitzungen,
                   (SELECT COALESCE(SUM(abzuege),0) FROM druckauftraege d
                     WHERE d.veranstaltung_id=v.id AND d.status='erfolgreich') AS abzuege
                 FROM veranstaltungen v ORDER BY v.aktiv DESC, v.erstellt DESC"""
        return [self._mit_thema(dict(r)) for r in self._q(sql)]

    def aktiviere_veranstaltung(self, vid):
        with self._lock:
            if not self.veranstaltung(vid):
                raise KeyError(vid)
            self._q("UPDATE veranstaltungen SET aktiv = (id = ?)", (vid,))

    def aendere_veranstaltung(self, vid, anlass, namen, datum_text, thema=None):
        self._q("UPDATE veranstaltungen SET anlass=?, namen=?, datum_text=?, thema=COALESCE(?, thema) WHERE id=?",
                (anlass, namen, datum_text, thema, vid))

    def setze_karte(self, vid, rahmen, zeile1, zeile2, zeile2_aus):
        self._q("UPDATE veranstaltungen SET rahmen=?, karte_zeile1=?, karte_zeile2=?, karte_zeile2_aus=? WHERE id=?",
                (rahmen, zeile1, zeile2, int(bool(zeile2_aus)), vid))

    def setze_bilder_status(self, vid, status):
        self._q("UPDATE veranstaltungen SET bilder_status=? WHERE id=?", (status, vid))

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

    # ---------- Uploads in die Online-Galerie ----------
    # status: wartend (noch nicht online) | online | fehlgeschlagen (nach vielen Versuchen)
    def upload_anlegen(self, sitzung_id, veranstaltung_id, datei, schluessel, url) -> dict:
        """Pro Sitzung höchstens ein Upload – ein zweiter Wunsch liefert den bestehenden zurück."""
        with self._lock:
            row = self._q("SELECT * FROM uploads WHERE sitzung_id=?", (sitzung_id,)).fetchone()
            if row:
                return dict(row)
            t = jetzt()
            uid = neue_id("U")
            self._q("INSERT INTO uploads VALUES (?, ?, ?, ?, ?, ?, 'wartend', 0, NULL, ?, ?)",
                    (uid, sitzung_id, veranstaltung_id, datei, schluessel, url, t, t))
            return dict(self._q("SELECT * FROM uploads WHERE id=?", (uid,)).fetchone())

    def uploads(self, status=None, limit=1000) -> list[dict]:
        sql, args = "SELECT * FROM uploads", ()
        if status:
            sql, args = sql + " WHERE status=?", (status,)
        return [dict(r) for r in self._q(sql + " ORDER BY erstellt LIMIT ?", (*args, limit))]

    def upload_ergebnis(self, uid, status, meldung=None):
        self._q("UPDATE uploads SET status=?, meldung=?, versuche=versuche+1, aktualisiert=? WHERE id=?",
                (status, meldung, jetzt(), uid))

    def upload_zaehler(self) -> dict:
        z = {"wartend": 0, "online": 0, "fehlgeschlagen": 0}
        for r in self._q("SELECT status, COUNT(*) n FROM uploads GROUP BY status"):
            z[r["status"]] = r["n"]
        return z

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
