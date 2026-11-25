# Übergabe für einen neuen Chat (Stand 2026-11-25)

> Diesen ganzen Text in einen neuen Chat kopieren (im Projektordner `C:\Users\timku\Documents\Projekte\Fotobox` gestartet).
> Die Projektregeln in `CLAUDE.md` werden automatisch geladen – diese Übergabe ergänzt sie um den aktuellen Stand.

---

Du übernimmst ein laufendes Projekt: eine **selbst gebaute Fotobox zur Vermietung** (Marke geplant: «momntbox»).
Lies zuerst `CLAUDE.md`, `README.md`, `Dokumente/AUFGABEN.md`, `Dokumente/KOMPATIBILITAET.md` und
`Dokumente/RASPBERRY_PI_EINRICHTEN.md`. Danach weisst du, wo was liegt.

## Über mich (Benutzer)
- Anfänger, Deutschschweiz. Antworte **auf Deutsch, einfach**, erkläre Fachbegriffe und ergänze neue in `Dokumente/GLOSSAR.md`.
- Gib mir **immer nur den nächsten Schritt** und warte auf mein Ergebnis. Trenne klar, was du machst und was ich machen muss.
- Frag nicht, was du selbst herausfinden kannst. Behaupte **nie**, etwas sei getestet, wenn es nicht geprüft ist.
- Ich schicke oft Handyfotos vom Bildschirm. Ich tippe ungern lange Befehle (Tippfehler bei `/`, Gross-/Kleinschreibung).
- Passwörter, Schlüssel und Zahlungsdaten gebe ich **selbst** ein – nie an dich schicken lassen.
- Nichts kaufen oder systemweit ändern ohne meine Zustimmung. Meilensteine mit deutschen Commit-Nachrichten sichern.

## Hardware (alles vorhanden)
- **Raspberry Pi 5 (4 GB)**, SD-Karte 64 GB, **offizielles 27-W-Netzteil**, Active Cooler. Hostname/Benutzer `fotobox`, WLAN (Heimnetz), SSH an.
- **Kamera Canon EOS 600D** per USB am Pi (gphoto2).
- **Drucker DNP DS620** (10×15 cm, Rollen à 400) per USB am Pi (CUPS + Gutenprint).
- **Monitor Verbatim 14" FHD Touch**: Bild über Micro-HDMI-Adapter. **Touch + Strom NUR über das mitgelieferte USB-C-Kabel + Adapter auf USB-A vom Pi – OHNE eigenes Monitor-Netzteil** (mit Netzteil meldet sich der Touch oft nicht).
- Keine physischen Tasten mehr: Bedienung nur per Touchscreen.
- USB-Stick «USB128» (exFAT) für Updates und Sicherung.

## Stand: Was funktioniert (am echten Pi geprüft)
Autostart in den Kiosk (Vollbild), Touch, Kamera (Livebild, Vorfokus, Fernauslöser), Druck auf DS620, Postkarten mit
11 Rahmen (5 schlicht, 6 Motiv), Handy-Fotos per QR-Code über **Cloudflare R2** (Bucket «fotikiste», EU, r2.dev-Adresse,
eigener Token «fotobox-pi» am Pi), «Internet einrichten» (WLAN wählen am Touchscreen), Bildschirmtastatur auf der
Betriebsseite, Papierrollen-Zähler, Export auf USB-Stick, Updates per Klick.

## So kommen Updates auf den Pi (wichtig!)
1. Code ändern, testen (`System\.venv\Scripts\python.exe -m unittest`, alle Tests müssen grün sein), committen.
2. Stick am Laptop (Laufwerk D:). Pi-Kopie **so** bauen: `git archive HEAD System | tar -x` in einen Temp-Ordner,
   Datei `System/VERSION` mit Commit-Kurzhash schreiben, **prüfen, dass `raspberry/*.sh` und `*.service` kein `\r` enthalten**
   (mit Python `read_bytes().count(b'\r')`), dann nach `D:\Fotobox\Fuer-Raspberry-Pi\fotobox` kopieren,
   `raspberry/fotobox_aktualisieren.sh` als `D:\Fotobox\Fotobox aktualisieren.sh` kopieren, Kopie mit dem Original vergleichen,
   Git-Bundle nach `D:\Fotobox\Sicherung\` legen.
   **Achtung:** `git archive HEAD:System` ignoriert `.gitattributes` → Windows-Zeilenenden → Skripte laufen am Pi nicht.
3. Am Pi: Stick einstecken → Dateimanager (Strg+Alt+T, `pcmanfm`) → USB128 → Fotobox → Doppelklick
   «Fotobox aktualisieren.sh» → «Execute in Terminal» → Passwort → Enter (Neustart).

## Bedienung am Pi
- Gäste: grosser Knopf «Foto machen». Namen oben 3 s gedrückt halten → «Internet einrichten» (Kunden-Code oder PIN);
  dort oben rechts «Betrieb (Vermieter)» → Betriebsseite (PIN, am Pi noch **Standard 1234**).
- Terminal: Strg+Alt+T. Fotobox-Ordner: `/home/fotobox/fotobox`, Daten: `/home/fotobox/fotobox-daten`.

## Wichtige Erkenntnisse (nicht wiederholen)
- CUPS schläft nach 60 s → Druckbaustein spricht CUPS über `/run/cups/cups.sock` an (weckt es).
- DS620 + Gutenprint: Streifenformate 2x6 usw. verursachten verzerrten Druck → `drucker_einrichten.sh` entfernt sie aus der PPD.
- DS620 schneidet ringsum ca. 3 mm ab (ungleich) → Rand ≥ 6 % / Text ≥ 6 mm vom Rand.
- Cloudflare sperrt Abrufe ohne Browser-Kennung (403) → Verbindungstest schickt User-Agent.
- QR-Code-SVG braucht `viewBox` (omitsize), sonst abgeschnitten.
- Auslösen: Vorfokus 2,5 s vor «0», Livebild beim Auslösen pausiert, «Auslösen vorziehen» (Standard 800 ms) einstellbar.
- Laptop (Windows) nutzt digiCamControl für die Kamera; Linux-Tests in WSL-Ubuntu (`~/fotobox-venv`, usbipd für USB).
- SSH-Zugang vom Laptop zum Pi wurde von der Sicherheitsprüfung gestoppt – Updates laufen per Stick.

## Offen (siehe `Dokumente/AUFGABEN.md`)
- Eigene PIN statt 1234; Kunden-Code für «Internet einrichten» festlegen und Karte dazu gestalten.
- «Auslösen vorziehen» am Pi feinjustieren; Papierrolle: Stand gesetzt? Meldet der DS620 eine Anzahl oder nur %?
- Dauertest über Stunden (Kabel ziehen, Akku leer), danach `vcgencmd get_throttled` (soll `0x0`).
- Vor der ersten Vermietung: Domain **momntbox.ch** kaufen (Hostpoint, gewählt, noch nicht gekauft) und mit Cloudflare verbinden;
  Datenschutz-Hinweis für Gäste; mobilen 4G-Router + Daten-SIM prüfen; Knopf «Fotobox ausschalten» (angeboten, nicht gebaut).
- Verständnisfragen zu den Meilensteinen sind noch unbeantwortet.

Bitte bestätige kurz, dass du den Stand verstanden hast, und frag mich dann, womit ich weitermachen möchte.
