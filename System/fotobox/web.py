"""Webserver: verbindet die Oberfläche im Browser mit dem Sitzungsablauf.

Gäste:     /            (Vollbild-Oberfläche)
Betreiber: /betrieb     (mit PIN geschützt)
Schnittstelle (API = «Programmierschnittstelle»): /api/...
"""
from __future__ import annotations

import logging
import secrets
import time
from pathlib import Path

from flask import Flask, jsonify, request, send_file, send_from_directory, session

from .ablauf import Fotobox, FotoboxFehler
from .store import STANDARD_EINSTELLUNGEN
from .themen import THEMEN, thema

STATIC = Path(__file__).parent / "static"
log = logging.getLogger("fotobox")

# Diese Einstellungen darf der Betreiber über die Betriebsseite ändern (mit Typ)
AENDERBAR = {k: type(v) for k, v in STANDARD_EINSTELLUNGEN.items()}


def erstelle_app(box: Fotobox) -> Flask:
    app = Flask(__name__, static_folder=str(STATIC), static_url_path="/static")
    app.secret_key = box.store.geheimschluessel()
    app.config["SESSION_COOKIE_SAMESITE"] = "Strict"

    @app.errorhandler(FotoboxFehler)
    def fotobox_fehler(e: FotoboxFehler):
        status = 409 if e.code in ("beschaeftigt", "sitzung_ungueltig", "keine_wiederholung", "aktion_ungueltig") else 503
        if e.code in ("abzuege_ungueltig", "auftrag_unbekannt"):
            status = 400
        return jsonify({"fehler": e.code}), status

    @app.errorhandler(Exception)
    def unerwartet(e):
        from werkzeug.exceptions import HTTPException
        if isinstance(e, HTTPException):
            return e
        log.exception("Unerwarteter Fehler")
        return jsonify({"fehler": "intern"}), 500

    @app.after_request
    def kein_cache(resp):
        # Gästefotos dürfen nicht im Browser-Zwischenspeicher liegen bleiben
        if request.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    # ---------------- Gäste ----------------
    @app.get("/")
    def gast():
        return send_from_directory(STATIC / "gast", "index.html")

    @app.get("/api/konfig")
    def konfig():
        e = box.store.einstellungen()
        v = box.store.aktive_veranstaltung()
        t = thema(e["thema"])
        return jsonify({
            "thema": {"name": e["thema"], "farben": t["farben"], "schrift": t["schrift"], "name_gr": t["name_gr"], "deko": t["deko"]},
            "veranstaltung": {"anlass": v["anlass"], "namen": v["namen"], "datum_text": v["datum_text"]},
            "countdown_s": e["countdown_s"], "max_abzuege": e["max_abzuege_pro_sitzung"],
            "inaktiv_s": e["inaktiv_s"], "inaktiv_warnung_s": e["inaktiv_warnung_s"], "abschluss_s": e["abschluss_s"],
            "druck_verbleibend": box.kontingent()["verbleibend"],
            "seitenverhaeltnis": e["druck_breite_px"] / e["druck_hoehe_px"],
        })

    @app.post("/api/sitzung")
    def sitzung_start():
        anfrage = (request.get_json(silent=True) or {}).get("anfrage_id")
        s = box.sitzung_starten(anfrage)
        return jsonify({"id": s["id"]})

    @app.post("/api/sitzung/<sid>/aufnahme")
    def aufnahme(sid):
        return jsonify(box.aufnehmen(sid))

    @app.get("/api/sitzung/<sid>/vorschau.jpg")
    def vorschau(sid):
        return send_file(box.vorschau_datei(sid), mimetype="image/jpeg", max_age=0)

    @app.post("/api/sitzung/<sid>/drucken")
    def drucken(sid):
        try:
            abzuege = int((request.get_json(silent=True) or {}).get("abzuege", 1))
        except (TypeError, ValueError):
            raise FotoboxFehler("abzuege_ungueltig")
        a = box.drucken(sid, abzuege)
        return jsonify({"auftrag_id": a["id"], "status": a["status"]})

    @app.get("/api/druck/<did>")
    def druckstatus(did):
        return jsonify({"status": box.druckstatus(did)})

    @app.post("/api/sitzung/<sid>/ende")
    def ende(sid):
        grund = (request.get_json(silent=True) or {}).get("grund", "beendet")
        box.sitzung_beenden(sid, grund)
        return jsonify({"ok": True})

    # ---------------- Betreiber ----------------
    def angemeldet():
        return session.get("betreiber") is True

    @app.get("/betrieb")
    def betrieb():
        return send_from_directory(STATIC / "betrieb", "index.html")

    @app.post("/api/betrieb/anmelden")
    def anmelden():
        pin = str((request.get_json(silent=True) or {}).get("pin", ""))
        if secrets.compare_digest(pin, str(box.e("betreiber_pin"))):
            session["betreiber"] = True
            log.info("Betreiber angemeldet")
            return jsonify({"ok": True})
        time.sleep(1)  # bremst Durchprobieren
        log.warning("Falsche Betreiber-PIN")
        return jsonify({"fehler": "pin"}), 403

    @app.post("/api/betrieb/abmelden")
    def abmelden():
        session.clear()
        return jsonify({"ok": True})

    @app.before_request
    def schutz():
        if request.path.startswith("/api/betrieb/") and request.path != "/api/betrieb/anmelden" and not angemeldet():
            return jsonify({"fehler": "nicht_angemeldet"}), 401

    @app.get("/api/betrieb/status")
    def b_status():
        v = box.store.aktive_veranstaltung()
        e = box.store.einstellungen()
        e.pop("betreiber_pin", None)
        return jsonify({
            "geraete": box.geraetestatus(),
            "veranstaltung": {**v, "sitzungen": box.store.anzahl_sitzungen(v["id"])},
            "kontingent": box.kontingent(),
            "einstellungen": e,
            "themen": {k: t["titel"] for k, t in THEMEN.items()},
            "auftraege": box.store.druckauftraege(limit=30),
            "protokoll": protokoll_ende(box.daten / "protokoll" / "fotobox.log", 40),
        })

    @app.post("/api/betrieb/auftrag/<did>/<aktion>")
    def b_auftrag(did, aktion):
        if aktion == "nachdrucken":
            return jsonify(box.nachdrucken(did))
        box.auftrag_entscheiden(did, aktion)
        return jsonify({"ok": True})

    @app.post("/api/betrieb/einstellungen")
    def b_einstellungen():
        daten = request.get_json(silent=True) or {}
        for k, wert in daten.items():
            if k not in AENDERBAR:
                return jsonify({"fehler": f"unbekannt: {k}"}), 400
            try:
                wert = AENDERBAR[k](wert)
            except (TypeError, ValueError):
                return jsonify({"fehler": f"ungültig: {k}"}), 400
            box.store.setze_einstellung(k, wert)
            log.info("Einstellung geändert: %s", k if k == "betreiber_pin" else f"{k} = {wert}")
        return jsonify({"ok": True})

    @app.post("/api/betrieb/veranstaltung")
    def b_veranstaltung():
        d = request.get_json(silent=True) or {}
        v = box.store.aktive_veranstaltung()
        box.store.aendere_veranstaltung(v["id"], d.get("anlass", v["anlass"]), d.get("namen", v["namen"]),
                                        d.get("datum_text", v["datum_text"]))
        return jsonify({"ok": True})

    return app


def protokoll_ende(pfad: Path, zeilen: int) -> list[str]:
    try:
        with open(pfad, encoding="utf-8", errors="replace") as f:
            return f.readlines()[-zeilen:]
    except OSError:
        return []
