# Fotobox – Projektregeln für Claude

## Ziel
Zuverlässige, selbst gebaute Fotobox zur Vermietung. Lokale Anwendung mit Browser-Oberfläche für Gäste (Vollbild, 3 physische Tasten) und einem PIN-geschützten Betreiberbereich. Funktioniert ohne Internet.

## Ordner
- `Dokumente/` – Analyse, Glossar, Lernnotizen, Aufgaben, Kompatibilität, Designvorschlag
- `System/` – Programmcode (Python-Server + Weboberfläche). Laufzeitdaten in `System/daten/` (nicht in Git)

## Architektur (Kurzfassung, Details in Dokumente/ANALYSE_UND_PLAN.md)
Getrennte Bausteine: Oberfläche · Sitzungsablauf · Kamera · Bildverarbeitung · Druck · Speicher/Einstellungen.
Kamera und Drucker haben jeweils eine simulierte und echte Umsetzungen mit derselben Schnittstelle. Betriebssystemspezifisches bleibt in diesen Bausteinen gekapselt.

## Regeln
- Der Benutzer ist Anfänger: Antworten auf Deutsch, einfach, Fachbegriffe erklären, neue Begriffe in `Dokumente/GLOSSAR.md` ergänzen.
- Nie behaupten, etwas getestet zu haben, was nicht geprüft wurde. Kompatibilität in `Dokumente/KOMPATIBILITAET.md` pflegen.
- Wenige, stabile Abhängigkeiten, isoliert in `System/.venv`. Keine systemweiten Änderungen ohne Zustimmung.
- Server lauscht nur auf 127.0.0.1.
- Originalfotos nie verändern. Druckaufträge nie automatisch wiederholen.
- Funktionierende Meilensteine mit verständlichen deutschen Commit-Nachrichten sichern.
- Nicht bauen: Bezahlung, Cloud, Gesichtserkennung, Fernwartung, Online-Buchung, KI-Effekte.

## Befehle
(werden ergänzt, sobald der Code existiert)
