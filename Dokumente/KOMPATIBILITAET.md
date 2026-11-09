# Kompatibilität

Legende: ✅ **getestet** (selbst ausprobiert) · 📄 **nur Doku** (laut offizieller Quelle) · ❔ **ungeprüft**

| Komponente | Windows 11 (Entwicklungs-PC) | Raspberry Pi |
|---|---|---|
| Anwendung mit simulierter Kamera und simuliertem Drucker | ✅ 21 automatische Tests und Browserprüfung durch Claude (2026-11-09) | ❔ |
| Gästeoberfläche bei 1920×1080 | ✅ im eingebauten Browser von Claude (nachgebildete Grösse) | ❔ |
| BenQ GL2450H, echte Darstellung | ❔ von dir zu prüfen | ❔ |
| Startdatei `Fotobox starten.bat` | ❔ von dir zu prüfen (Claude hat den Startbefehl darin geprüft, nicht die Datei selbst) | – |
| Canon EOS 600D – Auslösen und Übertragen | 📄 Canon SDK, digiCamControl-Liste | 📄 gphoto2-Liste |
| Canon EOS 600D – Livebild | 📄 Canon-Support | 📄 gphoto2-Liste |
| Fotodrucker | ❔ noch nicht gewählt | ❔ noch nicht gewählt |
| Python 3.13, Flask 3.1.3, Pillow 13.0.0, waitress 3.0.2 | ✅ | ❔ |
