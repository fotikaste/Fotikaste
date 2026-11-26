# Phase 2 – Bericht (Datenbank und Sicherheit)

Stand: 2026-11-26 · Branch `plattform/entwicklung` → `main` · nur lokal, nichts veröffentlicht, kein Konto eingerichtet.

## Entscheide (vom Benutzer, 2026-11-25)
1. Nur lokal entwickeln, echte Einrichtung in Phase 7. 2. Admin-Login mit Google (2FA). 3. Nur der Inhaber als Eigentümer.
4. Das bestehende Cloudflare-Konto wird ausschliesslich für Fotikaste genutzt → kein zweites Konto nötig.

## Was wurde entwickelt?
- **Worker** (`worker/`): läuft nur für `/api/*` und `/admin` (`run_worker_first`). Öffentliche Seiten bleiben statisch und kostenlos.
- **D1-Datenbank**, Migration `migrations/0001_grundlage.sql`: Admin-Konten, unveränderliches Protokoll (Trigger verhindern Ändern/Löschen),
  Einstellungen (8 GB, 50/75/90 %, 0.15 CHF/Abzug, keine MWST, 100 % vor dem Event, 30 Tage …), Verbrauchszähler, Speicherbudget,
  Speicherreservierungen, Anfragebegrenzung.
- **Admin-Anmeldung über Cloudflare Access**: Der Worker prüft das signierte Ticket (JWT, RS256) selbst mit WebCrypto – Signatur,
  Aussteller, Zielgruppe, Ablauf. Ohne Konfiguration wird alles abgelehnt («fail closed»). Kein Zusatzpaket.
- **Rollen** Eigentümer / Administrator / Mitarbeiter mit Rechte-Matrix (`worker/lib/permissions.ts`), Prüfung bei jeder Anfrage.
- **Protokoll** jeder verweigerten Anfrage und jeder Einstellungsänderung (alt → neu).
- **Kostenkontrolle**: Zähler für R2-Vorgänge und E-Mails, Warnstufen 50/75/90 %, Sperre ab 90 %; Werte, die nur Cloudflare messen kann,
  werden als «nicht verfügbar» gezeigt statt geschätzt. **Speicherreservierung** in einer atomaren D1-Transaktion.
- **Anfragebegrenzung** (für Magic Links ab Phase 3) und **Turnstile-Prüfung** (Bot-Schutz, ab Phase 3 in Formularen).
- **Schutz**: CSRF-Prüfung (Herkunft) bei schreibenden Anfragen, sichere Header, `noindex` und `no-store` für Admin/API, escaped HTML.
- **Admin-Seite** `/admin` mit Fotospeicher, Gratiskontingenten, Herkunft der Werte und Warnungen.
- **Entwicklungs-Abkürzung** zum lokalen Testen: wirkt nur, wenn ENVIRONMENT=development **und** Aufruf über localhost **und** DEV_ADMIN_EMAIL gesetzt.
  In `wrangler.jsonc` ist ENVIRONMENT fest «production»; `*.workers.dev` und Vorschau-Adressen sind ausgeschaltet.

## Testergebnisse (2026-11-26, tatsächlich ausgeführt)
| Test | Ergebnis |
|---|---|
| Typprüfung Webseite (`astro check`) und Worker (`tsc -p worker`) | 0 Fehler |
| Vitest: Access-JWT (gültig, falsche Zielgruppe/Aussteller, abgelaufen, gefälschte Signatur, `alg: none`, fremder Schlüssel, fehlende Konfiguration, keine Testschlüssel in Produktion), Entwicklungs-Abkürzung nur lokal, Rechte aller Rollen, inaktive/unbekannte Konten + Protokoll, Einstellungen (Prüfung, Protokoll alt→neu, unbekannte Schlüssel), CSRF, Protokoll unveränderlich, **20 gleichzeitige Uploads → genau 9 innerhalb der Grenze**, zu grosse Datei abgelehnt, Freigabe/Ablauf, Warnstufen 50/75/90, Sperre ab 90 %, keine erfundenen Cloudflare-Werte, Anfragebegrenzung, Turnstile | **37/37 grün** |
| Playwright (echter lokaler Cloudflare-Server, Desktop + Handy): alle öffentlichen Seiten wie Phase 1, Admin-Seite, Admin-API, CSRF, Barrierefreiheit Admin | **56/56 grün** |
| Fotobox-Software | unverändert, Tests grün |

## Wichtige Dateien
`worker/index.ts` (Routen) · `worker/lib/access.ts` (Access-Prüfung) · `worker/lib/auth.ts` (Konto + Recht) · `worker/lib/permissions.ts` ·
`worker/lib/usage.ts` (Verbrauch, Speicher) · `worker/lib/ratelimit.ts` · `worker/lib/turnstile.ts` · `worker/admin/` ·
`migrations/0001_grundlage.sql` · `wrangler.jsonc` · `tests/worker/` · `tests/e2e/admin.spec.ts`

## Selbst testen
Im Ordner `Plattform` (PowerShell): `npm run build`, dann `npm run dev:worker` → `http://localhost:8788/admin`.
`npm test` → 37 bestanden · `npx playwright test` → 56 bestanden.

## Offene Risiken
- Die echte Cloudflare-Access-Anmeldung kann erst mit eigener Domain getestet werden (Phase 7). Bis dahin ist sie nur mit Testschlüsseln geprüft.
- Kontoweite Cloudflare-Werte (Worker-Aufrufe, D1-Zeilen) werden erst nach der Veröffentlichung über die Cloudflare-Auswertung ergänzt.
- R2 bleibt die einzige Kostenquelle ohne harte Sperre bei Cloudflare – die App-Grenzen greifen erst, wenn die Geräte-API (Phase 5) sie nutzt.
- Lokale D1 (Miniflare) verhält sich wie D1, ist aber nicht identisch; Gleichzeitigkeit wird in Phase 7 nochmals gegen die echte D1 geprüft.

## Einrichtung in Phase 7 (du, mit Anleitung)
Zero Trust (Free) → Access-Anwendung für `/admin*` und `/api/admin/*` → Regel «nur deine E-Mail» → Anmeldung mit Google (2FA aktiv) →
Team-Domain und AUD-Tag als Variablen setzen → dein Eigentümer-Konto per Befehl in die echte D1 eintragen.
