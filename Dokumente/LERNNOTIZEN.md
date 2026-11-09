# Lernnotizen

## Wichtige Erkenntnisse
- Kamerasteuerung besteht aus drei getrennten Fähigkeiten: **Auslösen**, **Bild übertragen**, **Livebild**. Eine Kamera kann das eine können und das andere nicht.
- Die Wahl Raspberry Pi oder Windows-PC hängt vor allem am **Drucker**, nicht an der Rechenleistung.
- Ein an Windows übergebener Druckauftrag beweist noch nicht, dass wirklich ein Foto aus dem Drucker kam.

- Regeln wie «nur ein Druckauftrag pro Sitzung» prüft **der Server**, nicht nur die Oberfläche. Die Oberfläche kann man umgehen, etwa durch Neuladen oder Doppelklick, den Server nicht.
- Der Browsertest hat einen echten Bedienfehler gefunden: Ein Doppeldruck auf «Drucken» hat den nächsten Bildschirm gleich mit bestätigt. Die Lösung ist eine kurze Eingabesperre nach jedem Wechsel. Automatische Tests auf dem Server hätten das nicht entdeckt.
- Ein Druckauftrag mit «Status unbekannt» wird nie automatisch wiederholt. Sonst entstehen ungewollte Doppeldrucke, die Material kosten.

## Verständnisfragen M2 (2026-11-09)
| Frage | Schon verstanden | Lücke / ergänzt |
|---|---|---|
| Doppeldruck verhindern | Die Oberfläche hat eine Eingabesperre | Die zweite Sicherung ist der **Server/die Datenbank**: pro Sitzung nur ein Druckauftrag. Die Oberfläche allein reicht nicht, weil man sie umgehen kann (zwei Tabs, Neuladen, Fehler im Browser). |
| «Status unbekannt» | Gast soll sich beim Team melden | **Warum kein automatischer Nachdruck:** Vielleicht wurde schon gedruckt, dann gäbe es einen Doppeldruck. Der Betreiber schaut am Drucker nach und klickt «Wurde gedruckt» oder «Wurde nicht gedruckt». |
| Echte Kamera | Fast alles bleibt gleich | Nur der **Kamera-Baustein** wird ergänzt. Das Livebild ist eine *zusätzliche, getrennte* Fähigkeit und für die erste echte Aufnahme nicht nötig. Wartezeit (Auslösen + Übertragen) wird gemessen. |

## Verständnisfragen M3 (2026-11-09)
Auf deinen Wunsch übersprungen, später kurz aufgreifen:
1. Warum war die Kamera zuerst langsam und jetzt schnell? (Verbindung jedes Mal neu ↔ App hält Verbindung offen)
2. Wozu prüfen wir «Canon» in den Bilddaten? (Schutz vor unbemerkten Laptop-Webcam-Fotos)
3. Was ändert sich auf dem Raspberry Pi? (nur der Kamera-Baustein: gphoto2 statt digiCamControl)

## Offene Verständnisfragen
- Server vs. Oberfläche: Wer entscheidet was? → beim Kamera-Meilenstein nochmals aufgreifen
