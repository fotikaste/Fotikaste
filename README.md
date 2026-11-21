# Fotobox

Eigene Fotobox-Software für die Vermietung: Gäste tippen auf «Foto machen», lächeln und erhalten eine Postkarte (10×15 cm).

**Stand:** Prototyp mit simulierter Kamera (Testbilder) und simuliertem Drucker (speichert Dateien). Echte Kamera und echter Drucker folgen.

## Starten
Doppelklick auf **`Fotobox starten.bat`** (in diesem Ordner).
- Beim allerersten Start wird die Python-Umgebung eingerichtet. Das braucht einmalig Internet.
- Danach öffnet sich der Browser mit der Gästeansicht: `http://127.0.0.1:8080/`
- Vollbild im Browser: **F11**

## Bedienen (Gäste)
Bedienung per **Touchscreen** (seit 17.11.2026, keine physischen Tasten). Gäste tippen auf die Knöpfe am Bildschirm:
der grosse, farbige Knopf ist immer die Hauptaktion (z. B. «Foto machen», «Countdown starten», «Drucken»).
Auf der Startseite startet auch ein Tipp irgendwo auf den Bildschirm.

Zum Testen am PC: mit der Maus klicken, oder Tastatur: Enter/Leertaste = Hauptknopf, Pfeil links/rechts = Knopf links/rechts.

**Internet einrichten / Betriebsseite ohne Tastatur:** auf der Startseite die Namen oben **3 Sekunden gedrückt halten**. Es öffnet sich «Internet einrichten» (Kunden-Code oder PIN, dann WLAN wählen und Passwort auf der Bildschirmtastatur). Oben rechts führt «Betrieb (Vermieter)» zur Betriebsseite (PIN). Mit Tastatur: Strg+Umschalt+B.

**Kunden-Code:** Betriebsseite → «Fotos fürs Handy» → «Kunden-Code». Er erlaubt nur die WLAN-Einrichtung – nicht Löschen, Nachdrucken oder Einstellungen. Code auf eine Karte zur Fotobox legen.

## Betriebsbereich
`http://127.0.0.1:8080/betrieb` – **Standard-PIN: 1234**. Ändere sie unter «Sicherheit», bevor du die Fotobox vermietest. Solange sie aktiv ist, zeigt die Seite oben eine rote Warnung.
Nach 15 Minuten ohne Aktivität wirst du automatisch abgemeldet.

| Bereich | Was du dort tust |
|---|---|
| Druckaufträge mit Handlungsbedarf | Fehlgeschlagene Aufträge nachdrucken oder verwerfen, unklare als «gedruckt» oder «nicht gedruckt» markieren |
| Druckkontingent | Verbleibende Abzüge der aktiven Veranstaltung, getrennt nach echt und simuliert |
| Papierrolle | Wie viele Bilder noch auf der Rolle sind (eigener Zähler: jeder echte Abzug wird abgezogen; dazu Füllstand laut Drucker). «Neue Rolle eingelegt» beim Wechsel, «Stand korrigieren» bei Abweichung. Rote Warnung, wenn knapp |
| Aktive Veranstaltung | Anlass, Namen, Datum und Thema der laufenden Veranstaltung ändern. **Rahmen der Postkarte** wählen: 5 schlichte (Farben vom Thema) und 6 Motiv-Rahmen mit eigener Dekoration (Hochzeit, Party, Geburtstag, Sommer, Winter, Silvester) und bei Bedarf **eigenen Text auf der Karte** eintragen. Leer = Namen und Datum der Veranstaltung. Die Vorschau zeigt die Karte sofort |
| Alle Veranstaltungen | Neue Veranstaltung anlegen, aktivieren, Bilder exportieren, Bilder löschen |
| Ablauf | Countdown, **Auslösen vorziehen** (Klick der Kamera genau bei «0»: kommt er später, Wert erhöhen), Wiederholungen, Abzüge pro Sitzung, Inaktivität, Kontingent |
| Kamera und Simulation | Echte Kamera oder Testbilder, Fehler simulieren |
| Sicherheit | PIN ändern |

**Bilder exportieren:** «Exportieren» kopiert Originale und Postkarten nach `Bilder\Fotobox-Export\<Veranstaltung>` oder, wenn einer eingesteckt ist, auf einen **USB-Stick** (Auswahl «Exportieren nach»). Die Fotobox behält ihre eigenen Dateien.
**Bilder löschen:** geht nur bei einer nicht aktiven Veranstaltung und nur mit dem Wort LÖSCHEN und der PIN. Die Bilder landen in `System\daten\papierkorb\` und sind von dort wiederherstellbar. Endgültig löschen musst du sie selbst im Explorer.

## Echte Kamera (Canon EOS 600D) verwenden
1. Einmalig: **digiCamControl** installiert (ist auf diesem PC erledigt).
2. Kamera: Akku voll, automatische Abschaltung **Aus**, Modus **P** oder **M**, Objektiv auf **MF** und vorher auf den Gastabstand scharfstellen.
3. USB-Kabel direkt am Laptop einstecken und die Kamera einschalten. Das Display wird dunkel, das ist normal.
4. Betriebsseite → «Kamera und Simulation» → **«Echte Canon – schnell (digiCamControl-App)»** → Übernehmen.
   Die Fotobox startet die digiCamControl-App automatisch minimiert in der Taskleiste. **Nicht schliessen**, sie hält die Verbindung zur Kamera offen.
   Nach dem Start etwa 20 s warten, bis die Betriebsseite «Kamera bereit» zeigt.

**Livebild:** In digiCamControl unter File → Settings → Webserver «Use web server» und «Allow interaction via webserver» einschalten (Port 5513) und die App neu starten. Danach sehen Gäste sich gespiegelt mit dem Postkarten-Rahmen und starten den Countdown mit dem Knopf «Countdown starten». Abschalten: Betriebsseite → «Livebild beim Ausrichten: aus». Fehlt das Livebild, läuft der Countdown wie früher ohne Bild.

Foto ist ca. 1,4 s nach dem Auslösen auf dem PC. Der Modus «langsam» braucht 8–15 s, weil er die Verbindung jedes Mal neu aufbaut, und funktioniert nur, wenn die App **geschlossen** ist.

## Raspberry Pi
Einrichtung Schritt für Schritt: [Dokumente/RASPBERRY_PI_EINRICHTEN.md](Dokumente/RASPBERRY_PI_EINRICHTEN.md) – ein Befehl: `bash ~/fotobox/raspberry/installieren.sh`.
Drucker dort: Betriebsseite → «Verwendeter Drucker» → «Echter Drucker über CUPS».

## Kamera unter Linux / Raspberry Pi (gphoto2)
Unter Linux steuert die Fotobox die Canon direkt über **gphoto2**, digiCamControl wird dort nicht gebraucht. Betriebsseite → «Kamera und Simulation» → **«Echte Canon – gphoto2»**. Unter Windows meldet diese Option nur «nicht installiert».
- Einmalig in Linux: `sudo apt-get install gphoto2 python3-gphoto2 python3-venv`, dann eine Python-Umgebung mit `--system-site-packages` anlegen und `requirements.txt` installieren.
- Test am Windows-PC über WSL: Kamera mit `usbipd attach --wsl --busid <Nummer>` an Linux geben (Nummer aus `usbipd list`). Zurückgeben mit `usbipd detach --busid <Nummer>`. Solange die Kamera bei Linux ist, sieht Windows sie nicht.

## Fotos fürs Handy (QR-Code)
Nach dem Foto fragt die Fotobox: «Möchtest du dein Foto auch aufs Handy?». Bei «Ja» erscheint ein QR-Code mit einer langen Zufallsadresse. Nur wer den Code hat, findet das Foto.
- **Ohne Internet** gibt es den QR-Code trotzdem. Die Fotobox lädt das Foto hoch, sobald wieder Internet da ist, und versucht es automatisch erneut.
- **Echter Speicher:** Cloudflare R2. Zugangsdaten unter Betriebsseite → «Zugang Cloudflare R2» eintragen, dann «Verbindung testen» und bei «Online-Speicher» auf «Cloudflare R2» umstellen.
- **Simulation:** Die Fotos landen in `System\daten\galerie_simulation\`. Der QR-Code zeigt auf diesen PC und funktioniert auf einem Handy **nicht**. Ein echter Online-Speicher folgt nach dem Anbieter-Entscheid.
- Einstellungen: Betriebsseite → «Fotos fürs Handy» (fragen / immer / aus, Tage online, Simulation ohne Internet).

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
Erwartet: `Ran 85 tests … OK`

## Häufige Fehler
| Problem | Lösung |
|---|---|
| Fenster schliesst sofort / «py nicht gefunden» | Python 3 installieren (python.org) |
| «Adresse wird bereits verwendet» | Die Fotobox läuft schon: altes Fotobox-Fenster schliessen |
| Gäste sehen «Kurze Pause» | Betriebsbereich öffnen, Gerätestatus und Fehlerprotokoll ansehen |
| Druckauftrag «Status unbekannt» | Am Drucker nachsehen, dann im Betriebsbereich «Wurde gedruckt» oder «Wurde nicht gedruckt» wählen |

Mehr: [Analyse und Plan](Dokumente/ANALYSE_UND_PLAN.md) · [Aufgaben](Dokumente/AUFGABEN.md) · [Glossar](Dokumente/GLOSSAR.md) · [Kompatibilität](Dokumente/KOMPATIBILITAET.md)
