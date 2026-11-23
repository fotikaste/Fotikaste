# Kompatibilität

Legende: ✅ **getestet** (selbst ausprobiert) · 📄 **nur Doku** (laut offizieller Quelle) · ❔ **ungeprüft**

| Komponente | Windows 11 (Entwicklungs-PC) | Raspberry Pi |
|---|---|---|
| Anwendung mit simulierter Kamera und simuliertem Drucker | ✅ 21 automatische Tests und Browserprüfung durch Claude (2026-11-09) | ❔ |
| Gästeoberfläche bei 1920×1080 | ✅ im eingebauten Browser von Claude (nachgebildete Grösse) | ❔ |
| BenQ GL2450H, echte Darstellung | ❔ von dir zu bestätigen (Abnahmetest lief, Monitor nicht ausdrücklich bewertet) | ❔ |
| Startdatei `Fotobox starten.bat` | ✅ von dir gestartet (2026-11-09) | – |
| Abnahme M2 durch dich (Sitzungen, Druckfehler, Nachdruck) | ✅ 2026-11-09 | ❔ |
| **Canon EOS 600D – Auslösen und Übertragen** | ✅ **digiCamControl 2.1.6.0, `/capturenoaf`, USB direkt am Laptop (2026-11-09).** 5184×3456 JPEG, ca. 5,9 MB. Dauer 15,1 s / 8,4 s (nur Kamera), 9,0 s (Kamera + Postkarte im Fotobox-Ablauf) | 📄 gphoto2-Liste |
| **Canon EOS 600D – schneller Modus** (digiCamControl-App offen + `CameraControlRemoteCmd /c capture`) | ✅ 2026-11-09: Foto nach 1,4 s auf dem PC (3 Messungen), Aufnahme + Postkarte 2,0–2,1 s. Auslöseverzögerung konstant (Schwankung < 0,05 s, über die Kamerauhr gemessen). Absolute Verzögerung bis zum Klick: nicht gemessen | 📄 gphoto2 (eigene Lösung nötig) |
| Ausweichen auf Laptop-Webcam bei fehlender Canon | ✅ beobachtet (Protokoll 19:26) → Sicherung eingebaut: nur Fotos mit Hersteller «Canon» werden angenommen | – |
| Canon EOS 600D – Kabel ziehen und erneut versuchen | ✅ von dir getestet (langsamer Modus): Fehler angezeigt, Wiederholung klappte | ❔ |
| Canon EOS 600D – Auslösen mit Autofokus (`/capture`) | ❔ | ❔ |
| Canon EOS 600D – Livebild | ✅ 2026-11-09 über den Webserver von digiCamControl (`/liveview.jpg`): ca. 9 neue Bilder/s, 1056×704 (3:2), Abruf ca. 7 ms. Ein grüner Fokusrahmen ist im Bild sichtbar. Verzögerung gegenüber der Wirklichkeit: nicht gemessen | 📄 gphoto2-Liste |
| Auslösen während Livebild | ✅ Foto (5184×3456, Canon) nach 1,7 s da, Livebild läuft danach weiter | ❔ |
| Livebild in der Gästeansicht (gespiegelt, mit Rahmen) | ✅ von Claude im Browser mit echter EOS 600D (2026-11-09). Foto im Ablauf: Kamera 1,7 s | ❔ |
| Webserver digiCamControl nur lokal | ⚠️ lauscht auf allen Netzwerkadressen (0.0.0.0:5513). Die Firewall blockiert eingehend (Profil «Öffentlich», keine Erlaubnis-Regel). Von einem anderen Gerät aus nicht getestet. | – |
| Online-Galerie Cloudflare R2 | ✅ 2026-11-17 mit echtem Konto: Bucket «fotikiste» (EU), Hochladen, öffentlicher Abruf über r2.dev und Löschen ok. Erkenntnis: Cloudflare sperrt Abrufe ohne Browser-Kennung (403) – Handys/Browser nicht betroffen, Verbindungstest angepasst. ✅ QR-Code mit deinem Handy gescannt, Foto geöffnet und heruntergeladen (2026-11-17, Testbild der simulierten Kamera). Fehler dabei behoben: QR-Code wurde bei langen Links abgeschnitten | ✅ 2026-11-17 am Pi: eigener Token, Verbindungstest ok, Foto per QR mit Handy geöffnet |
| **Canon EOS 600D unter Linux (gphoto2)** | – | ✅ **Vorstufe (2026-11-10): Ubuntu 26.04 in WSL 2 auf dem Laptop, Kamera über usbipd-win 5.3.0 weitergereicht, gphoto2 2.5.32, python-gphoto2 2.6.3.** Fotobox-Baustein im echten Ablauf: Foto nach 1,4–1,5 s. Kein echter Raspberry Pi, siehe unten |
| Fotodrucker **DNP DS620** (gewählt 2026-11-10) | 📄 offizieller DNP-Treiber. ❔ nicht getestet | 📄 Gutenprint 5.3.x mit CUPS-Backend «dnpds40» (laut Gutenprint-Unterlagen und Forum). Bekannte Punkte: DS620**A** ohne «Rewind», eine Firmware-Panne beim Rewind (2026), das Bild muss genau 4×6″ gross geliefert werden, sonst skaliert CUPS. ❔ nicht getestet |
| Druckbaustein CUPS (`drucker_cups.py`, eigene IPP-Anbindung) | – | ✅ 2026-11-11: 11 automatische Tests (nachgebildetes CUPS). ✅ In Ubuntu/WSL gegen **ippeveprinter** (offizieller IPP-Testdrucker von CUPS 2.4.16): Auftrag mit 2 Kopien übergeben, Datei kam an, «erfolgreich» nach 11 s. Papiergrösse «w288h432» kennt der Testdrucker nicht (erwartet). ❔ echtes CUPS + DS620 |
| Papiergrösse DS620 «w288h432» (10×15 cm) | – | ✅ 2026-11-16 in Ubuntu/WSL mit echtem DS620 (über usbipd): Gutenprint 5.3.4 listet «w288h432», `drucker_einrichten.sh` hat sie gesetzt. Noch nicht gedruckt |
| DS620 in CUPS (Ubuntu/WSL, 2026-11-16) | – | ✅ erkannt als `gutenprint53+usb://dnp-ds620/…`, Treiber `dnp-ds620/expert`, mit `drucker_einrichten.sh` eingerichtet (Rückgabe 0). Fotobox-Baustein liest Zustand «bereit», Fehlerregel `abort-job` bestätigt. Füllstand erscheint erst nach dem ersten Druck (dann «ca. 100 %») |
| DS620 erster echter Druck (2026-11-16) | – | ⚠️ **1. Testkarte verzerrt:** Bild in der Breite ca. doppelt gestreckt, Rand und Überschrift abgeschnitten. Ursache (mit `cupsfilter` ohne Papier nachgestellt): Die Formate 2x6/3.375x6/3.75x6 haben dieselben Masse wie 4x6, der Bildfilter nimmt den Druckbereich von 2x6 → Bild nur 615 statt 1240 Pixel breit. Umgehung in `drucker_einrichten.sh`: diese Formate aus der PPD entfernen → Simulation 1237×1843 Pixel, unverzerrt. ✅ **2. Testkarte mit Umgehung: unverzerrt und vollständig** (Foto von dir). Am Rand fehlen ca. 3 mm (rote und blaue Linie weg, blaue nur an einer Seite sichtbar, grüne bei 6 mm überall sichtbar) → wichtige Inhalte mind. 6 mm vom Rand. Karte kommt hochkant, Motiv gedreht. Farben wirken auf dem Handyfoto etwas dunkler (nicht mit Farbmessung geprüft). **Echte Postkarte:** Bild und Text vollständig, weisser Rand ums Foto sehr schmal und ungleich (eine Seite ca. 1 mm breiter als die andere, laut dir). ✅ **Mit Rand 6 % (Commit 5f997c6): links 4 mm, oben 4 mm, rechts 4,3 mm, unten 2 cm (Fusszeile)**, von dir gemessen. ✅ Motiv-Rahmen «Hochzeit · Blütenranke» gedruckt, laut dir in Ordnung (2026-11-16). Dunkle Motiv-Rahmen noch nicht gedruckt. CUPS meldet «erfolgreich» schon 2 s nach der Übergabe, also vermutlich vor dem fertigen Druck |
| Installationsprogramm `raspberry/installieren.sh` | – | ✅ in Ubuntu/WSL ohne Administrator-Rechte geprüft: Syntax, Datenbank-Vorbelegung, Dienst-Vorlage (`systemd-analyze verify`), Startbefehl des Dienstes (Fotobox antwortet), Taster-Block in config.txt (zweimal ausgeführt = kein Doppel-Eintrag). ❔ Paketinstallation, Kiosk, raspi-config, GVFS, Taster auf echtem Pi |
| Export auf USB-Stick (`usb.py`) | ✅ 5 automatische Tests (nachgebildeter Stick). ❔ mit echtem Stick unter Windows | ✅ Tests unter Ubuntu/WSL. ❔ echter Stick, automatisches Einhängen im Kiosk-Betrieb |
| Ganze Testreihe unter Linux | – | ✅ 85 Tests in Ubuntu/WSL mit Python 3.14 (2026-11-16) |
| Monitor Verbatim 14" am Pi | – | ✅ Bild über Micro-HDMI-Adapter. ✅ Touch **nur ohne eigenes Monitor-Netzteil**, Strom + Touch über das mitgelieferte USB-C-Kabel (+ Adapter auf USB-A) vom Pi, mit offiziellem 27-W-Netzteil (2026-11-23, dein Test). ⚠️ Mit Monitor-Netzteil meldete sich der Touch oft gar nicht (Handy-Trick setzte ihn zurück). ❔ Dauerbetrieb / Unterspannung über Stunden |
| CUPS schläft nach 60 s Leerlauf (Socket-Aktivierung) | – | ⚠️ am echten Pi 2026-11-17: erster Druck «CUPS nicht erreichbar». In Ubuntu nachgestellt: Anschluss 127.0.0.1:631 tot, solange CUPS schläft; über `/run/cups/cups.sock` wird es geweckt (✅ «bereit»). Druckbaustein nutzt jetzt den Socket. ✅ Nach dem Update am Pi gedruckt, Karte kam heraus (2026-11-17) |
| Auslösen am Pi «einige Sekunden» nach 0 | – | ⚠️ 2026-11-17 beobachtet. Vermutete Ursache: Livebild-Abrufe belegen die Kamera, Auslösen muss warten; Vorfokus zu früh bei langem Countdown. Behoben (Vorfokus 2,5 s vor 0, Livebild-Pause, Vorrang) – ✅ Simulation, ❔ echter Pi |
| Bildschirmtastatur Betriebsseite (`static/tastatur.js`) | ✅ im Browser mit Klicks (Kiosk-Modus, 1600×900, 2026-11-21): PIN per Ziffernblock, Text tippen, Gross, Löschen, Ausblenden, Eingabefenster | ❔ mit dem Finger am Pi |
| Papierrolle: Zähler und Meldung des Druckers | ✅ Zähler: 8 Tests, im Browser bedient (2026-11-21) | ✅ Füllstand in % kommt vom DS620 (gesehen 2026-11-16). ❔ ob er auch eine Anzahl («prints remaining») meldet |
| «Internet einrichten» (`wlan.py`, Seite `/internet`) | ✅ Simulation: 12 Tests, ganzer Ablauf im Browser (Code, WLAN-Liste, Bildschirmtastatur, falsches/richtiges Passwort, 1600×900, 2026-11-18) | ✅ Auswertung echter nmcli-Ausgaben (Beispieltexte). ❔ echtes nmcli + polkit-Regel auf dem Pi, echtes Lokal-WLAN |
| ~~Taster über `gpio-key`~~ | – | entfällt (2026-11-17): Bedienung nur per Touchscreen |
| Gästeoberfläche per Touch-Knöpfen | ✅ ganzer Ablauf im Browser von Claude mit Maus geklickt (1600×900, Simulation, 2026-11-17). ❔ echter Finger auf dem Verbatim | ❔ |
| Python 3.13, Flask 3.1.3, Pillow 13.0.0, waitress 3.0.2 | ✅ | ❔ (in Ubuntu/WSL mit Python 3.14 ✅) |

## Beobachtungen echte Kamera (2026-11-09)
- Bei angeschlossenem USB-Kabel ist das Kamera-Display dunkel. Das ist normal (PC-Verbindungsmodus).
- Die Kamera-Uhr steht auf März 2025. Für die Fotobox ist das egal, weil wir die Dateien selbst benennen. Für saubere Bilddaten trotzdem stellen.
- Jede Aufnahme baut die Verbindung neu auf, daher dauert sie 8–15 s. Für Gäste ist das spürbar lang (siehe Aufgaben).

## Test gphoto2 unter Linux (WSL, 2026-11-10)
Messprogramm mit python-gphoto2, Verbindung bleibt offen, Ziel «Internal RAM» (Foto geht direkt an den PC, nicht auf die Karte). Raum dunkel, Objektiv auf AF, «One Shot».

| Messung | Ergebnis |
|---|---|
| Kamera erkannt (`gphoto2 --auto-detect`) | ✅ «Canon EOS 600D», Fähigkeit «Canon EOS Capture» |
| Verbinden | 0,09 s |
| Auslösen + Übertragen ohne Livebild (`capture`, Kamera fokussiert selbst) | 1,7 / 1,3 / 1,2 s, je ca. 5,6 MB, 5184×3456, EXIF «Canon» |
| Livebild (`capture_preview`) | erstes Bild nach 1,3 s, danach 40 Abrufe in 1,4 s, 1056×704. Ob jeder Abruf ein **neues** Bild war, ist nicht geprüft |
| Vorfokus im Livebild (`autofocusdrive`) und danach `capture` | **langsam:** 6,5 s bzw. 3,5 s nach dem Auslösen, weil die Kamera nochmals scharfstellt |
| Vorfokus im Livebild und danach Fernauslöser `eosremoterelease=Immediate` | **schnell:** Foto nach 1,0–1,4 s, Livebild danach sofort wieder da |
| Schärfe | alle Varianten ähnlich (Sichtprüfung der Bildmitte durch Claude, wenig Kontrast im Raum) |

**Fehler im Testprogramm:** Beim Trennen am Schluss meldete die Kamera «I/O in progress». Die Ursache ist nicht sicher geklärt, vermutlich waren noch Kamera-Ereignisse offen. Ein neuer Aufruf funktionierte sofort wieder. Der Baustein leert deshalb die Ereignisse nach jedem Foto und vor dem Trennen.

### Fotobox-Baustein `Gphoto2Kamera` mit echter Kamera (WSL, 2026-11-10)
Die ganze Fotobox lief im Ubuntu (eigene Python-Umgebung `~/fotobox-venv`). Bedient wurde sie durch Claude im Browser unter Windows.
- 4 Aufnahmen im normalen Gästeablauf mit Livebild und Countdown: **Kamera 1,4–1,5 s**, Postkarte 0,4 s, Originale 5,7 MB
- Laut Protokoll wurde «per Fernauslöser nach Vorfokus» ausgelöst
- Livebild gespiegelt mit Rahmen sichtbar
- **Nicht getestet:** Kabel ziehen während des Betriebs, Akku leer, mehrere Stunden Dauerbetrieb, echter Raspberry Pi

**Noch offen für den Raspberry Pi:** Geschwindigkeit auf echter Pi-Hardware, GVFS-Automount (ein Dateimanager, der die Kamera belegt), Vorfokus bei Dunkelheit, Dauerbetrieb über Stunden.
