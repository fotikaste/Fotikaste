# Fotikaste-Plattform – Projektregeln für Claude

Gilt für alles in `Plattform/`. Die Regeln in `../CLAUDE.md` gelten für die Fotobox-Software in `../System/`.

## Ziel
Vermietungs- und Verwaltungsplattform: öffentliche Webseite (SEO/GEO), Onlinebuchung mit Verfügbarkeit, Kundenportal (Magic Link),
private Event-Galerien, Geräte-API für die Fotobox, Admin, Rechnungen. Stand und nächste Schritte: `docs/PROGRESS.md`, `docs/ROADMAP.md`.

## Benutzer
Anfänger, Deutschschweiz. Auf Deutsch, verständlich, Fachbegriffe erklären (Was/Wozu/Wie/Wo) und in `docs/GLOSSARY.md` ergänzen.
Nach jeder Phase: Was, warum, wichtige Dateien, Zusammenspiel, selbst testen, Risiken, Entscheide, nächster Schritt + 3 Verständnisfragen.
Passwörter/Schlüssel gibt der Benutzer selbst ein.

## Technik (vorgeschlagen, siehe docs/DECISIONS.md)
Next.js + TypeScript + Tailwind · Supabase Postgres + Auth (EU) · Cloudflare R2 privat · Resend · Vercel (EU) · Vitest + Playwright.
Geld in Rappen (integer). Zeit `timestamptz` UTC, Anzeige `Europe/Zurich`. Schweizer Schreibweise (CHF 1'250.00, «ss» statt «ß»).

## Verbindliche Regeln
- Nichts erfinden: keine Bewertungen, Kunden, Produktdaten, Zahlen, Suchvolumen. Unbekanntes = admin-pflegbares Feld oder «noch offen».
- Nie «getestet» melden ohne tatsächlichen Testlauf. Fortschritt ehrlich in `docs/PROGRESS.md`.
- Preise nur serverseitig berechnen; Buchungs-/Rechnungspositionen als Snapshot speichern; ausgestellte Rechnungen unveränderlich.
- Doppelbuchungen über DB-Ausschlussregel verhindern (`resource_allocations`).
- RLS auf jeder Tabelle, mit Tests. Berechtigung immer serverseitig prüfen. robots/noindex ersetzen keinen Zugriffsschutz.
- Keine Geheimnisse im Code; nur `.env.local` (nicht in Git) und `.env.example` ohne Werte.
- E-Mails nur über Outbox mit `dedupe_key`; in Entwicklung `MAIL_TEST_MODE=true`.
- Keine echten Kundendaten in Entwicklung. Keine Veröffentlichung, Konten, Käufe, Einträge, Domain ohne Freigabe.
- **Pi-Code (`../System/`) nur nach ausdrücklicher Freigabe ändern**; Anbindung nur über eine neue `Galerie`-Umsetzung.
- Keine Fernsteuerung/Befehlsausführung auf der Fotobox. Fotobox muss ohne Cloud voll funktionieren.
- Keine scheinbar funktionierende Zahlungsfunktion. MWST nur konfigurierbar, nie automatisch.
- Rechtstexte als «ENTWURF – nicht rechtlich geprüft» kennzeichnen.
- Commits nach abgeschlossenen Schritten, deutsche Commit-Nachrichten.
