# Raspberry Pi einrichten

Ziel: Pi einschalten → Fotobox startet von selbst im Vollbild, Kamera, Drucker und Taster funktionieren.

> **Stand 2026-11-11:** Diese Anleitung und das Installationsprogramm sind **auf einem echten Raspberry Pi noch nicht getestet**.
> Geprüft wurden Teile davon in Ubuntu auf dem Laptop (siehe `KOMPATIBILITAET.md`). Beim ersten echten Durchlauf mit Claude zusammen machen.

## Was du brauchst
Siehe [EINKAUFSLISTE.md](EINKAUFSLISTE.md): Raspberry Pi 5 (4 GB) mit Netzteil, Kühler, SSD oder Speicherkarte, Micro-HDMI-Kabel, Tastatur und Maus (nur für die Einrichtung), Internet (WLAN oder Kabel), USB-Stick.

## Schritt 1 – Raspberry Pi OS aufspielen (am Windows-PC)
1. Programm **Raspberry Pi Imager** von raspberrypi.com installieren und starten.
2. **Gerät:** Raspberry Pi 5. **Betriebssystem:** «Raspberry Pi OS (64-bit)» (die Variante **mit Desktop**). **Speicher:** deine SSD bzw. Speicherkarte.
3. Bei «Einstellungen anpassen»:
   - Hostname: `fotobox`
   - Benutzername und Passwort festlegen (merken, **nicht** an Claude schicken)
   - WLAN eintragen (falls kein Kabel)
   - Zeitzone `Europe/Zurich`, Tastatur `ch`
   - Optional: SSH einschalten (damit Claude später über deinen PC helfen kann)
4. Schreiben, warten, fertig.

## Schritt 2 – Fotobox-Ordner auf einen USB-Stick kopieren (am Windows-PC)
Den ganzen Ordner `Dokumente\Projekte\Fotobox\System` auf den USB-Stick kopieren.
Die Ordner `System\.venv` und `System\daten` braucht es **nicht** (dürfen aber mit).

## Schritt 3 – Pi starten und Fotobox installieren
1. SSD/Karte in den Pi, Bildschirm, Tastatur, Maus, Kamera (eingeschaltet) anschliessen, Netzteil zuletzt.
2. Am Desktop den USB-Stick einstecken. Den Ordner `System` in deinen persönlichen Ordner kopieren und in **`fotobox`** umbenennen (ergibt `/home/<name>/fotobox`).
3. Terminal öffnen (schwarzes Symbol oben links) und eingeben:
   ```
   bash ~/fotobox/raspberry/installieren.sh
   ```
4. Passwort eingeben, wenn danach gefragt wird (man sieht beim Tippen nichts – normal).
5. Warten (ca. 5–15 Minuten). Am Ende steht **«Fertig.»**
6. Neu starten: `sudo reboot`

**Danach:** Der Pi meldet sich selbst an, die Fotobox startet und der Browser öffnet sich im Vollbild.

## Schritt 4 – Drucker
Drucker einstecken, einschalten, Papier und Farbband einlegen. Dann im Terminal:
```
bash ~/fotobox/raspberry/drucker_einrichten.sh
```
Zeigt das Programm «ACHTUNG: w288h432 nicht in der Liste», die angezeigte Liste an Claude schicken.
Danach in der Betriebsseite unter «Kamera, Drucker und Simulation» prüfen: Drucker = «Echter Drucker über CUPS», Name `DS620`.

## Schritt 5 – Taster anschliessen (Pi ausgeschaltet und Netzteil gezogen!)
Jeder Taster hat zwei Anschlüsse: einer an den GPIO-Stift, der andere an Minus (GND). Die drei Minus-Anschlüsse dürfen zusammen an einen GND-Stift.

| Taster | Stift (Pin-Nummer) | Name | Wirkt wie |
|---|---|---|---|
| links | **11** | GPIO17 | Pfeil links |
| Mitte | **13** | GPIO27 | Enter |
| rechts | **15** | GPIO22 | Pfeil rechts |
| alle drei (zweiter Anschluss) | **9** (oder 14) | GND | Minus |

Stift 1 ist der mit der eckigen Lötstelle, die Nummern laufen im Zickzack: ungerade Zahlen auf der Innenreihe, gerade auf der Aussenreihe (Bild: Suche nach «Raspberry Pi 5 pinout»).

⚠️ **Nie** an Stift 2 oder 4 (5 V) oder 1 oder 17 (3,3 V) anschliessen. Taster TRU LAS4GQH: die Variante **11E = tastend** verwenden.
Die LED der Taster (24 V) wird **nicht** an den Pi angeschlossen.

## Bedienung im Alltag
- **Einschalten:** Steckdose an → nach ca. 1 Minute läuft die Fotobox.
- **Betriebsseite:** Tastatur anschliessen und **Strg + Umschalt + B** drücken. Zurück zur Gästeansicht: **Strg + W** (schliesst den Betriebs-Tab).
- **Ausschalten:** am sichersten mit Tastatur: Strg+Alt+T (Terminal) → `sudo poweroff`, warten bis die grüne Lampe aus ist, dann Strom aus. Einfach den Strom ziehen geht meistens gut, eine SSD ist dabei robuster als eine Speicherkarte.
- **Fotos:** liegen in `/home/<name>/fotobox-daten/veranstaltungen/`. Export auf USB-Stick: siehe Betriebsseite «Exportieren».

## Wenn etwas nicht geht
| Problem | Was tun |
|---|---|
| Schwarzer Bildschirm, kein Browser | Tastatur: Strg+Alt+T öffnet ein Terminal → `systemctl status fotobox` |
| «Kamera nicht bereit» | Kamera an? Kabel? Dann `gphoto2 --auto-detect` im Terminal |
| Drucker nicht bereit | `lpstat -p DS620` im Terminal; Papier und Farbband prüfen |
| Taster reagieren nicht | Anschluss prüfen; im Terminal `grep fotobox-taster -A5 /boot/firmware/config.txt` |
| Fehlerprotokoll | `journalctl -u fotobox -n 100` oder Datei `~/fotobox-daten/protokoll/fotobox.log` |

## Was das Installationsprogramm genau verändert
- Pakete: gphoto2, python3-gphoto2, python3-venv, CUPS, Gutenprint, Chromium, curl
- Python-Umgebung `~/.fotobox-venv`, Daten `~/fotobox-daten`
- Dienst `/etc/systemd/system/fotobox.service`
- Zeile in `~/.config/labwc/autostart` (Kiosk-Browser)
- Automatische Desktop-Anmeldung, Bildschirmschoner aus (über raspi-config)
- GVFS-Kameradienst für deinen Benutzer abgeschaltet
- Block «fotobox-taster» in `/boot/firmware/config.txt`
- Benutzer in den Gruppen `lpadmin` und `plugdev`
