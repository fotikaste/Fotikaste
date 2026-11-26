# Fotikaste-Plattform – Projektregeln für Claude

Gilt für alles in `Plattform/`. Die Regeln in `../CLAUDE.md` gelten für die Fotobox-Software in `../System/`.

## Ziel
Vermietungs- und Verwaltungsplattform: öffentliche Webseite (SEO/GEO), Onlinebuchung mit Verfügbarkeit, Kundenportal (Magic Link),
private Event-Galerien, Geräte-API für die Fotobox, Admin, Rechnungen. Stand und nächste Schritte: `docs/PROGRESS.md`, `docs/ROADMAP.md`.

## Benutzer
Anfänger, Deutschschweiz. Auf Deutsch, verständlich, Fachbegriffe erklären (Was/Wozu/Wie/Wo) und in `docs/GLOSSARY.md` ergänzen.
Nach jeder Phase: Was, warum, wichtige Dateien, Zusammenspiel, selbst testen, Risiken, Entscheide, nächster Schritt + 3 Verständnisfragen.
Passwörter/Schlüssel gibt der Benutzer selbst ein.

## Technik (siehe docs/DECISIONS.md, ADR-009 ff.)
**Budget CHF 0/Monat** (nur Domain jährlich). Astro + TypeScript + Tailwind auf Cloudflare Workers (statische Assets) · D1 · R2 privat · Cloudflare Access (Admin) · Turnstile · Resend Free · GitHub Free · Vitest + Playwright.
Nie ohne Zustimmung aktivieren: Workers Paid, kostenpflichtige Tarife, Cloudflare Images. R2 ist die einzige verrechnete Ressource → App-Grenzen einhalten (`docs/COSTS.md`).
Markenname nur aus `src/config/brand.ts`. Sprache de-CH, Texte über Übersetzungsschlüssel (später fr/it/en).
Entwicklung auf Branch `plattform/entwicklung`, Merge nach `main` nur mit grünen Tests.
Geld in Rappen (integer). Zeit als ISO-8601-Text in UTC, Anzeige `Europe/Zurich`. Schweizer Schreibweise (CHF 1'250.00, «ss» statt «ß»).

## Verbindliche Regeln
- Nichts erfinden: keine Bewertungen, Kunden, Produktdaten, Zahlen, Suchvolumen. Unbekanntes = admin-pflegbares Feld oder «noch offen».
- Nie «getestet» melden ohne tatsächlichen Testlauf. Fortschritt ehrlich in `docs/PROGRESS.md`.
- Preise nur serverseitig berechnen; Buchungs-/Rechnungspositionen als Snapshot speichern; ausgestellte Rechnungen unveränderlich.
- D1 hat keine RLS: jede Abfrage im Worker mit Rollen-/Eigentümerprüfung über zentrale Funktionen, mit Tests. Doppelbuchung über `allocation_days` UNIQUE + `batch()`. robots/noindex ersetzen keinen Zugriffsschutz.
- Keine Geheimnisse im Code; nur `.dev.vars` lokal bzw. `wrangler secret` (nie in Git) und `.env.example` ohne Werte.
- E-Mails nur über Outbox mit `dedupe_key`; in Entwicklung `MAIL_TEST_MODE=true`.
- Keine echten Kundendaten in Entwicklung. Keine Veröffentlichung, Konten, Käufe, Einträge, Domain ohne Freigabe.
- Pi-Code (`../System/`) darf für die Integration erweitert werden (neue `Galerie`-Umsetzung), bestehende Funktionen und Tests bleiben erhalten; Offline-Fotografieren/Drucken muss immer funktionieren. **Die produktive Fotobox (Pi) nur nach ausdrücklicher Freigabe aktualisieren.**
- Keine Fernsteuerung/Befehlsausführung auf der Fotobox. Fotobox muss ohne Cloud voll funktionieren.
- Keine scheinbar funktionierende Zahlungsfunktion. MWST nur konfigurierbar, nie automatisch.
- Rechtstexte als «ENTWURF – nicht rechtlich geprüft» kennzeichnen.
- Commits nach abgeschlossenen Schritten, deutsche Commit-Nachrichten.

## Worker (ab Phase 2)
`worker/` läuft nur für `/api/*` und `/admin`. Jede Admin-Route mit `verlangeRecht(request, env, "<recht>")`. Schreibende Routen: Herkunftsprüfung ist zentral.
Neue Tabellen nur über neue Migrationsdatei in `migrations/` (nie bestehende ändern). Kostenrelevante Vorgänge vorher `istGesperrt()`/`reserviere()` prüfen.

## Befehle (im Ordner Plattform, Node 24 unter C:\Program Files
odejs)
- `npm run build` (astro check + tsc Worker + Build nach `dist/`) · `npm run dev:worker` (lokale D1 + Worker auf 8788, Admin unter /admin) · `npx wrangler dev --port 8788` (lokal wie Cloudflare)
- `npm test` (Vitest) · `npx playwright test` (Browser, Desktop + Handy, startet wrangler selbst; `PW_PORT=8792` = eigener frischer Server) · `npm run lighthouse` (braucht laufendes wrangler auf 8788)
- `npm run inhalte` (Inhalte aus lokaler D1 → `src/data/inhalte.json`; `build` macht das automatisch) · `node tools/webseite-dienst.mjs` (lokaler Dienst für «Webseite aktualisieren», Port 8790)
- Inhalte/Preise nie in `src/data/inhalte.json` von Hand ändern: Quelle ist D1 (Migrationen bzw. Admin), ADR-030.
- Private Pfade in `site.ts` mit Schrägstrich am Ende, wenn der Präfix sonst öffentliche Seiten trifft (Lehre: `/f` sperrte `/fotobox`).
