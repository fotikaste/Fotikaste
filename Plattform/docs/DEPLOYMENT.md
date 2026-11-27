# Veröffentlichung – Schritt für Schritt

Stand: 2026-11-26 (Phase 7). **Konten, Käufe, Schlüssel und Freigaben machst du selbst.** Ich erkläre jeden Schritt und führe Befehle nur mit deiner Zustimmung aus.
Budget: CHF 0 pro Monat, nur die Domain kostet jährlich. **Nie aktivieren:** Workers Paid, kostenpflichtige Tarife, Cloudflare Images.

## Überblick
```
GitHub (privat) ──Tests grün──► GitHub Actions ──► Cloudflare: Worker + statische Seiten + D1 + R2 (EU)
                                     ▲                         │
   Admin «Webseite aktualisieren» ───┘ (workflow_dispatch)      └── Cloudflare Access schützt /admin
```
Abläufe in `.github/workflows/`: `plattform.yml` (Tests, bei `main` veröffentlichen), `webseite.yml` (Webseite neu erzeugen), `sicherung.yml` (wöchentliche Datensicherung).

## A – GitHub (du)
1. GitHub-Konto mit **Zwei-Faktor-Anmeldung**. Neues **privates** Repository anlegen, z. B. `fotikaste`, leer (ohne README).
2. Mir die Adresse des Repositorys geben. Ich verbinde es und lade den Code hoch – **nur nach deinem OK**. `.dev.vars` und Laufzeitdaten sind ausgeschlossen (`.gitignore`).
3. Unter *Settings → Environments* eine Umgebung `produktion` anlegen und dort «Required reviewers» = du (jede Veröffentlichung braucht deinen Klick).

## B – Cloudflare (du, bestehendes Konto)
1. *Manage Account → Billing*: Budgetwarnung (z. B. USD 1) einrichten, prüfen, dass **kein** kostenpflichtiger Tarif aktiv ist.
2. Am Laptop `npx wrangler login` (du meldest dich im Browser an).
3. Mit deinem OK lege ich an (beides gratis):
   - `npx wrangler d1 create fotikaste --location weur` → die angezeigte `database_id` in `wrangler.jsonc` eintragen.
   - `npx wrangler r2 bucket create fotikaste-fotos --jurisdiction eu` (privat, **kein** r2.dev, keine öffentliche Domain).
4. **API-Token** für GitHub (*My Profile → API Tokens → Create Custom Token*), nur dieses Konto:
   Account · Workers Scripts: Edit · D1: Edit · Workers R2 Storage: Read · Account Settings: Read; Zone (deine Domain) · Workers Routes: Edit.
   In GitHub als Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## C – Domain (du)
1. `fotikaste.ch` bei einem Registrar deiner Wahl kaufen (Cloudflare verkauft keine .ch-Domains). Vorher nochmals prüfen, ob sie noch frei ist.
2. Domain zu Cloudflare hinzufügen (Free-Plan) und beim Registrar die Cloudflare-Nameserver eintragen.
3. Ich trage danach ein: `brand.siteUrl = "https://fotikaste.ch"` (`src/config/brand.ts`) und in `wrangler.jsonc`
   `"routes": [{ "pattern": "fotikaste.ch", "custom_domain": true }]` (www leitet Cloudflare per Regel auf die Hauptadresse um).

## D – Admin-Schutz: Cloudflare Access (du)
1. *Zero Trust* (Free, bis 50 Personen) → *Settings → Authentication*: Google als Anmeldung (dein Google-Konto mit 2FA).
2. *Access → Applications → Self-hosted*: Domain `fotikaste.ch`, Pfade `/admin` und `/api/admin/*`. Policy: **Allow**, Include = deine E-Mail-Adresse.
3. «Application Audience (AUD) Tag» und Team-Domain (`<team>.cloudflareaccess.com`) in `wrangler.jsonc` bei `ACCESS_AUD` / `ACCESS_TEAM_DOMAIN` eintragen (keine Geheimnisse).
4. Eigentümer in der echten Datenbank anlegen (mit deinem OK):
   `npx wrangler d1 execute DB --remote --command "INSERT INTO admin_users (email, role) VALUES ('<deine Google-Adresse>', 'owner')"`

## E – Bot-Schutz Turnstile (du)
Widget für `fotikaste.ch` anlegen. **Site Key** (öffentlich) steht direkt in den Workflows (`0x4AAAAAAGVYl_-nC8vY7FT4`). **Secret Key** → `npx wrangler secret put TURNSTILE_SECRET_KEY` (du tippst ihn ein).

## F – E-Mail: Resend (erledigt 2026-11-27)
1. Konto (Free: 100 Mails/Tag), Domain `fotikaste.ch` (Region EU, Irland) – **bestätigt**. DNS in Cloudflare: CNAME `send` und `rsend` (nur DNS, nicht «proxied»), TXT `resend._domainkey` (DKIM), TXT `_dmarc` = `v=DMARC1; p=none;` (später auf `p=quarantine` verschärfen, wenn alles sauber läuft). Klick-/Öffnungs-Tracking bewusst aus.
2. API-Key `fotikaste-worker` (nur «Sending access») → `npx wrangler secret put RESEND_API_KEY` ✔.
3. `MAIL_TEST_RECIPIENT` (deine Adresse) als Secret ✔. In `wrangler.jsonc` → `vars`: `MAIL_FROM` = `"Fotikaste <buchung@fotikaste.ch>"`, `MAIL_TEST_MODE` = `"true"` ✔. **Erst nach der Abnahme** `MAIL_TEST_MODE` auf `"false"`.
4. Mails empfangen (z. B. `info@fotikaste.ch`) ist noch nicht eingerichtet – später kostenlos über Cloudflare Email Routing.

## G – «Webseite aktualisieren» online (erledigt 2026-11-27)
1. Fine-grained Token `fotikaste-webseite-aktualisieren`: nur Repository `fotikaste/Fotikaste`, **Actions: Read and write**, sonst nichts. **Gültig bis 26.11.2027** – vorher neuen Token erstellen und Schritt 2 wiederholen.
2. `npx wrangler secret put REBUILD_SECRET` ✔.
3. `REBUILD_HOOK_URL` in `wrangler.jsonc` ✔: `https://api.github.com/repos/fotikaste/Fotikaste/actions/workflows/webseite.yml/dispatches`
4. Der Ablauf nutzt die Umgebung `produktion`: Nach jedem Klick auf «Webseite aktualisieren» bestätigst du den Lauf in GitHub (Actions → «Review deployments»). Das ist Absicht: Nichts geht ohne dich online.

## H – Erste Veröffentlichung und Abnahme
1. Push auf `main` → Tests → du bestätigst in GitHub die Umgebung `produktion` → Migrationen, Inhalte, Veröffentlichung.
   Der Ablauf bricht ab, solange `database_id` oder `ACCESS_AUD` fehlen oder `ENVIRONMENT` nicht `production` ist.
2. Prüfen: `/admin` verlangt Google-Anmeldung · Testbuchung (Mails gehen nur an dich) · Kalender · Kundenkonto · «Webseite aktualisieren».
3. Rechtstexte vervollständigen (Impressum: Name, Adresse, Kontakt in `brand.ts`; offene Punkte in AGB/Datenschutz) und **fachlich prüfen lassen**.
4. Go-Live: `MAIL_TEST_MODE = "false"`, Testdaten löschen, Fusszeile «Entwicklungsversion» entfernen, fertige Seiten auf `indexable: true`.
5. Google Search Console und Bing Webmaster: Domain bestätigen (DNS-Eintrag), Sitemap `https://fotikaste.ch/sitemap.xml` einreichen.
6. Danach Fotobox umstellen (`R2_MIGRATION.md`, Schritte 4–7) – nur nach deiner ausdrücklichen Freigabe.

## Datensicherung und Wiederherstellung
- **Automatisch:** wöchentlich (Montag) Export der Datenbank als Datei in GitHub (90 Tage) + Cloudflare D1 Time Travel (letzte Tage, auf die Minute).
- **Probe:** `npm run sicherung:test` spielt einen Export in eine leere Datenbank und vergleicht alle Tabellen (lokal geprüft 2026-11-26: 33 Tabellen identisch).
  Mit einer heruntergeladenen Sicherung: entpacken, `node tools/sicherung-test.mjs sicherung-JJJJ-MM-TT.sql`. Einmal pro Monat empfohlen.
- **Ernstfall:** Zeitpunkt wählen → `npx wrangler d1 time-travel restore DB --timestamp <Zeit>` (letzte Tage) oder neue Datenbank anlegen und Sicherungsdatei einspielen.
- **Nicht gesichert:** Fotos (bewusst – sie sind nur 30 Tage online, Originale bleiben auf der Fotobox).

## Geheimnisse – wo was liegt
| Name | Wo | Wer setzt |
|---|---|---|
| `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `REBUILD_SECRET`, `MAIL_TEST_RECIPIENT` | `wrangler secret put` (verschlüsselt bei Cloudflare) | du |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub Secrets | du |
| `PUBLIC_TURNSTILE_SITE_KEY` | GitHub Variables (öffentlich) | du |
| `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`, `MAIL_FROM`, `REBUILD_HOOK_URL`, `database_id` | `wrangler.jsonc` (keine Geheimnisse) | ich, mit deinen Werten |
| lokal: `.dev.vars` | nur am Laptop, nie in Git | – |
