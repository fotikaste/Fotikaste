# Sicherheit und Datenschutz

Stand: 2026-11-25 · Status: Konzept. «✅» erst eintragen, wenn umgesetzt **und** getestet.

## Bedrohungen und Gegenmassnahmen
| Bedrohung | Massnahme | Status |
|---|---|---|
| Fremde Buchungen/Fotos ansehen | Jede Abfrage im Worker mit Rollen-/Eigentümerfilter (D1 hat keine RLS), zentrale Zugriffsfunktionen, Tests «Kunde A sieht B nicht» | geplant |
| Fotos erraten | Token ≥ 192 Bit Zufall, DB speichert nur SHA-256-Hash, Ablauf konfigurierbar | geplant |
| Öffentliche Foto-Links unbegrenzt gültig | Privater R2-Bucket, Download nur über vorsignierte Links (wenige Minuten) | geplant (heute: öffentlich r2.dev) |
| Gestohlene Fotobox | Geräte-Token widerrufbar, nur Upload ins zugewiesene Event, kein R2-Schlüssel auf dem Gerät | geplant |
| Preis-Manipulation | Browser sendet nur IDs; Preis serverseitig, als Snapshot gespeichert | geplant |
| Doppelbuchung | `allocation_days` UNIQUE + atomarer `batch()` + Hold mit Ablauf | geplant |
| Admin-Kontoübernahme | Cloudflare Access (nur deine E-Mail) mit Google/GitHub-Login **inkl. 2FA**, Access-Token-Prüfung im Worker, Audit-Log | geplant |
| Kartendaten | Cloudflare-Free-Bedingungen verbieten Kartendaten auf Free-Webseiten → nie Kartenfelder auf unserer Seite | Regel |
| Kostenfalle R2 | Harte Grenzen in der App, Verbrauchswarnungen, Budgetwarnung | geplant |
| XSS | Astro/React escapen Ausgaben; Admin-Texte als Markdown → bereinigtes HTML; Content-Security-Policy | geplant |
| SQL-Injection | Nur parametrisierte Abfragen (Query-Builder), kein String-Zusammensetzen | geplant |
| CSRF | Origin-/Referer-Prüfung bei allen schreibenden Anfragen; Cookies `SameSite=Lax`, `HttpOnly`, `Secure` | geplant |
| Spam-Buchungen | Rate Limit pro IP/E-Mail, Honeypot-Feld, optional Bestätigung per E-Mail-Link | geplant |
| Geheimnisse im Code | Nur Umgebungsvariablen, `.env.example` ohne Werte, Secret-Scan vor Commit | geplant |
| Unsichere Abhängigkeiten | `npm audit`, Dependabot, feste Versionen (Lockfile) | geplant |
| Datenverlust | D1 Time Travel 7 Tage + wöchentlicher Export, monatlicher **Wiederherstellungstest**, R2-Objekte versioniert | geplant |
| Indexierung privater Inhalte | Echte Zugriffskontrolle **plus** `noindex`, `X-Robots-Tag`, nicht in Sitemap | geplant |

## Datenschutz (revDSG, Schweiz)
- **Datenstandorte:** R2 mit EU-Jurisdiktion; D1-Standort nicht wählbar dokumentiert (offenlegen, vor Go-Live prüfen); Worker laufen weltweit am nächstgelegenen Standort; Resend versendet aus Irland, speichert Kontodaten/Logs in den USA (DPA mit Standardvertragsklauseln). Cloudflare und Resend als **Auftragsbearbeiter** in der Datenschutzerklärung.
- **Datenminimierung:** Buchung fragt nur, was für Lieferung und Rechnung nötig ist.
- **Gästefotos:** Hinweis an der Fotobox; Einzelfoto nur per Token; gemeinsame Galerie standardmässig aus; Veranstalter bestätigt beim Freigeben, dass Gäste informiert sind.
- **Rechte der Betroffenen:** Datenexport (JSON/CSV) und Löschung/Anonymisierung pro Kunde im Admin.
- **Rechtstexte** bleiben als «ENTWURF – nicht rechtlich geprüft» markiert, bis eine Fachperson sie geprüft hat.
- **DSGVO:** relevant, falls Kunden gezielt in der EU angesprochen werden – Entscheid D6.

## Regeln für die Entwicklung
Keine echten Kundendaten in Entwicklung/Test (nur Testdaten). Testmodus für E-Mails (Umleitung an eine Testadresse).
Keine Fernsteuerung oder Befehlsausführung auf der Fotobox über die Webseite.
