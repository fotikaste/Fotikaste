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
| Fotodrucker | ❔ noch nicht gewählt | ❔ noch nicht gewählt |
| Python 3.13, Flask 3.1.3, Pillow 13.0.0, waitress 3.0.2 | ✅ | ❔ |

## Beobachtungen echte Kamera (2026-11-09)
- Bei angeschlossenem USB-Kabel ist das Kamera-Display dunkel. Das ist normal (PC-Verbindungsmodus).
- Die Kamera-Uhr steht auf März 2025. Für die Fotobox ist das egal, weil wir die Dateien selbst benennen. Für saubere Bilddaten trotzdem stellen.
- Jede Aufnahme baut die Verbindung neu auf, daher dauert sie 8–15 s. Für Gäste ist das spürbar lang (siehe Aufgaben).
