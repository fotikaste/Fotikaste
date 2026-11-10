# Glossar

| Begriff | Bedeutung | Beispiel aus der Fotobox |
|---|---|---|
| **Backend** (Hintergrundteil) | Programmteil, der im Hintergrund läuft | Löst die Kamera aus und speichert die Fotos |
| **Frontend / Oberfläche** | Der sichtbare Teil, den man bedient | Startbildschirm mit «Taste drücken» |
| **Python** | Programmiersprache | Unser Backend ist in Python geschrieben |
| **Git** | «Speicherstand-System» für Code | Nach jedem funktionierenden Meilenstein sichern wir einen Stand (Commit) |
| **Commit** (Speicherstand) | Ein gesicherter Zwischenstand mit Beschreibung | «Startbildschirm hinzugefügt» |
| **winget** | Windows-eigenes Installationsprogramm | Damit wurde Git installiert |
| **gphoto2** | Freies Programm zur Kamerasteuerung unter Linux | Würde auf dem Raspberry Pi die 600D auslösen |
| **SDK** (Software Development Kit, Entwicklerbaukasten) | Herstellerwerkzeug, mit dem Programme ein Gerät steuern | Canon EDSDK steuert die EOS 600D unter Windows |
| **Livebild / Liveview** | Laufendes Kamerabild auf dem Monitor | Gäste sähen sich vor der Aufnahme (später) |
| **Thermosublimationsdrucker** | Fotodrucker, der Farbe per Hitze überträgt; typisch für Fotoboxen | z. B. DNP oder Canon Selphy |
| **Treiber** | Übersetzer zwischen Betriebssystem und Gerät | Ohne passenden Treiber druckt der Drucker nicht |
| **dpi** (dots per inch, Punkte pro Zoll) | Wie fein gedruckt wird | 10×15 cm bei 300 dpi = 1800×1200 Pixel |
| **Simulation** | Nachgebildetes Gerät zum Testen | «Simulierter Drucker» speichert eine Datei statt zu drucken |
| **Virtuelle Umgebung (venv)** | Abgeschlossener Ordner für die Python-Pakete eines Projekts | Unsere Pakete landen in `System/.venv`, nicht im ganzen Windows |
| **SQLite** | Kleine Datenbank in einer einzigen Datei | Speichert Druckzähler, damit sie Neustarts überleben |
| **127.0.0.1 / localhost** | Adresse «dieser Computer» | Die Fotobox ist nur am eigenen PC erreichbar |
| **Thema** (engl. Theme) | Paket aus Farben, Schrift und Dekoration | «Winter» mit Schneeflocken und Schreibschrift Pinyon Script |
| **OFL** (Open Font License, freie Schriftlizenz) | Lizenz, die Schriften auch kommerziell frei nutzbar macht | Unsere Schreibschriften stehen unter OFL, also auch für die Vermietung |
| **Server** | Programm, das auf Anfragen wartet und antwortet | Unsere Fotobox läuft als Server, der Browser fragt ihn nach dem nächsten Foto |
| **API** (Programmierschnittstelle) | Feste «Bestelladressen», über die Programmteile miteinander reden | Die Oberfläche bestellt ein Foto über `/api/sitzung/…/aufnahme` |
| **Flask** | Python-Baukasten für Webserver | Verbindet Browser-Oberfläche und Fotobox-Logik |
| **Pillow** | Python-Paket zur Bildbearbeitung | Setzt Foto, Rand und Namen zur Postkarte zusammen |
| **waitress** | Stabiler Server zum Betreiben einer Flask-Anwendung | Läuft im schwarzen Fotobox-Fenster |
| **Sitzung** (engl. Session) | Ein Durchgang eines Gastes von Start bis Abschluss | Hat eine eindeutige Kennung wie `S-20261109-181232-8db3ec` |
| **Druckauftrag** | Bitte an den Drucker, eine Karte x-mal zu drucken | Kennung wie `D-…`; Status: angefordert, in Warteschlange, erfolgreich, fehlgeschlagen, unbekannt |
| **Kontingent** | Höchstzahl erlaubter Abzüge pro Veranstaltung | Standard 300 – danach zeigt die Fotobox «Drucken nicht mehr möglich» |
| **Eingabesperre** | Kurze Pause nach jedem Bildschirmwechsel, in der Tasten ignoriert werden | Verhindert, dass ein Doppeldruck auf «Drucken» gleich den nächsten Schritt bestätigt |
| **Protokoll / Log** | Tagebuch des Programms | `System\daten\protokoll\fotobox.log` zeigt z. B. Kamerafehler |
| **Unit-Test** (automatischer Test) | Kleines Prüfprogramm, das eine Funktion automatisch kontrolliert | Prüft z. B., dass 8 gleichzeitige Druckwünsche nur 1 Auftrag erzeugen |
| **digiCamControl** | Kostenloses Windows-Programm zur Kamerasteuerung | Unsere Fotobox ruft dessen Befehl `CameraControlCmd.exe` auf, um die 600D auszulösen |
| **MF / AF** (manueller / automatischer Fokus) | Wer stellt scharf: du am Objektivring oder die Kamera | Mit MF löst die Kamera immer sofort aus, muss aber vorher einmal auf die Gäste scharfgestellt werden |
| **Zeichenkodierung** | Regel, wie Buchstaben als Zahlen gespeichert werden | Das deutsche Windows schreibt Umlaute anders; deshalb ist die Kamera-Prüfung zuerst abgestürzt |
| **Veranstaltung** | Ein Mietauftrag mit eigenen Fotos, eigenem Thema und eigenem Druckkontingent | «Geburtstag Mia wird 30» im Sommer-Thema |
| **Export** | Kopie der Bilder an einen anderen Ort, das Original bleibt | Bilder für den Kunden auf einen USB-Stick |
| **Papierkorb** (weiches Löschen) | Gelöschtes wird nur verschoben und ist wiederherstellbar | `System\daten\papierkorb\` |
| **Migration** | Automatisches Anpassen einer bestehenden Datenbank an eine neue Programmversion, ohne Datenverlust | Deine bisherigen Zähler blieben erhalten, als «Thema pro Veranstaltung» dazukam |
| **QR-Code** | Quadratischer Strichcode, den eine Handykamera als Internet-Adresse liest | Führt den Gast direkt zu seinem Foto |
| **Online-Speicher / Object Storage** | Dateiablage im Internet, die Dateien über Adressen bereitstellt | Infomaniak (Genf) oder Cloudflare R2 als mögliche Anbieter |
| **Upload-Warteschlange** | Liste von Fotos, die noch hochgeladen werden müssen | Ohne Internet bleibt ein Foto «wartend», bis wieder Verbindung da ist |
| **Lifecycle-Regel** (Ablaufregel) | Einstellung beim Online-Speicher, die Dateien nach X Tagen automatisch löscht | Fotos verschwinden nach 30 Tagen von selbst |
| **Kiosk-Modus** | Browser im Vollbild ohne Adressleiste und Menüs | So sehen Gäste nur die Fotobox |
