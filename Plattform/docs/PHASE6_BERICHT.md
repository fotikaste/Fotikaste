# Phase 6 – Bericht (Zahlung persönlich, Wirtschaftlichkeit)

Stand: 2026-11-26 · Branch `plattform/entwicklung` · nur lokal.

## Entscheid (Inhaber, 2026-11-26) → ADR-032
**Keine Zahlungsfunktion.** Die Plattform kennt keine Bankdaten, erstellt keine Rechnungen, verschickt keine Erinnerungen und verlangt weder Anzahlung noch Kaution.
Die Zahlung vereinbarst du immer persönlich. Die Plattform hält nur fest, was du selbst einträgst, und rechnet damit die Wirtschaftlichkeit.

Einschätzung: Der Entscheid ist sicherheitstechnisch richtig. Daten, die nicht gespeichert sind, können nicht gestohlen werden, es gibt keine Zahlungsanbieter-Pflichten und keine Fehlbuchungen.
Hinweis (keine Rechtsberatung): Als Selbständiger musst du Einnahmen und Ausgaben aufzeichnen und Belege aufbewahren (in der Regel 10 Jahre). Der CSV-Export hilft dabei, ersetzt aber keine Abklärung mit der Treuhand.

## Was wurde geändert und entwickelt?
**Entfernt:** Zahlungsplan (Anzahlung, Restbetrag, Kaution, Fälligkeit), die Einstellungen dazu und die Zahlungszeilen in Mails und Kundenkonto.
Mails und Kundenkonto sagen jetzt: «Online wird nichts bezahlt. Wir melden uns persönlich bei Ihnen, um die Zahlung zu vereinbaren.»
Hast du die Zahlung vollständig erfasst, zeigt das Kundenkonto «Zahlung erhalten – vielen Dank». Bisher als bezahlt markierte Zeilen wurden übernommen (Migration 0006).

**Neu, nur für den Eigentümer:**
| Bereich | Wo | Inhalt |
|---|---|---|
| Zahlungseingang | Buchungsdetail | Datum, Betrag (Rückerstattung mit Minus), Art (bar, Twint, Überweisung, andere), Notiz; Anzeige «bezahlt» bzw. «offen CHF …»; löschen möglich, alles protokolliert |
| Aufwand | Buchungsdetail | gedruckte Abzüge, gefahrene km (mit Schätzhilfe aus der Buchung), Stunden, Notiz |
| Finanzen | `/admin/finanzen` | Jahresrechnung, pro Buchung, Ausgaben, Anschaffungen, Fixkosten, CSV |
| Kosten-Ansätze | Einstellungen | Material pro Abzug (vorläufig CHF 0.15), Fahrzeugkosten pro km und eigener Stundenansatz (**leer, bis du sie festlegst**) |

**Wirtschaftlichkeit pro Jahr**
- Gebucht, eingenommen (laut erfassten Zahlungen) und noch offen (vergangene Events).
- Kosten: Material, Ausgaben nach Kategorie, Fixkosten (anteilig nach Tagen) und Abschreibung (linear in ganzen Jahren).
- **Ergebnis (Geld)**, dann zusätzlich minus Fahrzeug und eigene Arbeit → **Ergebnis nach Lohn und Fahrzeug**.
- **Effektiver Stundenlohn** und **Break-even** (wie viele Buchungen pro Jahr nötig sind, um Fixkosten, Abschreibung und allgemeine Ausgaben zu decken).
- Pro Buchung: Umsatz, bezahlt, Material, direkte Ausgaben, Fahrzeug, **Deckungsbeitrag**, Stunden, Deckungsbeitrag pro Stunde.
- Hinweise, wenn bei vergangenen Buchungen der Aufwand fehlt oder ein Ansatz noch offen ist. Fehlende Werte werden **nie geschätzt**.
- **CSV für Treuhand/Steuern**: Einnahmen und Ausgaben des Jahres. Excel öffnet die Datei mit korrekten Umlauten, und Formel-Angriffe über Textfelder sind abgefangen.

## Tests (tatsächlich gelaufen)
- **Vitest 120/120**: Rechnungslogik (Abschreibung, Fixkosten anteilig, Deckungsbeitrag, Break-even, offene Ansätze, CSV-Schutz),
  nur der Eigentümer sieht Finanzen und Zahlungseingang, Prüfung der Eingaben, Protokoll, Auswertung mit erfassten Werten, CSV-Inhalt,
  alte Zahlungsplan-Tabelle entfernt, Mails ohne Zahlungsdaten.
- **Playwright 76/76** (Desktop + Handy): alle Admin-Seiten inkl. Finanzen, Events und Geräte barrierefrei und ohne horizontales Scrollen.
- Bildschirmfotos: `test-results/admin-{desktop,handy}-admin-finanzen.png`.

## Offene Punkte
- **Stundenansatz und km-Ansatz** musst du selbst festlegen (Einstellungen → Kosten-Ansätze). Ohne sie bleiben die kalkulatorischen Werte leer.
- Die Druckkosten von CHF 0.15 pro Abzug sind vorläufig. Bitte mit echten Einkaufspreisen prüfen.
- Belege werden nicht hochgeladen, nur der Ablageort wird vermerkt (spart Speicher). Ein Hochladen kann später kommen.
- Die Abschreibung rechnet in ganzen Jahren ab dem Kaufjahr (vereinfachte Methode). Ob das für die Steuern passt, klärst du mit der Treuhand.

## Nächster Schritt
Sichtprüfung `/admin/finanzen`, Ansätze eintragen, Merge nach `main`, dann Phase 7 (Veröffentlichung).

## Drei Verständnisfragen
1. Warum ist «eingenommen 2027» nicht dasselbe wie «gebucht 2027»?
2. Was sagt der Deckungsbeitrag einer Buchung aus, und was muss er noch alles bezahlen?
3. Warum zeigt die Übersicht «Ansatz offen», statt einfach einen üblichen km-Preis einzusetzen?
