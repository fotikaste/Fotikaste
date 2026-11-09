# Fotobox

Eigene Fotobox-Software für die Vermietung: Gäste drücken eine Taste, lächeln und erhalten eine Postkarte (10×15 cm).

**Stand:** Prototyp mit simulierter Kamera (Testbilder) und simuliertem Drucker (speichert Dateien). Echte Kamera und echter Drucker folgen.

## Starten
Doppelklick auf **`Fotobox starten.bat`** (in diesem Ordner).
- Beim allerersten Start wird die Python-Umgebung eingerichtet. Das braucht einmalig Internet.
- Danach öffnet sich der Browser mit der Gästeansicht: `http://127.0.0.1:8080/`
- Vollbild im Browser: **F11**

## Bedienen (Gäste)
Drei Tasten: **links · Mitte · rechts**. Zum Testen am PC:

| Echte Taste (später) | Tastatur | Maus |
|---|---|---|
| links | Pfeil links oder `1` | auf den linken Kreis klicken |
| Mitte (Hauptaktion) | Leertaste, Enter oder `2` | auf den mittleren Kreis klicken |
| rechts | Pfeil rechts oder `3` | auf den rechten Kreis klicken |

## Betriebsbereich
`http://127.0.0.1:8080/betrieb` – **Standard-PIN: 1234** (vor dem ersten Einsatz ändern, siehe Aufgaben).
Hier siehst du:
- Druckkontingent und Zähler
- Gerätestatus
- fehlgeschlagene oder unklare Druckaufträge
- das Fehlerprotokoll

Ausserdem stellst du hier Veranstaltung, Thema, Ablauf und Simulation ein.

## Beenden
Das schwarze Fenster «Fotobox» schliessen oder darin **Strg+C** drücken. Danach den Browser schliessen.
Prüfen, ob wirklich beendet: `http://127.0.0.1:8080/` lädt nicht mehr.

## Wo liegen die Daten?
`System\daten\` (wird beim ersten Start angelegt):
- `veranstaltungen\<Kennung>\originale\` – unveränderte Kamerafotos
- `veranstaltungen\<Kennung>\karten\` – fertige Postkarten (1800×1200, 300 dpi)
- `druck_simulation\` – «gedruckte» Dateien, rot als SIMULATION markiert
- `protokoll\fotobox.log` – Fehlerprotokoll
- `fotobox.db` – Einstellungen, Zähler, Druckaufträge

## Automatische Tests
Im Ordner `System` in PowerShell:
```
.venv\Scripts\python.exe -m unittest -v
```
Erwartet: `Ran 21 tests … OK`

## Häufige Fehler
| Problem | Lösung |
|---|---|
| Fenster schliesst sofort / «py nicht gefunden» | Python 3 installieren (python.org) |
| «Adresse wird bereits verwendet» | Die Fotobox läuft schon: altes Fotobox-Fenster schliessen |
| Gäste sehen «Kurze Pause» | Betriebsbereich öffnen, Gerätestatus und Fehlerprotokoll ansehen |
| Druckauftrag «Status unbekannt» | Am Drucker nachsehen, dann im Betriebsbereich «Wurde gedruckt» oder «Wurde nicht gedruckt» wählen |

Mehr: [Analyse und Plan](Dokumente/ANALYSE_UND_PLAN.md) · [Aufgaben](Dokumente/AUFGABEN.md) · [Glossar](Dokumente/GLOSSAR.md) · [Kompatibilität](Dokumente/KOMPATIBILITAET.md)
