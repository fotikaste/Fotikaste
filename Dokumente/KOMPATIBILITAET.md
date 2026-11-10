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
| Online-Galerie Cloudflare R2 | ❔ Baustein fertig. Signatur mit botocore 1.43.127 verglichen (identisch). Mit echtem Konto noch nicht getestet. | ❔ |
| **Canon EOS 600D unter Linux (gphoto2)** | – | ✅ **Vorstufe (2026-11-10): Ubuntu 26.04 in WSL 2 auf dem Laptop, Kamera über usbipd-win 5.3.0 weitergereicht, gphoto2 2.5.32, python-gphoto2 2.6.3.** Fotobox-Baustein im echten Ablauf: Foto nach 1,4–1,5 s. Kein echter Raspberry Pi, siehe unten |
| Fotodrucker | ❔ noch nicht gewählt | ❔ noch nicht gewählt |
| Python 3.13, Flask 3.1.3, Pillow 13.0.0, waitress 3.0.2 | ✅ | ❔ |

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
