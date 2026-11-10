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
- Online-Galerie ist vom Benutzer gewünscht (2026-11-10); muss offline funktionieren (Warteschlange), Fotos nur über unerratbare Einzel-Links.
- Nicht bauen: Bezahlung, Gesichtserkennung, Fernwartung, Online-Buchung, KI-Effekte.

## Code (System/fotobox/)
- `store.py` SQLite (Einstellungen, Veranstaltungen, Sitzungen, Druckaufträge; `sitzung_id` UNIQUE = kein Doppeldruck)
- `kamera.py` Kamera-Schnittstelle + `SimulierteKamera`; `mit_zeitlimit` gegen hängende Kameras
- `drucker.py` Drucker-Schnittstelle + `SimulierterDrucker` (markierte Datei, Fehler/Unbekannt simulierbar)
- `bild.py` Postkarte (Pillow), Vorschau, Simulationsmarke
- `galerie.py` Online-Galerie-Schnittstelle + `SimulierteGalerie`; Upload-Warteschlange in `store.py` (Tabelle `uploads`), Arbeiter in `ablauf.py`
- `themen.py` Themen (einzige Quelle für Farben/Schriften)
- `ablauf.py` Sitzungsablauf und alle Regeln (Klasse `Fotobox`)
- `web.py` Flask-Routen (Gäste `/`, Betrieb `/betrieb`, API `/api/...`); `__main__.py` Start mit waitress auf 127.0.0.1
- `static/gast/`, `static/betrieb/` Oberflächen (reines HTML/CSS/JS), `static/fonts/` lokale OFL-Schriften

## Befehle (im Ordner System)
- Start: `.venv\Scripts\python.exe -m fotobox` (Optionen: `--port`, `--daten`, `--kein-browser`) oder `Fotobox starten.bat`
- Tests: `.venv\Scripts\python.exe -m unittest -v`
- Git liegt unter `C:\Program Files\Git\cmd\git.exe` (in älteren Shells evtl. nicht im PATH)
