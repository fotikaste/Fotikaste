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
| **S3** | Weit verbreitete «Sprache» für Online-Speicher, die viele Anbieter verstehen | Unsere Fotobox spricht S3 mit Cloudflare R2. Ein Anbieterwechsel ist so einfach. |
| **Bucket** (Eimer) | Ein Speicherbereich beim Online-Speicher, wie ein Hauptordner | `fotobox-galerie` |
| **API-Token / Zugangsschlüssel** | Benutzername (Access Key ID) und Passwort (Secret Access Key) für Programme | Damit darf die Fotobox Fotos in den Bucket legen |
| **Signatur (SigV4)** | Rechnerischer Beweis, dass eine Anfrage vom Schlüsselbesitzer stammt, ohne das Geheimnis mitzuschicken | Jede Upload-Anfrage an Cloudflare wird so unterschrieben |
| **WSL** (Windows-Subsystem für Linux) | Ein echtes Linux, das als Programm in Windows läuft | Damit testen wir gphoto2, ohne einen Raspberry Pi zu haben |
| **Ubuntu** | Eine verbreitete Linux-Variante | Läuft bei dir in WSL. Raspberry Pi OS ist eng verwandt |
| **usbipd-win** | Programm, das ein USB-Gerät von Windows an WSL weiterreicht | `usbipd attach --wsl --busid 2-1` gibt die Kamera an Linux, `detach` gibt sie zurück |
| **sudo** | «Als Administrator ausführen» unter Linux, fragt nach deinem Linux-Passwort | `sudo apt-get install gphoto2` |
| **apt** | Installationsprogramm von Ubuntu, ähnlich wie winget | Hat gphoto2 installiert |
| **Fernauslöser (Remote Release)** | Befehl, der den Auslöser der Kamera per Kabel drückt, ohne dass sie nochmals scharfstellt | Unter Linux brachte das das Foto in ca. 1 s |
| **CUPS** | Das Drucksystem von Linux (und macOS). Verwaltet Drucker und Druckaufträge | Der DNP DS620 wird in CUPS unter dem Namen «DS620» eingerichtet |
| **Gutenprint** | Freies Treiberpaket für viele Fotodrucker unter Linux | Enthält den Treiber für den DS620 |
| **IPP** (Internet Printing Protocol) | Standard-Sprache, mit der Programme mit Druckern bzw. CUPS reden | Die Fotobox fragt per IPP: «Ist Auftrag 41 fertig?» |
| **GPIO** | Die Steckstifte am Rand des Raspberry Pi, über die er Signale lesen und schalten kann | Die drei Taster hängen an GPIO17, GPIO27, GPIO22 |
| **GND** (Ground, Masse) | Der «Minus»-Anschluss | Zweiter Anschluss jedes Tasters |
| **config.txt** | Einstellungsdatei des Raspberry Pi, wird beim Einschalten gelesen | Dort steht, dass die Taster als Pfeil links / Enter / Pfeil rechts gelten |
| **Dienst (systemd-Service)** | Programm, das Linux beim Einschalten automatisch startet und nach einem Absturz neu startet | `fotobox.service` |
| **Terminal** | Fenster, in dem man Befehle eintippt | `bash installieren.sh` |
| **Kiosk-Modus** | Browser im Vollbild ohne Adressleiste und Menüs | So sehen Gäste nur die Fotobox |
| **Rahmen** (der Postkarte) | Aufbau der Karte: wo das Foto liegt, wie breit der Rand ist, wo der Text steht. Farben und Schrift kommen vom Thema | «Sofortbild», «Randlos mit Band» |
| **Passepartout** | Breiter Rand um ein Bild, oft mit feiner Linie, wie bei einem gerahmten Foto | Rahmen «Passepartout» |
| **Beschnitt** | Was der Drucker beim randlosen Druck am Kartenrand abschneidet (beim DS620 ca. 3 mm) | Darum steht Text mind. 6 mm vom Rand |
| **Vorschau** (Betriebsseite) | Bild der Postkarte mit den Werten im Formular, noch bevor gespeichert wird | Text ändern → Vorschau zeigt es sofort |
| **Motiv-Rahmen** | Rahmen mit eigener Dekoration, Farbe und Schrift für einen Anlass | «Hochzeit · Blütenranke», «Party · Konfetti» |
| **Supersampling** | Doppelt so gross zeichnen und dann verkleinern, damit Kanten weich statt treppig werden | So entstehen die Schneeflocken und Blätter |
| **Einhängen** (engl. mount) | Linux macht einen eingesteckten Stick als Ordner verfügbar | Stick «USB128» erscheint als `/media/<name>/USB128` |
| **sync** | Befehl: alles, was noch im Zwischenspeicher liegt, wirklich auf den Stick schreiben | Danach darf der Stick abgezogen werden |
| **Touchscreen** | Bildschirm, der auf Berührung reagiert – Antippen wirkt wie ein Mausklick | Der Verbatim 14" der Fotobox |
| **Hauptaktion** | Der wichtigste nächste Schritt einer Ansicht, immer der grosse, farbige Knopf | «Foto machen», «Drucken» |
| **NetworkManager / nmcli** | Teil von Linux, der WLAN und Netzwerk verwaltet; `nmcli` ist sein Befehl | Die Fotobox wählt damit das WLAN des Lokals |
| **polkit** | Regelwerk in Linux, wer was am System ändern darf | Regel erlaubt dem Fotobox-Dienst, das WLAN zu wechseln |
| **Kunden-Code** | Zahlencode für den Kunden, erlaubt nur «Internet einrichten» | Steht auf einer Karte bei der Fotobox |
| **Bildschirmtastatur** | Tastatur, die auf dem Touchscreen erscheint | WLAN-Passwort eingeben ohne echte Tastatur |
| **Auslöseverzögerung** | Zeit zwischen Auslöse-Befehl und dem Klick der Kamera | Wird mit «Auslösen vorziehen» ausgeglichen |
| **Rollenzähler** | Eigene Zählung der Bilder auf der Papierrolle: Stand beim Einlegen minus gedruckte Abzüge | «noch ca. 390 Bilder» |
