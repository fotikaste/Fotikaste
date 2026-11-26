# Phase 5 – Bericht (Fotobox-Integration)

Stand: 2026-11-26 · Branch `plattform/entwicklung` · nur lokal (Laptop). **Die produktive Fotobox (Pi) wurde nicht verändert.**
Schritte 1–3 aus `R2_MIGRATION.md` sind erledigt. Die Schritte 4–7 (Pi-Update, alte Schlüssel löschen, alten Bucket schliessen) brauchen deine Freigabe.

## Was wurde entwickelt?
**Plattform**
- **Geräte** (`/admin/geraete`): Fotobox anlegen. Das Geräte-Token (256 Bit) wird **genau einmal** angezeigt und nur als Hash gespeichert. Pro Gerät gibt es «Neues Token» und «Alle Tokens widerrufen». Die Übersicht zeigt «zuletzt gesehen», die Version und die Warteschlange.
- **Events** (`/admin/events`, auch aus dem Buchungsdetail): Galerie mit Fotobox, Status geplant → **aktiv** → abgeschlossen → archiviert.
  Pro Fotobox ist höchstens **ein** aktives Event möglich, das erzwingt die Datenbank. Archivieren löscht alle Fotos endgültig.
- **Geräte-API** `/api/device/v1/…`: `config`, `heartbeat`, `uploads` (anmelden), `uploads/{id}/web|thumb` (hochladen).
  Der Server prüft Token, Event-Zuordnung, Grösse, **SHA-256-Prüfsumme** und JPEG-Kennung. Zuerst wird Speicher **reserviert** (atomar, Sperre ab 90 %).
  Wird dasselbe Foto nochmals angemeldet, entsteht kein Doppel; ein abgebrochener Upload setzt bei der fehlenden Variante wieder ein.
- **Privater Fotospeicher** (R2-Binding `PHOTOS`, Bucket `fotikaste-fotos`, EU): ohne öffentliche Adresse und ohne r2.dev. Lokal simuliert wrangler den Speicher, **angelegt wird er erst in Phase 7**.
- **Gäste-Link** `/f/<token>`: zeigt nur das eigene Foto, mit «Foto speichern». Vor dem Upload erscheint «noch unterwegs» (die Seite lädt sich selbst neu), nach Ablauf «nicht mehr online».
  Ein unbekannter Link sieht gleich aus wie «unterwegs», so verrät die Seite nicht, ob ein Link existiert. Dazu kommen `no-referrer`, `noindex` und eine Begrenzung der Aufrufe pro IP.
- **Veranstalter**: Im Kundenkonto sieht der Veranstalter die Fotos seines Events (Vorschau und Gross), aber nur für eigene Buchungen.
- **Täglicher Cron** (gratis): löscht Fotos nach Ablauf (Event-Datum + 30 Tage) oder nach dem Archivieren, entfernt Uploads, die nach 7 Tagen nicht fertig sind, räumt Zähler auf und sendet wartende Mails.

**Fotobox-Software (`System/`, nur ergänzt)**
- Neue Klasse `PlattformGalerie` in `galerie.py`, **zusätzlich** zu «Simulation» und «R2 (alt)». Ausgewählt wird sie auf der Betriebsseite unter «Fotikaste-Plattform».
- Die Fotobox erzeugt den Gäste-Link **offline** (`<plattform>/f/<zufall>`). An die Plattform geht nur der Fingerabdruck des Links.
- Sie erzeugt eine Web-Version (lange Seite laut Plattform, 2400 px) und eine Vorschau (400 px). Dabei wird nie vergrössert, und **das Original bleibt unverändert**.
- Das Event merkt sie sich, solange sie online ist. Fotos, die entstehen, solange die Fotobox seit dem Start noch nie online war, ordnet die Plattform dem aktiven Event zu.
- Betriebsseite: Adresse und Geräte-Token eintragen (das Token wird nie angezeigt), dazu «Verbindung testen». Bei http-Adressen sind nur solche im eigenen Netz erlaubt (für Tests).
- Offline fotografieren und drucken funktioniert unverändert. Uploads warten wie bisher in der Warteschlange.

## Entscheide (ADR-031)
1. **Upload durch den Worker statt über vorsignierte URLs** (Abweichung vom API-Entwurf): Dann braucht es nirgends einen R2-Schlüssel, auch nicht im Worker. Der Server prüft Grösse und Prüfsumme selbst. Das funktioniert lokal ohne Konto.
   Nachteil: Jeder Upload zählt als Worker-Aufruf (das Gratiskontingent ist mit 100'000 pro Tag gross genug).
2. **Originale werden nicht hochgeladen**, nur die Web-Version und die Vorschau (wie in der FAQ beschrieben: Originale bleiben auf der Fotobox).
3. **Eine gemeinsame Galerie für alle Gäste (mit Passwort) gibt es noch nicht.** Eine Passwortprüfung wäre im Gratis-Tarif zu rechenintensiv, darum folgt sie später.

## Tests (tatsächlich gelaufen, 2026-11-26)
- **Vitest 109/109** (13 neu): Token nur als Hash, 401/403 und Rollen, nur ein aktives Event pro Gerät, voller Upload mit belegtem Speicher und
  gleichem Inhalt im Speicher, «unterwegs» für unbekannte Links, Wiederholung ohne Doppel, falsche Grösse/Prüfsumme/kein JPEG, fremdes Gerät,
  Speichergrenze → 507, Heartbeat, Veranstalter sieht nur eigene Fotos, Archivieren löscht alles (Link → 410), widerrufenes Token, Cron-Löschung.
- **Playwright 76/76** (Desktop + Handy): Gerät anlegen (Token einmalig), Event aktivieren, **Geräte-Simulator** lädt hoch, Gäste-Seite und
  Admin-Galerie barrierefrei, Archivieren löscht. Lauf mit `PW_PORT=8792` (eigener Server, siehe unten).
- **Fotobox 125/125** (9 neu, mit nachgebauter Plattform): Link-Format, Varianten und Prüfsummen, nie vergrössern, Original unverändert,
  Wiederaufnahme, Fehlermeldungen, offline → QR sofort, Upload später, Token nie an den Browser.
- **Echter Durchlauf am Laptop:** Der Fotobox-Code (simulierte Kamera) hat ein Foto auf die lokale Plattform hochgeladen. Der Gäste-Link lieferte die Seite und das JPEG (69 KB).

## Bildschirmfotos (`Plattform/test-results/`)
`fotobox-{desktop,handy}-geraet-token.png`, `-gast.png`, `-event.png`.

## Bekannte Lücken und Risiken
- **Der Pi ist noch nicht umgestellt.** Er lädt weiterhin mit dem alten R2-Schlüssel hoch. Die Risiken aus `R2_MIGRATION.md` bestehen, bis Schritt 5 und 6 erledigt sind.
- Ohne Domain und ohne Veröffentlichung (Phase 7) gibt es keine echte Plattform-Adresse für Gäste-QR-Codes.
- Die Uhrzeit des Pi wird nur als «aufgenommen am» mitgeschickt, sie entscheidet nichts.
- Die Fotobox sendet noch keinen eigenen Heartbeat (die Plattform sieht sie trotzdem bei jedem Abruf).
- Auf Port 8788 lief während der Arbeit ein älterer lokaler Server. Er kennt die neuen Einstellungen (Fotospeicher, `/f/`) erst nach einem Neustart.
- In der lokalen Entwicklungsdatenbank liegen jetzt Test-Geräte und das Event «Integrationstest Laptop» (nur lokal).

## Nächster Schritt
1. Sichtprüfung (Betriebsseite am Laptop, Admin Geräte/Events). 2. Merge nach `main`.
3. **Freigabe Pi-Update** (Schritt 4): erst wenn du ausdrücklich zustimmst. Sinnvoll erst, wenn die Plattform online ist (Phase 7), sonst hat der Pi kein Ziel.
4. Danach Phase 6 (Rechnungen).

## Drei Verständnisfragen
1. Was kann jemand anrichten, der die SD-Karte der Fotobox stiehlt – vorher mit R2-Schlüssel und nachher mit Geräte-Token?
2. Ein Gast scannt den QR-Code, aber die Fotobox hat gerade kein Internet. Was sieht er, und was passiert später?
3. Warum löscht «Archivieren» alle Fotos, und was passiert ohne Archivieren nach 30 Tagen?
