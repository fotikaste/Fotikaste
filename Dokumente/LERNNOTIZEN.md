# Lernnotizen

## Wichtige Erkenntnisse
- Kamerasteuerung besteht aus drei getrennten Fähigkeiten: **Auslösen**, **Bild übertragen**, **Livebild**. Eine Kamera kann das eine können und das andere nicht.
- Die Wahl Raspberry Pi oder Windows-PC hängt vor allem am **Drucker**, nicht an der Rechenleistung.
- Ein an Windows übergebener Druckauftrag beweist noch nicht, dass wirklich ein Foto aus dem Drucker kam.

- Regeln wie «nur ein Druckauftrag pro Sitzung» prüft **der Server**, nicht nur die Oberfläche. Die Oberfläche kann man umgehen, etwa durch Neuladen oder Doppelklick, den Server nicht.
- Der Browsertest hat einen echten Bedienfehler gefunden: Ein Doppeldruck auf «Drucken» hat den nächsten Bildschirm gleich mit bestätigt. Die Lösung ist eine kurze Eingabesperre nach jedem Wechsel. Automatische Tests auf dem Server hätten das nicht entdeckt.
- Ein Druckauftrag mit «Status unbekannt» wird nie automatisch wiederholt. Sonst entstehen ungewollte Doppeldrucke, die Material kosten.

## Offene Verständnisfragen
- (werden nach Meilenstein M2 ergänzt)
