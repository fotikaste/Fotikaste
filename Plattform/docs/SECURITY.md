# Sicherheit und Datenschutz

Stand: 2026-11-25 · Status: Konzept. «✅» erst eintragen, wenn umgesetzt **und** getestet.

## Bedrohungen und Gegenmassnahmen
| Bedrohung | Massnahme | Status |
|---|---|---|
| Fremde Buchungen/Fotos ansehen | Serverseitige Berechtigung + Row Level Security, Tests «Kunde A sieht B nicht» | geplant |
| Fotos erraten | Token ≥ 192 Bit Zufall, DB speichert nur SHA-256-Hash, Ablauf konfigurierbar | geplant |
| Öffentliche Foto-Links unbegrenzt gültig | Privater R2-Bucket, Download nur über vorsignierte Links (wenige Minuten) | geplant (heute: öffentlich r2.dev) |
| Gestohlene Fotobox | Geräte-Token widerrufbar, nur Upload ins zugewiesene Event, kein R2-Schlüssel auf dem Gerät | geplant |
| Preis-Manipulation | Browser sendet nur IDs; Preis serverseitig, als Snapshot gespeichert | geplant |
| Doppelbuchung | Ausschlussregel in Postgres + Transaktion + Hold mit Ablauf | geplant |
| Admin-Kontoübernahme | Starke Passwörter/Passkey, **TOTP-2FA Pflicht**, Rate Limiting, Audit-Log | geplant |
| XSS | React escaped Ausgaben; Admin-Texte als Markdown → bereinigtes HTML; Content-Security-Policy | geplant |
| SQL-Injection | Nur parametrisierte Abfragen (Query-Builder), kein String-Zusammensetzen | geplant |
| CSRF | Server Actions mit Origin-Prüfung; Cookies `SameSite=Lax`, `HttpOnly`, `Secure` | geplant |
| Spam-Buchungen | Rate Limit pro IP/E-Mail, Honeypot-Feld, optional Bestätigung per E-Mail-Link | geplant |
| Geheimnisse im Code | Nur Umgebungsvariablen, `.env.example` ohne Werte, Secret-Scan vor Commit | geplant |
| Unsichere Abhängigkeiten | `npm audit`, Dependabot, feste Versionen (Lockfile) | geplant |
| Datenverlust | Tägliche Backups (Supabase Pro), monatlicher **Wiederherstellungstest**, R2-Objekte versioniert | geplant |
| Indexierung privater Inhalte | Echte Zugriffskontrolle **plus** `noindex`, `X-Robots-Tag`, nicht in Sitemap | geplant |

## Datenschutz (revDSG, Schweiz)
- **Datenstandorte:** DB und Auth in EU-Region (Supabase, Frankfurt; Zürich-Region prüfen), Vercel-Funktionen in Frankfurt, R2 mit EU-Jurisdiktion, Resend EU-Region (prüfen). Liste der **Auftragsbearbeiter** in der Datenschutzerklärung.
- **Datenminimierung:** Buchung fragt nur, was für Lieferung und Rechnung nötig ist.
- **Gästefotos:** Hinweis an der Fotobox; Einzelfoto nur per Token; gemeinsame Galerie standardmässig aus; Veranstalter bestätigt beim Freigeben, dass Gäste informiert sind.
- **Rechte der Betroffenen:** Datenexport (JSON/CSV) und Löschung/Anonymisierung pro Kunde im Admin.
- **Rechtstexte** bleiben als «ENTWURF – nicht rechtlich geprüft» markiert, bis eine Fachperson sie geprüft hat.
- **DSGVO:** relevant, falls Kunden gezielt in der EU angesprochen werden – Entscheid D6.

## Regeln für die Entwicklung
Keine echten Kundendaten in Entwicklung/Test (nur Testdaten). Testmodus für E-Mails (Umleitung an eine Testadresse).
Keine Fernsteuerung oder Befehlsausführung auf der Fotobox über die Webseite.
