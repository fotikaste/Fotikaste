"""Webserver: verbindet die Oberfläche im Browser mit dem Sitzungsablauf.

Gäste:     /            (Vollbild-Oberfläche)
Betreiber: /betrieb     (mit PIN geschützt)
Schnittstelle (API = «Programmierschnittstelle»): /api/...
"""
from __future__ import annotations

import logging
import os
import secrets
import time
from pathlib import Path

from flask import Flask, jsonify, request, send_file, send_from_directory, session

from .ablauf import Fotobox, FotoboxFehler
from .bild import ausschnitt
from .store import STANDARD_EINSTELLUNGEN
from .themen import THEMEN, thema

STATIC = Path(__file__).parent / "static"
log = logging.getLogger("fotobox")

# Diese Einstellungen darf der Betreiber über die Betriebsseite ändern (mit Typ).
# Die PIN gehört nicht dazu – sie hat eine eigene Funktion, die die alte PIN verlangt.
AENDERBAR = {k: type(v) for k, v in STANDARD_EINSTELLUNGEN.items() if k != "betreiber_pin"}
ABMELDEN_NACH_S = 15 * 60  # automatische Abmeldung nach 15 Minuten ohne Aktivität


def erstelle_app(box: Fotobox) -> Flask:
    app = Flask(__name__, static_folder=str(STATIC), static_url_path="/static")
    app.secret_key = box.store.geheimschluessel()
    app.config["SESSION_COOKIE_SAMESITE"] = "Strict"

    @app.errorhandler(FotoboxFehler)
    def fotobox_fehler(e: FotoboxFehler):
        status = 409 if e.code in ("beschaeftigt", "sitzung_ungueltig", "keine_wiederholung", "aktion_ungueltig",
                                   "sitzung_laeuft") else 503
        if e.code in ("abzuege_ungueltig", "auftrag_unbekannt", "veranstaltung_unbekannt", "bestaetigung_fehlt"):
            status = 400
        # «text» ist nur für den Betreiberbereich gedacht; die Gästeansicht zeigt eigene Texte
        return jsonify({"fehler": e.code, "text": str(e) if str(e) != e.code else ""}), status

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
        t = thema(v["thema"])
        return jsonify({
            "thema": {"name": v["thema"], "farben": t["farben"], "schrift": t["schrift"], "name_gr": t["name_gr"], "deko": t["deko"]},
            "veranstaltung": {"anlass": v["anlass"], "namen": v["namen"], "datum_text": v["datum_text"]},
            "countdown_s": e["countdown_s"], "max_abzuege": e["max_abzuege_pro_sitzung"],
            "inaktiv_s": e["inaktiv_s"], "inaktiv_warnung_s": e["inaktiv_warnung_s"], "abschluss_s": e["abschluss_s"],
            "druck_verbleibend": box.kontingent()["verbleibend"],
            "seitenverhaeltnis": e["druck_breite_px"] / e["druck_hoehe_px"],
            # Welcher Teil des Kamerabilds landet auf der Postkarte? (Anteile 0..1, mittig)
            "ausschnitt": ausschnitt(e["druck_breite_px"], e["druck_hoehe_px"]),
        })

    @app.post("/api/sitzung")
    def sitzung_start():
        anfrage = (request.get_json(silent=True) or {}).get("anfrage_id")
        s = box.sitzung_starten(anfrage)
        return jsonify({"id": s["id"]})

    @app.post("/api/sitzung/<sid>/aufnahme")
    def aufnahme(sid):
        return jsonify(box.aufnehmen(sid))

    @app.post("/api/sitzung/<sid>/livebild")
    def livebild_start(sid):
        return jsonify({"livebild": box.livebild_starten(sid)})

    @app.post("/api/sitzung/<sid>/fokus")
    def fokus(sid):
        return jsonify({"vorfokus": box.vorfokussieren(sid)})

    @app.get("/api/sitzung/<sid>/livebild.jpg")
    def livebild_bild(sid):
        from flask import Response
        return Response(box.livebild_bild(sid), mimetype="image/jpeg")

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
        """Angemeldet bleibt man nur, solange man aktiv ist (Abmeldung nach ABMELDEN_NACH_S)."""
        if session.get("betreiber") is not True:
            return False
        if time.time() - session.get("zuletzt", 0) > ABMELDEN_NACH_S:
            session.clear()
            return False
        if request.headers.get("X-Hintergrund") != "1":  # automatisches Aktualisieren zählt nicht
            session["zuletzt"] = time.time()
        return True

    @app.get("/betrieb")
    def betrieb():
        return send_from_directory(STATIC / "betrieb", "index.html")

    @app.post("/api/betrieb/anmelden")
    def anmelden():
        pin = str((request.get_json(silent=True) or {}).get("pin", ""))
        if secrets.compare_digest(pin, str(box.e("betreiber_pin"))):
            session["betreiber"] = True
            session["zuletzt"] = time.time()
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
            "veranstaltungen": box.store.veranstaltungen(),
            "export_basis": str(export_basis()),
            "standard_pin": str(box.e("betreiber_pin")) == STANDARD_EINSTELLUNGEN["betreiber_pin"],
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
            typ = AENDERBAR[k]
            if typ is bool and not isinstance(wert, bool):
                return jsonify({"fehler": f"ungültig: {k}"}), 400
            try:
                wert = typ(wert)
            except (TypeError, ValueError):
                return jsonify({"fehler": f"ungültig: {k}"}), 400
            if k == "thema" and wert not in THEMEN:
                return jsonify({"fehler": f"ungültig: {k}"}), 400
            box.store.setze_einstellung(k, wert)
            log.info("Einstellung geändert: %s = %s", k, wert)
        return jsonify({"ok": True})

    @app.post("/api/betrieb/veranstaltung")
    def b_veranstaltung():
        """Ändert die aktive Veranstaltung (Texte und Thema)."""
        d = request.get_json(silent=True) or {}
        v = box.store.aktive_veranstaltung()
        t = d.get("thema")
        if t is not None and t not in THEMEN:
            return jsonify({"fehler": "thema_unbekannt"}), 400
        box.store.aendere_veranstaltung(v["id"], d.get("anlass", v["anlass"]), d.get("namen", v["namen"]),
                                        d.get("datum_text", v["datum_text"]), t)
        log.info("Betreiber: Veranstaltung %s geändert", v["id"])
        return jsonify({"ok": True})

    @app.post("/api/betrieb/veranstaltungen")
    def b_neue_veranstaltung():
        d = request.get_json(silent=True) or {}
        if not str(d.get("namen", "")).strip():
            return jsonify({"fehler": "namen_fehlt", "text": "Bitte Namen eingeben"}), 400
        t = d.get("thema") or box.e("thema")
        if t not in THEMEN:
            return jsonify({"fehler": "thema_unbekannt"}), 400
        v = box.veranstaltung_anlegen(str(d.get("anlass", "")).strip(), str(d["namen"]).strip(),
                                      str(d.get("datum_text", "")).strip(), t, bool(d.get("aktivieren")))
        return jsonify(v)

    @app.post("/api/betrieb/veranstaltung/<vid>/<aktion>")
    def b_veranstaltung_aktion(vid, aktion):
        d = request.get_json(silent=True) or {}
        if aktion == "aktivieren":
            box.veranstaltung_aktivieren(vid)
            return jsonify({"ok": True})
        if aktion == "exportieren":
            return jsonify(box.exportieren(vid, export_basis()))
        if aktion == "ordner_oeffnen":
            ordner = Path(str(d.get("ordner", "")))
            # Nur Ordner innerhalb des Exportbereichs öffnen – nie beliebige Pfade
            if not ordner.is_dir() or export_basis().resolve() not in ordner.resolve().parents:
                return jsonify({"fehler": "ordner_ungueltig"}), 400
            os.startfile(str(ordner))  # nur Windows; öffnet den Explorer auf diesem PC
            return jsonify({"ok": True})
        if aktion == "bilder_loeschen":
            if not secrets.compare_digest(str(d.get("pin", "")), str(box.e("betreiber_pin"))):
                time.sleep(1)
                return jsonify({"fehler": "pin", "text": "PIN falsch"}), 403
            box.bilder_in_papierkorb(vid, str(d.get("bestaetigung", "")))
            return jsonify({"ok": True})
        return jsonify({"fehler": "aktion_unbekannt"}), 400

    @app.post("/api/betrieb/pin")
    def b_pin():
        d = request.get_json(silent=True) or {}
        alt, neu = str(d.get("alt", "")), str(d.get("neu", ""))
        if not secrets.compare_digest(alt, str(box.e("betreiber_pin"))):
            time.sleep(1)
            return jsonify({"fehler": "pin", "text": "Bisherige PIN falsch"}), 403
        if not (neu.isdigit() and 4 <= len(neu) <= 8):
            return jsonify({"fehler": "pin_format", "text": "Neue PIN: 4 bis 8 Ziffern"}), 400
        box.store.setze_einstellung("betreiber_pin", neu)
        log.info("Betreiber-PIN geändert")
        return jsonify({"ok": True})

    return app


def export_basis() -> Path:
    """Exportziel: Ordner «Bilder\\Fotobox-Export» des Windows-Benutzers."""
    return Path.home() / "Pictures" / "Fotobox-Export"


def protokoll_ende(pfad: Path, zeilen: int) -> list[str]:
    try:
        with open(pfad, encoding="utf-8", errors="replace") as f:
            return f.readlines()[-zeilen:]
    except OSError:
        return []
