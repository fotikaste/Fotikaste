# Raspberry Pi einrichten

Ziel: Pi einschalten → Fotobox startet von selbst im Vollbild, Kamera, Drucker und Taster funktionieren.

> **Stand 2026-11-16:** Diese Anleitung und das Installationsprogramm sind **auf einem echten Raspberry Pi noch nicht getestet**.
> Geprüft in Ubuntu auf dem Laptop: Kamera über gphoto2, Drucker-Einrichtung mit dem **echten DS620** (inkl. Testdrucke), Teile des Installationsprogramms (siehe `KOMPATIBILITAET.md`).
> Beim ersten echten Durchlauf mit Claude zusammen machen.

## Checkliste: Das muss bereitliegen
| | Gegenstand | Hast du? |
|---|---|---|
| ☐ | Raspberry Pi 5 (4 GB) + offizielles Netzteil 27 W + Active Cooler (aufgesteckt) | noch kaufen |
| ☐ | SSD-Kit 256 GB (oder Speicherkarte 64 GB A2) + passendes Gehäuse | noch kaufen |
| ☐ | Adapter **Micro-HDMI → HDMI** (siehe Einkaufsliste Nr. 9) | noch kaufen |
| ☐ | Monitor Verbatim 14" mit seinem **Mini-HDMI-→-HDMI-Kabel**, seinem **USB-C-Kabel für Touch** und seinem **Netzteil** | ✅ vorhanden |
| ☐ | Canon EOS 600D, Akku voll, USB-Kabel | ✅ vorhanden |
| ☐ | DNP DS620 mit Papier, USB-Kabel (USB-A → USB-B) | ✅ vorhanden |
| ☐ | USB-Tastatur und Maus (nur für die Einrichtung) | |
| ☐ | Internet: WLAN-Name und -Passwort oder Netzwerkkabel | |
| ☐ | USB-Stick «USB128» mit dem Ordner `Fotobox\Fuer-Raspberry-Piotobox` | ✅ vorbereitet |
| ☐ | Laptop mit Claude (für Fragen während der Einrichtung) | ✅ |

Preise und Links: [EINKAUFSLISTE.md](EINKAUFSLISTE.md).

## Schritt 1 – Raspberry Pi OS aufspielen (am Windows-PC) – ✅ erledigt am 16.11.2026 auf SD-Karte 64 GB (Benutzer `fotobox`)
1. Programm **Raspberry Pi Imager** von raspberrypi.com installieren und starten.
2. **Gerät:** Raspberry Pi 5. **Betriebssystem:** «Raspberry Pi OS (64-bit)» (die Variante **mit Desktop**). **Speicher:** deine SSD bzw. Speicherkarte.
3. Bei «Einstellungen anpassen»:
   - Hostname: `fotobox`
   - Benutzername und Passwort festlegen (merken, **nicht** an Claude schicken)
   - WLAN eintragen (falls kein Kabel)
   - Zeitzone `Europe/Zurich`, Tastatur `ch`
   - Optional: SSH einschalten (damit Claude später über deinen PC helfen kann)
4. Schreiben, warten, fertig.

## Schritt 2 – USB-Stick (schon erledigt)
Claude hat den Ordner `Fotobox\Fuer-Raspberry-Piotobox` auf dem USB-Stick vorbereitet: das ganze Programm,
mit Linux-Zeilenenden, ohne die Windows-Python-Umgebung und ohne deine Fotos. Nach Programm-Änderungen aktualisiert Claude ihn.

## Schritt 2b – Monitor anschliessen (Verbatim 14")
| Was | Von | Nach |
|---|---|---|
| Bild | Pi: **Micro-HDMI-Buchse «HDMI0»** (die neben dem USB-C-Strom) → Adapter Micro-HDMI → HDMI | Monitor: mitgeliefertes Kabel HDMI → **Mini-HDMI** |
| Touch | Monitor: USB-C-Buchse (Daten) → mitgeliefertes Kabel | Pi: eine der **blauen** USB-Buchsen |
| Strom Monitor | eigenes Netzteil des Monitors | Monitor: zweite USB-C-Buchse |

Der Pi kann den Monitor über USB nicht zuverlässig mit Strom versorgen. Darum bekommt der Monitor sein eigenes Netzteil.

## Schritt 3 – Pi starten und Fotobox installieren
1. SSD/Karte in den Pi, Bildschirm, Tastatur, Maus, Kamera (eingeschaltet) anschliessen, Netzteil zuletzt.
2. Am Desktop den USB-Stick einstecken. Im Dateimanager den Ordner `Fotobox/Fuer-Raspberry-Pi/fotobox` in deinen persönlichen Ordner kopieren (ergibt `/home/<name>/fotobox`).
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
Erwartet (so am Laptop mit dem echten DS620 gesehen): «Anschluss: gutenprint53+usb://dnp-ds620/…», «Streifenformate entfernt», «Papiergrösse: w288h432».
Die Zeile «Streifenformate entfernt» ist wichtig: Ohne sie druckt Linux die Karte verzerrt (Fehler gefunden am 16.11.2026).
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
- **Fotos auf USB-Stick:** Stick einstecken, ca. 5 s warten, Betriebsseite → «Alle Veranstaltungen» → «Exportieren nach: USB-Stick …» (wird automatisch vorgewählt) → «Exportieren». Erst abziehen, wenn «darf jetzt abgezogen werden» erscheint.
- **Fotos auf dem Pi:** liegen in `/home/<name>/fotobox-daten/veranstaltungen/` (Originale nie verändert).

## Fotobox später aktualisieren
1. Claude aktualisiert den Ordner auf dem USB-Stick.
2. Am Pi: Tastatur anschliessen, Strg+Alt+T, dann den neuen Ordner über den alten kopieren:
   `cp -r /media/$USER/USB128/Fotobox/Fuer-Raspberry-Pi/fotobox/. ~/fotobox/`
3. `bash ~/fotobox/raspberry/installieren.sh` (behält Fotos, Einstellungen und Zähler), danach `sudo reboot`.

## Wenn etwas nicht geht
| Problem | Was tun |
|---|---|
| Schwarzer Bildschirm, kein Browser | Tastatur: Strg+Alt+T öffnet ein Terminal → `systemctl status fotobox` |
| «Kamera nicht bereit» | Kamera an? Kabel? Dann `gphoto2 --auto-detect` im Terminal |
| Drucker nicht bereit | `lpstat -p DS620` im Terminal; Papier und Farbband prüfen |
| Taster reagieren nicht | Anschluss prüfen; im Terminal `grep fotobox-taster -A5 /boot/firmware/config.txt` |
| Bild hat schwarze Ränder links/rechts | Pi-Menü → Einstellungen → Screen Configuration: Auflösung **1920×1080** wählen |
| Touch reagiert nicht | USB-C-Kabel des Monitors am Pi eingesteckt? Es muss die **Daten**-Buchse am Monitor sein |
| Kein USB-Stick bei «Exportieren nach» | Stick ab- und wieder einstecken, 5 s warten, Seite neu laden. Format FAT32 oder exFAT |
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
