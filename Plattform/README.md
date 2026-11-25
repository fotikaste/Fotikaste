# Fotikaste-Plattform

Webseite, Direktbuchung, Kundenportal, Event-Galerien, Geräteverwaltung und Administration für die Fotobox-Vermietung.
Die Fotobox-Software liegt in `../System/` und funktioniert unabhängig von dieser Plattform. «Fotikaste» ist Arbeitsname.

**Stand 2026-11-25:** Phase 0 in Version 2 (Cloudflare, CHF 0/Monat). **Noch kein Code.** Entwicklung auf Branch `plattform/entwicklung`.
Fortschritt: [docs/PROGRESS.md](docs/PROGRESS.md)

## Dokumente
| Thema | Datei |
|---|---|
| Architektur v2 (Cloudflare), Anmeldung, Doppelbuchung, Verbrauchsschutz | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Kosten und Gratisgrenzen | [docs/COSTS.md](docs/COSTS.md) |
| Datenmodell D1 & ER-Diagramm | [docs/DATABASE.md](docs/DATABASE.md) |
| Sicherheitsanalyse und Migration der heutigen Online-Galerie | [docs/R2_MIGRATION.md](docs/R2_MIGRATION.md) |
| Markenprüfung | [docs/BRAND_CHECK.md](docs/BRAND_CHECK.md) |
| Wettbewerbsanalyse (11 Anbieter) | [docs/COMPETITOR_ANALYSIS.md](docs/COMPETITOR_ANALYSIS.md) |
| Designkonzepte Startseite | [design/startseite-konzepte.html](design/startseite-konzepte.html) |
| Roadmap · Entscheidungen · Sicherheit · API · Tests · Deployment · Glossar | [ROADMAP](docs/ROADMAP.md) · [DECISIONS](docs/DECISIONS.md) · [SECURITY](docs/SECURITY.md) · [API](docs/API.md) · [TESTING](docs/TESTING.md) · [DEPLOYMENT](docs/DEPLOYMENT.md) · [GLOSSARY](docs/GLOSSARY.md) |
| SEO · GEO · Local SEO · Keywords · Inhalte · Marketing | [SEO](docs/SEO.md) · [GEO](docs/GEO.md) · [LOCAL_SEO](docs/LOCAL_SEO.md) · [KEYWORD_STRATEGY](docs/KEYWORD_STRATEGY.md) · [CONTENT_STRATEGY](docs/CONTENT_STRATEGY.md) · [MARKETING](docs/MARKETING.md) |
| Erste Analyse (Version 1, teilweise überholt) | [docs/PHASE0_ANALYSE.md](docs/PHASE0_ANALYSE.md) |

## Entscheide D1–D9 (von dir, 2026-11-25) – Umsetzung
| # | Entscheid | Umgesetzt in |
|---|---|---|
| D1 | Arbeitsname Fotikaste, Name zentral änderbar, nichts kaufen/registrieren | `BRAND_CHECK.md`, `brand.ts` (Phase 1) |
| D2 | Variante A freigegeben → **durch Vorgabe CHF 0 überholt** (siehe E1) | `DECISIONS.md` ADR-009 |
| D3 | Direktbuchung Pflicht, 7 Tage Vorlauf konfigurierbar, kurzfristig per Anfrage | `DATABASE.md` (`delivery_zones`, Status `request`) |
| D4 | Administrierbares Liefergebiet (PLZ, Kantone, km, Kosten, Abholung, Vorlauf, Kapazität, Puffer) | `DATABASE.md` |
| D5 | Anzahlung/Rest/Kaution konfigurierbar, 30 % vorläufig | `payment_schedule`, `settings` |
| D6 | Schweiz, de-CH, CHF, FR/IT/EN vorbereitet | `ARCHITECTURE.md` §8 |
| D7 | KI-Suche erlaubt, KI-Training gesperrt, getrennt konfigurierbar | `DECISIONS.md` ADR-015, `GEO.md` |
| D8 | Node.js LTS ermitteln, erst nach Zustimmung installieren | unten «Vorbereitung Phase 1» |
| D9 | 0.15 CHF/Abzug vorläufig, keine MWST bis geklärt | `settings`, `COSTS.md` |

## Offene Entscheide (brauchen deine Antwort)
| # | Frage | Mein Vorschlag |
|---|---|---|
| E1 | Cloudflare-Architektur (CHF 0) bestätigt, Vercel/Supabase verworfen? Deine beiden Nachrichten widersprechen sich hier. | Ja, Cloudflare |
| E2 | Framework **Astro** statt Next.js? | Ja |
| E3 | Designkonzept A, B oder C (oder Mischung)? | C «Postkarte» mit der Ruhe von A |
| E4 | Online nur Web-Version, Originale auf Wunsch/USB-Stick? (hält R2 unter 10 GB) | Ja |
| E5 | Waren bisher nur Testbilder online (keine echten Gäste-QR-Codes)? | – deine Bestätigung – |
| E6 | Node.js **24 LTS** per winget installieren? | Ja |

## Vorbereitung Phase 1 (D8)
- **Node.js:** aktuelle LTS-Linien laut nodejs.org (Abruf 2026-11-25): **v26.13.1 «Lithium»** (Active LTS seit Okt. 2026) und **v24.22.3 «Krypton»** (Maintenance LTS).
  Empfehlung **Node 24** (am längsten erprobt mit Astro/Wrangler); Node 26 ist auch möglich.
- **Installation (nach deiner Zustimmung, systemweit):** in PowerShell `winget install --id OpenJS.NodeJS.24 -e`. Erwartet: «Erfolgreich installiert».
  Danach neues PowerShell-Fenster öffnen, `node -v` → `v24.22.3`, `npm -v` → `11.19.1`.
- **Weitere Werkzeuge:** Git ✅ vorhanden · VS Code ❌ (optional, empfohlen) · GitHub CLI ❌ (optional) · Wrangler, Astro, Vitest, Playwright werden **pro Projekt** installiert (kein Systemeingriff) · Playwright lädt einmalig Test-Browser (ca. 300 MB, Zustimmung).
- **Konten:** Cloudflare ✅ vorhanden. GitHub-Konto für privates Repository (falls nicht vorhanden; GitHub Desktop ist installiert). Resend erst in Phase 3.
- **Sofortmassnahme 0b (du, ca. 10 min):** R2-Token-Rechte prüfen, Lifecycle 30 Tage, Budgetwarnung USD 1 – Anleitung in `docs/R2_MIGRATION.md` Schritt 0.
