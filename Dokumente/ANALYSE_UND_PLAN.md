# Analyse, Architektur und Entwicklungsplan

Stand: 2026-11-09 · Status: Vorschlag, wird bei neuen Erkenntnissen angepasst

Kennzeichnung: **[Fakt]** = geprüft (Quelle genannt) · **[Empfehlung]** = mein Vorschlag · **[Annahme]** = noch ungeprüft

## 1. Ausgangslage

| Thema | Stand |
|---|---|
| Entwicklungs-PC | Lenovo-Laptop, Windows 11 Pro, Intel Core Ultra 7 255U, 16 GB RAM **[Fakt, gemessen]** |
| Bildschirm | BenQ GL2450H, kein Touch. Bedienung über wenige **physische Tasten** |
| Kamera | Canon EOS 600D, USB-Kabel vorhanden |
| Fotoformat | **Ein** Foto pro Sitzung, Postkarte 10×15 cm (Querformat) |
| Drucker | Noch keiner für die Fotobox. Vorhanden ist ein HP Smart Tank 7000, das wird später höchstens für Testdrucke genutzt |
| Software | Python 3.13 vorhanden, Git wird installiert |

## 2. Kamera: Canon EOS 600D

Drei Fähigkeiten, die man unterscheiden muss:

| Fähigkeit | Bedeutung | Linux / Raspberry Pi (gphoto2) | Windows |
|---|---|---|---|
| Fernauslösung | PC löst die Kamera aus | ✅ «Image Capture, Trigger Capture» **[Fakt, gphoto2-Liste]** | ✅ laut Canon SDK und digiCamControl-Liste **[Fakt, Liste; selbst nicht getestet]** |
| Bildübertragung | Foto gelangt per USB auf den PC | ✅ **[Fakt, gphoto2-Liste]** | ✅ wie oben |
| Livebild | Laufendes Vorschaubild auf dem Monitor | ✅ «Liveview» **[Fakt, gphoto2-Liste]** | ✅ laut Canon **[Fakt, Canon-Support]** |

Quellen: [gphoto2-Kameraliste](https://gphoto.sourceforge.io/proj/libgphoto2/support.php), [gphoto2-Fernsteuerung](https://gphoto.sourceforge.io/doc/remote/), [Canon EOS Digital SDK](https://canon.cnn.saas.dataweavers.io/apps/eos-digital-software-development-kit), [digiCamControl-Kameraliste](https://digicamcontrol.com/cameras)

**Folgerungen:**
- gphoto2 ist das Standardwerkzeug auf Linux. Unter Windows läuft es nicht direkt **[Fakt; gphoto2 ist für Linux/macOS gebaut]**. Für den Windows-Test brauchen wir deshalb einen anderen Weg:
  - **Option A: digiCamControl** (kostenlos, Open Source, nur Windows). Muss installiert werden. Ob sein Kommandozeilenwerkzeug sich für uns eignet, prüfe ich vor der Installation. **[Annahme]**
  - **Option B: Canon EDSDK** (kostenlos). Dafür musst du dich selbst beim Canon-Entwicklerprogramm registrieren.
- **[Empfehlung]** Für den ersten echten Kameratest unter Windows nehmen wir Option A. Für den Raspberry Pi wäre es gphoto2.
- **[Empfehlung]** Ein Livebild bauen wir erst später. Ein Countdown mit dem Hinweis «Schau in die Kamera» reicht für den Prototyp. Ein dauerhaftes Livebild belastet ausserdem Akku und Sensor.
- **Wichtig für den Mietbetrieb [Annahme, prüfen vor Kauf]:** Ein Akku hält keinen ganzen Abend durch. Für die 600D gibt es ein Netzteil mit Akku-Attrappe (Canon ACK-E8). Die automatische Abschaltung der Kamera muss deaktiviert werden.
- **Hinweis zum Kabel [Annahme, ca. 90 % sicher]:** Die 600D hat nach meinem Wissen einen *Mini*-USB-Anschluss, nicht Micro-USB. Wenn dein Kabel passt, ist alles gut.

## 3. Plattform: Raspberry Pi oder kleiner Windows-PC?

| Kriterium | Raspberry Pi 5 | Kleiner Windows-PC (Mini-PC) |
|---|---|---|
| Kamera 600D | Sehr gut über gphoto2 **[Fakt, Liste]** | Gut über Canon SDK oder digiCamControl **[Fakt, Liste]** |
| Fotodrucker (Thermosublimation, z. B. DNP, Canon Selphy) | Über freie Treiber (Gutenprint), Qualität je nach Modell **[Annahme, pro Modell prüfen]** | Offizielle Herstellertreiber, meist problemlos |
| Leistung | Reicht für 1 Foto pro Sitzung **[Annahme, auf dem Pi messen]** | Mehr als genug |
| Zuverlässigkeit | Gut mit SSD oder hochwertiger SD-Karte. Stromausfall kann SD-Karte beschädigen | Gut, aber Windows-Updates und Meldungen müssen gezähmt werden |
| Kosten / Strom | Günstig, sparsam | Teurer, mehr Strom |

**[Empfehlung]** Die Plattform legen wir erst fest, wenn der Drucker gewählt ist. Die Kamera spricht eher für den Pi, beim Drucker hängt es vom Modell ab. Die Software baue ich so, dass beides möglich bleibt. Raspberry-Pi-Kompatibilität gilt erst als bestätigt, wenn wir sie auf einem echten Pi getestet haben.

## 4. Ablauf für Gäste (mit 3 physischen Tasten)

Tasten: **Links · Mitte · Rechts**. Auf jedem Bildschirm steht direkt über jeder Taste, was sie bewirkt. Zum Testen am PC gelten die Pfeiltaste links, Leertaste/Enter und die Pfeiltaste rechts. Die Maus funktioniert auch.

| Schritt | Anzeige | Tasten |
|---|---|---|
| 1. Start | Veranstaltungsname, grosse Aufforderung «Taste drücken» | beliebige Taste = Start |
| 2. Bereitmachen + Countdown | «Schau in die Kamera ↑», 3 – 2 – 1 | keine (Eingaben werden ignoriert) |
| 3. Aufnahme | weisser Blitz, «Dein Foto wird geladen …» | keine |
| 4. Vorschau | Foto im echten Postkarten-Zuschnitt | Links: Nochmal · Mitte: **Drucken** · Rechts: Fertig |
| 5. Anzahl Abzüge | grosse Zahl | Links: − · Mitte: **Drucken** · Rechts: + |
| 6. Druck | «Dein Foto wird gedruckt …» | keine |
| 7. Abschluss | «Danke! Bitte entnimm dein Foto unten» | kehrt nach 8 s automatisch zum Start zurück |

**Beurteilung:**
- *Ohne Erklärung bedienbar?* Ja. Pro Bildschirm gibt es höchstens drei Optionen, und die wichtigste liegt immer auf der mittleren Taste.
- *Doppeldruck:* Jede Taste löst pro Bildschirm nur einmal aus. Während Countdown, Aufnahme und Druck werden Tasten ignoriert. Der Server lehnt doppelte Druckaufträge zusätzlich ab, auch nach einem Neustart.
- *Inaktivität:* Nach 60 s ohne Taste (einstellbar) folgt ein 10-s-Hinweis «Noch da?» und danach die Rückkehr zum Start. **Ohne Bestätigung wird nie gedruckt.** Das Foto bleibt gespeichert, ist aber nicht mehr sichtbar.
- *Wiederholen:* Standardmässig sind höchstens 2× «Nochmal» möglich. Das verhindert Endlosschleifen und schont den Kameraverschluss.
- *Kamera fällt aus:* Gäste sehen «Kurze Pause, gleich geht's weiter» mit «Nochmal versuchen». Die technischen Details stehen nur im Fehlerprotokoll für den Betreiber.
- *Speicher voll oder Datei nicht speicherbar:* Die Fotobox nimmt keine neue Sitzung an und zeigt einen Betreiberhinweis. Kein Gast verliert dadurch ein bereits gezeigtes Foto unbemerkt.
- *Drucker fällt aus oder Status unklar:* Gäste sehen «Dein Foto wird nachgedruckt, bitte melde dich beim Team». Der Auftrag erscheint im Betreiberbereich zur Entscheidung (nachdrucken / als erledigt markieren). Er wird **nie automatisch wiederholt**.
- *Datenschutz:* Nach jeder Sitzung leert die Oberfläche alle Bilder. Fotos sind nur über den geschützten Betreiberbereich zugänglich.

**Für den ersten Prototyp nötig:** Schritte 1–7, Testbilder, simulierter Druck inkl. Fehler, Inaktivität.
**Kann warten:** Livebild, Rahmen und Logos, QR-Code-Download, mehrere Layouts, Ton.

## 5. Architektur

```
Browser im Vollbild (Gäste)      Browser (Betreiber, mit PIN)
        │  HTTP, nur auf diesem PC (127.0.0.1)
        ▼
Python-Server ──► Sitzungsablauf (Zustände, Sperren gegen Doppelauslösung)
                 ├─► Kamera-Baustein:   simuliert | digiCamControl (Windows) | gphoto2 (Linux)
                 ├─► Bildbaustein:      Postkarte zusammensetzen (Pillow)
                 ├─► Druck-Baustein:    simuliert | Windows-Drucker | CUPS (Linux)
                 └─► Speicher:          SQLite-Datei (Einstellungen, Zähler, Aufträge) + Bildordner
```

- **Abhängigkeiten [Empfehlung]:** Flask (Webserver), Pillow (Bildverarbeitung), waitress (stabiler Server). SQLite ist bereits in Python enthalten. Alles wird isoliert im Projektordner installiert (in einer «virtuellen Umgebung»).
- **Oberfläche:** einfaches HTML/CSS/JavaScript ohne Zusatzwerkzeuge. Schriften liegen lokal im Projekt, damit alles **ohne Internet** läuft.
- **Druckformat für den Prototyp [Beispielformat]:** 10×15 cm quer, 300 dpi = **1800×1200 Pixel**. Die 600D liefert ebenfalls 3:2, deshalb muss kaum etwas zugeschnitten werden. Das endgültige Format stimmen wir auf den Drucker ab. Viele Fotodrucker brauchen etwas Überstand, z. B. 1844×1240 bei DNP **[Annahme]**.
- **Druckstatus:** angefordert → in Warteschlange → erfolgreich / fehlgeschlagen / Status unbekannt. Eine Übergabe an Windows ist noch kein gedrucktes Foto.

## 6. Meilensteine

| # | Meilenstein | Woran du erkennst, dass er erreicht ist |
|---|---|---|
| M0 | Einrichtung | Ordner, Git, Dokumente vorhanden. Erster Commit |
| M1 | Designvorschlag | Du hast den Startbildschirm am BenQ gesehen und Feedback gegeben |
| M2 | **Gästeablauf simuliert** (= dein erster Meilenstein) | 10 Sitzungen mit Testbildern, Postkarten ansehen, simulierten Druckfehler beheben |
| M3 | Echte Kamera | Ein Foto der 600D kommt per USB auf den PC und läuft durch denselben Ablauf |
| M4 | Betreiberbereich | PIN, Veranstaltung, Druckkontingent 300, Zähler überleben Neustart |
| M5 | Tests und Übergabe | Automatische Tests grün, README und Startdatei funktionieren |
| M6 | Hardwareentscheid | Drucker- und Plattformwahl mit Prüfliste vor dem Kauf |
