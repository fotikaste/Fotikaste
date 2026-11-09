"""Startpunkt: python -m fotobox

Startet den Server nur auf diesem Computer (127.0.0.1) und öffnet den Browser.
Beenden: Fenster schliessen oder Strg+C drücken.
"""
from __future__ import annotations

import argparse
import logging
import logging.handlers
import threading
import webbrowser
from pathlib import Path

from waitress import serve

from .ablauf import Fotobox
from .web import erstelle_app

STANDARD_DATEN = Path(__file__).resolve().parent.parent / "daten"


def protokoll_einrichten(daten: Path):
    ordner = daten / "protokoll"
    ordner.mkdir(parents=True, exist_ok=True)
    datei = logging.handlers.RotatingFileHandler(ordner / "fotobox.log", maxBytes=2_000_000,
                                                 backupCount=5, encoding="utf-8")
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(message)s", "%Y-%m-%d %H:%M:%S")
    datei.setFormatter(fmt)
    konsole = logging.StreamHandler()
    konsole.setFormatter(fmt)
    log = logging.getLogger("fotobox")
    log.setLevel(logging.INFO)
    log.addHandler(datei)
    log.addHandler(konsole)


def main():
    p = argparse.ArgumentParser(description="Fotobox starten")
    p.add_argument("--port", type=int, default=8080)
    p.add_argument("--daten", type=Path, default=STANDARD_DATEN)
    p.add_argument("--kein-browser", action="store_true")
    a = p.parse_args()

    protokoll_einrichten(a.daten)
    box = Fotobox(a.daten)
    app = erstelle_app(box)
    url = f"http://127.0.0.1:{a.port}/"
    logging.getLogger("fotobox").info("Fotobox läuft: %s  (Betrieb: %sbetrieb)  – Beenden mit Strg+C", url, url)
    if not a.kein_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    serve(app, host="127.0.0.1", port=a.port, threads=6)


if __name__ == "__main__":
    main()
