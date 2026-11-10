# Aufgaben

## Erledigt
- [x] Entwicklungsumgebung geprüft, Projektordner und Git eingerichtet (2026-11-09)
- [x] Kamera EOS 600D anhand der Dokumentation geprüft
- [x] Analyse, Architektur und Plan
- [x] M1: Designvorschlag mit vier Themen und Schreibschrift, von dir freigegeben
- [x] M2 (technisch): Gästeablauf mit Testbildern
  - Start, Countdown, Aufnahme, Vorschau, Anzahl, simulierter Druck, Abschluss
  - Fehleranzeigen, Inaktivität mit «Noch da?»
- [x] Einfacher Betriebsbereich: PIN, Kontingent, Zähler, Druckprobleme lösen, Simulation, Thema und Veranstaltung, Fehlerprotokoll
- [x] 21 automatische Tests, Browserprüfung durch Claude, Startdatei

## Offen
- [x] **M2 abgenommen (2026-11-09):** 13 Sitzungen, 2 simulierte Druckfehler per Nachdruck behoben, Kameraausfall abgefangen (laut Protokoll und Datenbank)
- [ ] Verständnisfragen zu M2
- [ ] Darstellung am BenQ prüfen (Vollbild F11, Lesbarkeit aus 1,5 m)
- [x] **M3 (technisch, 2026-11-09):** Echte Aufnahme der EOS 600D über digiCamControl, durch den normalen Fotobox-Ablauf (Postkarte und simulierter Druck)
- [x] Problem aus deinem Test: Foto erst ca. 6 s nach dem Countdown → schneller Modus mit offener digiCamControl-App (Foto nach 1,4 s)
- [x] Sicherung gegen Ausweichen auf die Laptop-Webcam
- [x] Kamera-Statusprüfung läuft im Hintergrund
- [x] **M3 abgenommen (2026-11-09):** schneller Modus in der Gästeansicht, Klick passt zum Countdown (dein Urteil), Originale 6,2 MB von der Canon (laut Protokoll)
- [ ] Verständnisfragen zu M3
- [x] **Livebild (2026-11-09):** Ausrichten-Bildschirm mit gespiegeltem Livebild und Postkarten-Rahmen, Countdown darüber. Das Livebild läuft nur während der Sitzung und stoppt nach dem Foto bzw. wenn 10 s lang niemand mehr Bilder abruft. Getestet mit Simulation und echter EOS 600D: Foto 1,7 s nach Auslösen.
- [x] Livebild von dir abgenommen (2026-11-09)
- [x] Vorab-Scharfstellen während des Countdowns («do LiveView_Focus», danach «capturenoaf»): Foto ab «0» in 1,8 s statt 3,9 s (2026-11-10). Bei Dunkelheit kann der Vorfokus misslingen → noch prüfen
- [x] **Online-Galerie, Teil 1 (2026-11-10):** Gast wird gefragt, ob er sein Foto aufs Handy möchte, und bekommt einen QR-Code mit unerratbarer Adresse. Upload-Warteschlange funktioniert ohne Internet und übersteht einen Neustart. Vorerst nur simulierter Speicher. 41 Tests, Browserprüfung durch Claude.
- [x] Anbieter gewählt: **Cloudflare R2** (2026-11-10)
- [x] R2-Baustein gebaut: Hochladen, Löschen, Verbindungstest. Signatur stimmt mit der offiziellen AWS-Bibliothek überein. Zugangsdaten auf der Betriebsseite, das Geheimnis wird nie angezeigt. 45 Tests.
- [ ] Cloudflare-Konto, R2 aktivieren, Bucket (EU) anlegen, öffentliche Adresse, Löschregel 30 Tage, API-Token (deine Schritte)
- [ ] Echten Verbindungstest und ersten echten Upload machen und mit dem Handy prüfen
- [ ] Für den Echtbetrieb: eigene Domain statt r2.dev (r2.dev ist laut Cloudflare nur für Entwicklung gedacht und in der Geschwindigkeit begrenzt)
- [ ] Online-Galerie: Datenschutz-Hinweis für Gäste und Kunden formulieren (Speicherort, Dauer, Löschung). Keine Rechtsberatung, im Zweifel Fachperson fragen
- [ ] Online-Galerie: Beim Löschen einer Veranstaltung auch die Online-Kopien löschen
- [ ] Internet am Veranstaltungsort: mobiler Router oder Handy-Hotspot testen
- [ ] Grünes Autofokus-Feld im Livebild: prüfen, ob es sich in digiCamControl ausblenden lässt
- [ ] Scharfstellen: einmal mit AF auf Gastabstand scharfstellen, dann MF (Ablauf dokumentieren) oder `/capture` mit Autofokus testen
- [ ] Kamera-Uhr stellen (steht auf März 2025)
- [x] M4 (technisch, 2026-11-09): Veranstaltungen mit eigenem Thema, Ordner und Kontingent anlegen und aktivieren. Export, Papierkorb-Löschen mit Bestätigung und PIN, PIN ändern, automatische Abmeldung nach 15 min. 30 Tests, Browserprüfung durch Claude.
- [x] **M4 abgenommen (2026-11-09):** PIN geändert, Veranstaltung angelegt und gewechselt, Export mit 30 Originalen und 25 Postkarten (laut Protokoll)
- [ ] Kiosk-Modus: Browser startet automatisch im Vollbild ohne Adressleiste
- [ ] Echte Tasten: USB-Tastencontroller wählen, der sich wie eine Tastatur meldet
- [ ] M6: Drucker- und Plattformentscheid
- [ ] Prüfen: USB-Stecker der 600D (Mini- oder Micro-USB?)
- [ ] Prüfen: Netzteil-Lösung für die Kamera (z. B. Canon ACK-E8)
