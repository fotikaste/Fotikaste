# Phase 4 – Bericht (Administration)

Stand: 2026-11-26 · Branch `plattform/entwicklung` · nur lokal, nichts veröffentlicht.

## Entscheid (vom Benutzer, 2026-11-26)
Inhalte und Preise werden im Admin gepflegt und landen in der Datenbank. Die öffentlichen Seiten bleiben **statisch** (gratis, schnell, gut für Google)
und werden per Knopf **«Webseite aktualisieren»** neu erzeugt → ADR-030.

## Was wurde entwickelt?
Alle Admin-Seiten werden im Worker als HTML erzeugt, **ohne JavaScript**. Formulare senden per POST, danach geht es zurück auf die Seite mit einer kurzen Meldung.
| Bereich | Adresse | Wer | Inhalt |
|---|---|---|---|
| Übersicht | `/admin` | alle | Kennzahlen (Anfragen, Events 30 Tage, Buchungen/Volumen des Jahres), «Zu erledigen», offene Anfragen mit Knöpfen, nächste Events, E-Mail-Ausgang, Fotospeicher/Kontingente |
| Buchungen | `/admin/buchungen` | alle | Suche (Nummer/Name/E-Mail), Filter Status/Zeitraum, Detail: bestätigen/ablehnen, stornieren (Tage frei, Mail optional), abschliessen, **Termin ändern** (atomar), Positionen/Rabatt, Zahlung bezahlt/offen, Kontakt korrigieren, Notizen, Verlauf |
| Kalender | `/admin/kalender` | alle | Monatsansicht mit Buchungen, Anfragen, Reservierungen, Sperren; **Tage sperren** (Ferien/Wartung, Fotobox oder nur Lieferung) und aufheben |
| Kunden | `/admin/kunden` | alle | Liste mit Anzahl Buchungen, letztem Event, Umsatz (nur Eigentümer); Detail mit Buchungen und internen Notizen |
| Preise | `/admin/preise` | Eigentümer | Pakete (Name, Preis, Abzüge, sichtbar), Konditionen (Zusatztag, Storno-Option, Vorlauf, Ausgangsort …), **Liefergebiete** (Kantone, PLZ-Bereiche, km-Preise, Vorlauf, Puffer, Sofortbuchung) |
| Inhalte | `/admin/inhalte` | Eigentümer, Administrator | **FAQ** mit Platzhaltern wie `{preis:premium}` (bleiben bei Preisänderungen automatisch richtig), Paketleistungen, technische Angaben (leer = «folgt»), **Webseite aktualisieren** mit Stand-Anzeige |
| Einstellungen | `/admin/einstellungen` | Eigentümer | Zahlungsplan (Anzahlung %, Kaution, Frist), AGB-Version, MWST-Schalter, Speicher-/Warngrenzen, Mail-Limit |

**Webseite aktualisieren:** `tools/inhalte-export.mjs` liest die Inhalte aus D1 und schreibt `src/data/inhalte.json`, danach `astro build`.
Der Admin-Knopf ruft dafür einen Dienst auf: lokal `tools/webseite-dienst.mjs` (nur 127.0.0.1, mit geheimem Schlüssel), online ab Phase 7 GitHub Actions.
«Webseite erzeugt» wird erst **nach** erfolgreichem Bauen gesetzt. Neu: `npm run build` holt die Inhalte zuerst aus der lokalen Datenbank.

**Migration 0004:** `package_features`, `faqs`, `product_facts`, `customer_notes`, Bemerkung bei Sperren, Zeitstempel für den Webseiten-Stand.
Startwerte = bisherige Inhalte (nichts Neues erfunden).

## Wie spielt es zusammen?
Admin-Formular → `worker/routen/admin.ts` (Recht prüfen) → Funktion in `worker/admin/*.ts` (prüfen, `batch()`, Verlauf, Protokoll) → 303 zurück.
Preisänderung → gilt sofort für neue Angebote · bestehende Buchungen unverändert (Snapshot) · Übersicht meldet «Webseite zeigt noch den alten Stand» → Knopf.

## Tests (tatsächlich gelaufen, 2026-11-26)
- **Vitest 96/96 grün** (79 bisherige + 17 neue): Rechte je Rolle (Mitarbeiter/Admin/Eigentümer, 401/403, fremde Herkunft), escaped Ausgabe
  (`<script>` im Namen), Storno gibt Tage frei + Mail genau einmal, **Termin verschieben bei Konflikt ändert nichts**, Positionen/Rabatt/Total/Zahlungsplan
  (nach Zahlung kein Neuberechnen), Kontakt + Verlauf, Kalender-Sperre blockiert Buchung, Sperre über bestehende Buchung abgelehnt, Kunden + Notizen,
  Paketpreis neu ≠ alte Buchung, Konditionen-Prüfung, neue Zone, FAQ-Platzhalter, Leistungen, technische Angaben, Aktualisieren-Aufruf mit Schlüssel,
  **inhalte.json = Datenbank nach Migrationen**.
- **Playwright 74/74 grün** (Desktop + Handy): alle 7 Admin-Seiten barrierefrei (axe WCAG 2.2 AA) ohne horizontales Scrollen, Buchung suchen/öffnen/Notiz/stornieren.
- **Von Hand geprüft** (lokal): FAQ geändert → Übersicht meldet «alter Stand» → Knopf → öffentliche FAQ nach **4 s** neu, Admin meldet «aktuell» → zurückgesetzt.

## Bildschirmfotos (`test-results/`)
`admin-{desktop,handy}-admin.png`, `-admin-buchungen.png`, `-admin-kalender.png`, `-admin-kunden.png`, `-admin-preise.png`, `-admin-inhalte.png`,
`-admin-einstellungen.png`, `-buchungsdetail.png`.

## Bekannte Lücken und Risiken
- **Online** funktioniert «Webseite aktualisieren» erst ab Phase 7 (GitHub Actions + Schlüssel, den du selbst einträgst). Bis dahin ist der Knopf online ausgegraut.
- Termin ändern passt den Preis nicht automatisch an (Zusatztage als Position ergänzen) – bewusst, damit kein Betrag ungewollt ändert.
- Rechnungen, Gutschriften, CSV folgen in Phase 6. Eine Kunden-Löschung (Datenschutz-Anfrage) gibt es noch nicht.
- Ein älterer lokaler Server (`npm run dev:worker`) lief während der Arbeit weiter. Er kennt die neuen `.dev.vars`-Werte erst nach einem Neustart.
- Texte der Start-/Anlassseiten (Ablauf, Vorteile, Anlässe, Regionen) sind weiterhin im Code (`src/data/content.ts`).

## Nächster Schritt
Sichtprüfung im Admin (`npm run dev:worker` neu starten, dazu `node tools/webseite-dienst.mjs`), Merge nach `main`, dann Phase 5 (Fotobox-Integration).

## Drei Verständnisfragen
1. Du änderst den Preis von Premium. Was passiert mit einer Buchung von letzter Woche, und was mit der Preisseite?
2. Warum schreibst du in einer FAQ-Antwort `{preis:premium}` statt «CHF 450.–»?
3. Du willst eine Buchung um einen Tag verschieben, aber der neue Tag ist schon belegt. Was passiert?
