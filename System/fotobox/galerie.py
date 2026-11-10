"""Online-Galerie: Fotos für die Handys der Gäste.

Ablauf (funktioniert auch ohne Internet):
  1. Gast wünscht sein Foto aufs Handy -> die Fotobox legt einen Upload-Auftrag an
     und kennt sofort die spätere Internet-Adresse (URL). Daraus wird der QR-Code.
  2. Ein Hintergrund-Arbeiter lädt wartende Fotos hoch, sobald Internet da ist,
     und versucht es bei Fehlern später erneut.
  3. Die URL enthält eine lange Zufallskennung. Nur wer den QR-Code hat, findet das Foto.

Jede Galerie (simuliert oder echt) bietet dieselben Funktionen:
  status()                  -> Ist die Galerie erreichbar?
  url(schluessel)           -> Spätere Internet-Adresse des Fotos
  hochladen(datei, schluessel)
"""
from __future__ import annotations

import shutil
from pathlib import Path


class GalerieFehler(Exception):
    pass


class Galerie:
    name = "unbekannt"
    simuliert = False

    def status(self) -> dict:
        raise NotImplementedError

    def url(self, schluessel: str) -> str:
        raise NotImplementedError

    def hochladen(self, datei: Path, schluessel: str) -> None:
        raise NotImplementedError


class SimulierteGalerie(Galerie):
    """Kopiert statt hochzuladen in den Ordner daten/galerie_simulation.
    Die Adresse zeigt auf diesen PC – ein Handy kann sie NICHT öffnen (nur zum Testen)."""
    name = "Simulierte Online-Galerie (Ordner auf diesem PC)"
    simuliert = True

    def __init__(self, ordner: Path, basis_url: str, verhalten):
        self.ordner = ordner
        self.basis_url = basis_url.rstrip("/")
        self._verhalten = verhalten

    def status(self):
        if self._verhalten() == "offline":
            return {"bereit": False, "text": "Simulation: kein Internet"}
        return {"bereit": True, "text": "Simulation aktiv"}

    def url(self, schluessel):
        return f"{self.basis_url}/{schluessel}"

    def hochladen(self, datei, schluessel):
        if self._verhalten() == "offline":
            raise GalerieFehler("Simulation: kein Internet")
        ziel = self.ordner / schluessel
        ziel.parent.mkdir(parents=True, exist_ok=True)
        tmp = ziel.with_suffix(".tmp")
        shutil.copyfile(datei, tmp)
        tmp.replace(ziel)
