# Phase 3 – Bericht (Buchung)

Stand: 2026-11-26 · Branch `plattform/entwicklung` · nur lokal, nichts veröffentlicht, kein Konto eingerichtet, keine Mail verschickt.

## Was wurde entwickelt?
- **Katalog und Preise in der Datenbank** (`migrations/0002_buchung.sql`): Essential 290 / Premium 450 / Signature 590, Zusatztag 45,
  Storno-Option 20 (bis 28 Tage), Fahrt 50 bis 20 km + 1.20/km ab 8370 Sirnach. Ein Test prüft, dass Webseite und Datenbank dieselben Preise zeigen.
- **Liefergebiete** (`delivery_zones`): Kantone, PLZ-Bereiche, max. km, Pauschale, inkl. km, Preis/km, Abholung erlaubt, Sofortbuchung,
  Mindestvorlauf, Puffertage. Start: «Ostschweiz und Zürich» (TG, SG, AR, AI, SH, GL, ZH), Vorlauf 7 Tage, kein Puffer.
- **Preisberechnung nur im Worker** (`worker/lib/preis.ts`, `buchung.ts`). Was der Browser an Preisen schickt, wird ignoriert.
  Distanz = Luftlinie zwischen Postleitzahlen × 1.3, aufgerundet, als «geschätzt» angezeigt.
- **Verfügbarkeit ohne Doppelbuchung**: Jeder belegte Tag ist eine Zeile in `allocation_days` mit UNIQUE(Ressource, Tag, Slot).
  Fotobox: jeder Miettag. Lieferung: Liefer- und Abholtag. Alles in einem atomaren `batch()`.
- **Ablauf**: Angebot prüfen → Termin **15 Minuten halten** → Kontaktangaben → verbindlich buchen. Abgelaufene Holds werden automatisch frei.
- **Direktbuchung oder Anfrage**: Direkt, wenn im Liefergebiet und genug Vorlauf. Sonst Anfrage (kurzfristig, ausserhalb, unbekannte PLZ):
  Termin bleibt reserviert, der Inhaber bestätigt (bei offenem Fahrpreis mit Betrag) oder lehnt ab (Tage werden frei).
- **Zahlungsplan konfigurierbar** (Anzahlung %, Kaution, Frist), Standard: Gesamtbetrag **nach Absprache**. Keine Zahlungsfunktion.
- **Positionen als Snapshot** (`booking_items`): spätere Preisänderungen ändern bestehende Buchungen nicht.
- **E-Mails nur über die Outbox** mit `dedupe_key`; im **Testmodus** (Standard) wird nichts an Kunden verschickt («zurückgehalten»).
  Tagesdrossel 80, Sperre über die Verbrauchszähler. Mails: Bestätigung/Anfrage-Eingang an Kunde, Hinweis an Inhaber, Bestätigt/Abgelehnt.
- **Kundenportal mit Magic Link** (`/konto`): Link per Mail, 15 Min., einmalig, nur als Hash gespeichert; Token im #-Teil der Adresse, eingelöst erst per Klick
  (Link-Vorschauen von Mailprogrammen verbrauchen ihn nicht). Sitzung 30 Tage, HttpOnly-Cookie. Kunde sieht nur eigene Buchungen.
- **Seiten**: `/buchen` (Paket, Datum, Lieferung, Option, Live-Preis, Reservierung, Kontakt, Bestätigung), `/verfuegbarkeit` (Monatskalender),
  `/konto`, `/konto/anmelden`. Startseiten-Datumsfeld führt jetzt direkt zur Buchung.
- **Admin** `/admin`: Liste der Buchungen (Anfragen zuerst), Bestätigen/Ablehnen per Knopf (Recht `bookings:write`), E-Mail-Ausgang.
- **Schutz**: Herkunftsprüfung, Anfragebegrenzung (Halten 10/h, Abschluss 10/h, Links 5/h pro Adresse, 20/h pro IP), Turnstile
  (ohne Schlüssel nur lokal/Test übersprungen, in Produktion abgelehnt), Längen- und Formatprüfung aller Eingaben.

## Wie spielt es zusammen?
Browser (statische Seite) → `POST /api/buchung/angebot` (rechnet, schreibt nichts) → `POST /api/buchung/halten` (Batch: alte Holds löschen,
Hold + Tage einfügen; UNIQUE verhindert Doppelte) → `POST /api/buchung/abschliessen` (Batch: Kunde, Buchung, Hold→Buchung, Positionen,
Zahlungsplan, Verlauf – jede Anweisung prüft selbst, ob der Hold noch gültig ist) → Outbox → Versand bzw. Testmodus.
Details und alle Endpunkte: `docs/BUCHUNG.md`.

## Tests (tatsächlich gelaufen, 2026-11-26)
- **Vitest 77/77 grün** (37 bisherige + 40 neue): Preise (Beispiel 35 km = CHF 68, Zusatztage, Storno), Datum über Sommerzeit,
  Zahlungsplan, Webseite = Datenbank, Buchung A–Z, **50 gleichzeitige Versuche auf denselben Tag → genau 1 Gewinner**,
  überlappende Zeiträume ohne halbe Holds, abgelaufener Hold, doppelter Abschluss → 1 Buchung, Anfrage bestätigen/ablehnen mit Rechten,
  Protokoll, Kundentrennung im Portal, Link einmalig/abgelaufen, Mail-Drossel, Herkunft 403, Begrenzung 429, Turnstile in Produktion 403.
- **Playwright 70/70 grün** (Desktop + Handy, zweimal hintereinander): Buchung A–Z im echten `wrangler dev`, belegter Tag,
  Kalender, Konto, Anmeldelink ungültig, axe WCAG 2.2 AA ohne schwere Verstösse, kein horizontales Scrollen.
- Fotobox-Software (`../System/`) unverändert.

## Bildschirmfotos (`test-results/`)
`ansicht-{desktop,handy}-buchen.png`, `-bestaetigt.png`, `-verfuegbarkeit.png`, `-konto.png`, `-admin.png`.
Hinweis: Im Ganzseiten-Bildschirmfoto erscheint die fixierte Kopfzeile mitten im Bild – das ist eine Eigenheit des Fotos, nicht der Seite.

## Bekannte Lücken und Risiken
- **Postleitzahlen fehlen**: Produktiv ist `postal_codes` leer → jede Lieferung wird eine Anfrage mit offenem Fahrpreis (ehrlich, aber nicht ideal).
  Lösung: offizielles Ortschaftenverzeichnis (swisstopo, gratis) herunterladen und mit `tools/plz-import.mjs` importieren – **braucht deine Freigabe für den Download**.
  Lokal gibt es 5 Test-PLZ mit ungefähren Koordinaten (`tools/dev-plz.sql`, nur Entwicklung).
- Luftlinie × 1.3 kann von der echten Strasse abweichen (Berge, Seen) → deshalb «geschätzt» und massgebend ist die Bestätigung.
- Kundenseitige Stornierung im Portal fehlt (Absage per E-Mail); Bearbeiten von Buchungen im Admin folgt in Phase 4.
- Mails werden nach dem Buchungs-Batch eingereiht (nicht im selben Batch). Fällt genau dazwischen etwas aus, fehlt die Mail – die Buchung ist trotzdem korrekt und im Admin sichtbar.
- Der Anmeldelink steht als Text in der Outbox (nötig für den Versand); er ist 15 Min. gültig und einmalig.
- Kein Cron für Wiederholungen von fehlgeschlagenen Mails (Versand passiert direkt nach Buchung/Link-Anfrage). Cron-Trigger sind gratis, folgen bei Phase 7.
- AGB/Datenschutz sind noch Entwürfe; die Buchung speichert die AGB-Version «ENTWURF-2026-11».

## Entscheide, die ich getroffen habe (änderbar im Admin bzw. per Einstellung)
- Höchstens **7 Miettage** online, Buchung bis **550 Tage** im Voraus, frühestens **morgen** (kürzer als 7 Tage = Anfrage).
- Option «stornierbar» nur buchbar, wenn das Event **mehr als 28 Tage** entfernt ist.
- Anfragen **reservieren** den Termin bis zur Antwort.
- Buchungsnummern `FK-JJJJ-NNNN`.

## Nächster Schritt
1. Freigabe: PLZ-Verzeichnis herunterladen und importieren? 2. Sichtprüfung der Buchungsseiten (Bildschirmfotos).
3. Merge nach `main` (Tests grün). 4. Phase 4: Administration (Kalender, Kunden, Buchungen bearbeiten, Inhalte/Preise ohne Code).

## Drei Verständnisfragen
1. Warum kann die Fotobox nicht doppelt gebucht werden, selbst wenn zwei Personen in derselben Sekunde auf «reservieren» klicken?
2. Was passiert mit einem gehaltenen Termin, wenn jemand die Kontaktangaben nach 20 Minuten abschickt?
3. Warum wird eine Lieferung nach 3011 Bern zur Anfrage statt zur Direktbuchung, und was musst du dann im Admin tun?
