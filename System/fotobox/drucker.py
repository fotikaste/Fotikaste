"""Druck-Baustein.

Jeder Drucker (simuliert oder echt) bietet:
  status()                      -> Ist der Drucker bereit?
  einreichen(auftrag_id, datei, abzuege) -> Auftrag übergeben (danach: «in Warteschlange»)
  ergebnis(auftrag_id)          -> 'warteschlange' | 'erfolgreich' | 'fehlgeschlagen' | 'unbekannt'

Wichtig: «einreichen» heisst nur «übergeben». Ob wirklich ein Foto herauskam,
sagt erst ergebnis() – und bei echten Druckern oft nur ungenau.
"""
from __future__ import annotations

import shutil
import threading
import time
from pathlib import Path

from .bild import als_simulation_markieren


class DruckFehler(Exception):
    pass


class Drucker:
    name = "unbekannt"
    simuliert = False

    def status(self) -> dict:
        raise NotImplementedError

    def einreichen(self, auftrag_id: str, datei: Path, abzuege: int) -> None:
        raise NotImplementedError

    def ergebnis(self, auftrag_id: str) -> str:
        raise NotImplementedError


class SimulierterDrucker(Drucker):
    """Speichert statt zu drucken eine deutlich markierte Datei.

    verhalten() -> ok | naechster_fehlgeschlagen | naechster_unbekannt
    «naechster_…» gilt nur für einen Auftrag und springt danach automatisch auf «ok» zurück.
    """
    name = "Simulierter Drucker (speichert Dateien)"
    simuliert = True

    def __init__(self, ausgabe: Path, verhalten, verhalten_zuruecksetzen, dauer):
        self.ausgabe = ausgabe
        self._verhalten = verhalten
        self._zuruecksetzen = verhalten_zuruecksetzen
        self._dauer = dauer
        self._auftraege: dict[str, tuple[float, str]] = {}
        self._lock = threading.Lock()

    def status(self):
        return {"bereit": True, "text": f"Simulation aktiv – Dateien in {self.ausgabe.name}/"}

    def einreichen(self, auftrag_id, datei, abzuege):
        v = self._verhalten()
        ausgang = {"naechster_fehlgeschlagen": "fehlgeschlagen",
                   "naechster_unbekannt": "unbekannt"}.get(v, "erfolgreich")
        if v != "ok":
            self._zuruecksetzen()
        self.ausgabe.mkdir(parents=True, exist_ok=True)
        if ausgang == "erfolgreich":
            ziel = self.ausgabe / f"{auftrag_id}_x{abzuege}_SIMULATION.jpg"
            als_simulation_markieren(datei, ziel)
        with self._lock:
            self._auftraege[auftrag_id] = (time.monotonic() + self._dauer(), ausgang)

    def ergebnis(self, auftrag_id):
        with self._lock:
            eintrag = self._auftraege.get(auftrag_id)
        if eintrag is None:
            return "unbekannt"  # z. B. nach einem Neustart: der Simulator weiss nichts mehr davon
        fertig_um, ausgang = eintrag
        return ausgang if time.monotonic() >= fertig_um else "warteschlange"


def freier_speicher_mb(pfad: Path) -> float:
    return shutil.disk_usage(pfad).free / 1_000_000
