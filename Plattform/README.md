# Fotikaste-Plattform

Webseite, Onlinebuchung, Kundenportal, Event-Galerien, Geräteverwaltung und Administration für die Fotobox-Vermietung.
Die Fotobox-Software selbst liegt in `../System/` und funktioniert unabhängig von dieser Plattform.

**Stand 2026-11-25:** Phase 0 (Konzept) als Entwurf fertig – **noch kein Code**. Fortschritt: [docs/PROGRESS.md](docs/PROGRESS.md)

## Dokumente
| Thema | Datei |
|---|---|
| Analyse & kritische Prüfung | [docs/PHASE0_ANALYSE.md](docs/PHASE0_ANALYSE.md) |
| Architektur, Seiten, Rollen, Fotobox-Anbindung | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Datenmodell & ER-Diagramm | [docs/DATABASE.md](docs/DATABASE.md) |
| Geräte-API | [docs/API.md](docs/API.md) |
| Sicherheit & Datenschutz | [docs/SECURITY.md](docs/SECURITY.md) |
| Kosten | [docs/COSTS.md](docs/COSTS.md) |
| Roadmap | [docs/ROADMAP.md](docs/ROADMAP.md) |
| Entscheidungen | [docs/DECISIONS.md](docs/DECISIONS.md) |
| Tests / Deployment / Glossar | [TESTING](docs/TESTING.md) · [DEPLOYMENT](docs/DEPLOYMENT.md) · [GLOSSARY](docs/GLOSSARY.md) |
| SEO · GEO · Local SEO · Keywords · Inhalte · Marketing · Wettbewerb | [SEO](docs/SEO.md) · [GEO](docs/GEO.md) · [LOCAL_SEO](docs/LOCAL_SEO.md) · [KEYWORD_STRATEGY](docs/KEYWORD_STRATEGY.md) · [CONTENT_STRATEGY](docs/CONTENT_STRATEGY.md) · [MARKETING](docs/MARKETING.md) · [COMPETITOR_ANALYSIS](docs/COMPETITOR_ANALYSIS.md) |

## Offene Entscheide (brauchen deine Antwort)
| # | Frage | Mein Vorschlag |
|---|---|---|
| D1 | **Markenname:** Fotikaste oder momntbox? (Nähe zu «Fotokasten» beachten) | Vor Logo/Domain Markenprüfung (Swissreg/EUIPO), dann festlegen |
| D2 | Architektur A (Vercel + Supabase + R2) freigeben? | Ja, A |
| D3 | Sofortbuchung oder Anfrage? | Sofortbuchung im Liefergebiet mit ≥ 7 Tagen Vorlauf, sonst Anfrage |
| D4 | Tatsächliches Liefergebiet (Kantone/PLZ, max. km)? | – deine Angabe – |
| D5 | Anzahlung/Kaution? | Anzahlung (z. B. 30 %) per Rechnung, keine Kaution in V1 |
| D6 | Nur Schweizer Kunden ansprechen? | Ja (DSGVO bleibt dann meist ausserhalb) |
| D7 | Öffentliche Inhalte für **KI-Training** freigeben? (Suche ist separat erlaubt) | Deine Wahl; Sichtbarkeit in KI-Suche hängt nicht davon ab |
| D8 | Node.js LTS auf deinem PC installieren (systemweit, für Phase 1)? | Ja |
| D9 | Bist du MWST-pflichtig? Tatsächliche Druckkosten pro Abzug? | – deine Angabe – |

## Lokal starten
Noch nicht möglich (Phase 1).
