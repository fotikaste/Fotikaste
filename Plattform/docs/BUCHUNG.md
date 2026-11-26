# Buchung – Technik und Bedienung

Stand: 2026-11-26 (Phase 3). Code: `worker/lib/buchung.ts`, `preis.ts`, `kunde.ts`, `mail.ts`, `worker/routen/oeffentlich.ts`, `worker/admin/buchungen.ts`.

## Öffentliche Endpunkte
| Methode | Pfad | Zweck | Schutz |
|---|---|---|---|
| GET | `/api/verfuegbarkeit?von=&bis=` | belegte Fotobox-Tage (max. 93 Tage), ohne Personendaten | 300/h pro IP |
| POST | `/api/buchung/angebot` | Preis + Verfügbarkeit + Direkt/Anfrage, schreibt nichts | 120/h |
| POST | `/api/buchung/halten` | `{wahl, turnstile}` → `{halteId, gueltigBis, angebot}` (201) oder 409 belegt | 10/h, Turnstile |
| POST | `/api/buchung/freigeben` | `{halteId}` gibt einen Hold frei | – |
| POST | `/api/buchung/abschliessen` | `{halteId, kontakt}` → `{nummer, status}` (201) oder 409 abgelaufen | 10/h |
| POST | `/api/konto/link` | `{email, turnstile}` → immer gleiche Antwort | 20/h pro IP, 5/h pro Adresse, Turnstile |
| POST | `/api/konto/anmelden` | `{token}` → Sitzungscookie | 30/h |
| GET | `/api/konto/buchungen` | nur eigene Buchungen | Sitzung |
| POST | `/api/konto/abmelden` | Sitzung widerrufen | – |

Admin (Cloudflare Access + Recht): `GET /api/admin/buchungen` (`bookings:read`), `POST /api/admin/buchungen/{id}/bestaetigen` `{fahrtRappen?}`
und `/ablehnen` (`bookings:write`); dieselben Aktionen als Formular unter `/admin/buchungen/{id}/…`.

## Einstellungen (Tabelle `settings`)
`booking_included_days` 2 · `booking_extra_day_rappen` 4500 · `booking_max_days` 7 · `booking_horizon_days` 550 · `booking_min_lead_days` 7 ·
`booking_hold_minutes` 15 · `flex_cancel_rappen` 2000 · `flex_cancel_days` 28 · `delivery_origin_plz` "8370" · `delivery_detour_factor` 1.3 ·
`deposit_percent` 0 · `security_deposit_rappen` 0 · `payment_due_days_before` null (= nach Absprache) · `terms_version` · `mail_daily_limit` 80.
Die Bearbeitung im Admin folgt in Phase 4; bis dahin per Migration.

## Postleitzahlen
Enthalten in Migration `0003_postleitzahlen.sql` (amtliches Ortschaftenverzeichnis, swisstopo, Stand 2026-11-01, 3190 PLZ, je Hauptort:
Zusatzziffer 00, grösster Adressenanteil). Aktualisieren (Download nur nach Freigabe):
1. `ortschaftenverzeichnis_plz_4326.csv.zip` von data.geo.admin.ch (WGS84) herunterladen und entpacken.
2. `node tools/plz-import.mjs AMTOVZ_CSV_WGS84.csv` – prüft, dass alle Koordinaten in der Schweiz liegen.
3. Ausgabe als **neue** Migration ablegen (nie die alte ändern). Quellenangabe «swisstopo» im Impressum.

## E-Mail
Ohne `MAIL_TEST_MODE=false` geht nie eine Mail an Kunden. Mit `RESEND_API_KEY`, `MAIL_FROM` und `MAIL_TEST_RECIPIENT` gehen Testmails an diese eine Adresse
(Betreff «[TEST an …]»). Ohne Schlüssel: Status «zurückgehalten». Schlüssel gibst du selbst mit `wrangler secret put` ein.

## Turnstile
Öffentlicher Schlüssel als `PUBLIC_TURNSTILE_SITE_KEY` beim Build, geheimer Schlüssel als Secret `TURNSTILE_SECRET_KEY`.
Ohne geheimen Schlüssel: lokal (localhost + development) und in Tests übersprungen, in Produktion wird jede Reservierung abgelehnt.
