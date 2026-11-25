# Kosten – Schätzung

Stand: 2026-11-25 · **Achtung:** Preise stammen aus meinem Wissensstand, nicht aus einer heutigen Prüfung der Anbieterseiten.
Vor jedem Entscheid prüfe ich sie auf den offiziellen Preisseiten und trage das Prüfdatum hier ein. USD ≈ CHF (grobe Annahme).

## Laufende Kosten Variante A (empfohlen)

| Dienst | Entwicklung (bis Phase 6) | Produktion | Bemerkung |
|---|---|---|---|
| Vercel | Hobby: 0 | Pro: ca. USD 20 / Monat | Hobby ist laut Bedingungen **nur nicht-kommerziell** → für den Echtbetrieb Pro |
| Supabase | Free: 0 | Pro: ca. USD 25 / Monat | Free-Projekte werden nach ca. 1 Woche Inaktivität pausiert, keine täglichen Backups → nicht für Echtbetrieb |
| Cloudflare R2 | 0 (10 GB gratis) | ca. USD 0.015 / GB / Monat, **Download gratis** | 1 Event ≈ 300 Fotos × 6 MB Original + Varianten ≈ 2–2.5 GB |
| Resend | Free: 0 (begrenzte Mails/Tag) | 0 bis ca. USD 20 | Bei wenigen Buchungen reicht Free meist |
| Domain .ch | – | ca. CHF 10–25 / Jahr | noch **nicht gekauft**; Name offen (siehe Entscheid D1) |
| Uptime-Überwachung | 0 | 0 (Gratisstufe) | z. B. Better Stack / UptimeRobot |
| **Summe** | **CHF 0** | **ca. CHF 45–70 / Monat** | |

### Fotospeicher-Rechnung (Beispiel)
- 4 Events/Monat × 2.5 GB, Aufbewahrung 30 Tage → ca. 10 GB gleichzeitig → **≈ gratis bis CHF 0.20/Monat**.
- Bei 90 Tagen Aufbewahrung ≈ 30 GB → ca. CHF 0.30–0.50/Monat. Der Speicher ist also **kein** Kostentreiber.
- Supabase Storage wäre für viele Galerie-Downloads teurer (Datentransfer wird verrechnet) → R2 behalten.

## Variante B (eigener Server) und C (Cloudflare-only)
| | B: VPS (Infomaniak/Hetzner) | C: Cloudflare Workers + Neon |
|---|---|---|
| Server/Worker | CHF 5–20 | USD 5 (Workers Paid) |
| DB | inkl. | Neon Free/USD 19 |
| Backups | selbst einrichten, Offsite-Speicher CHF 2–5 | Anbieter |
| Zeitaufwand Wartung | **ca. 2–4 h / Monat** | ca. 1 h / Monat |

Deine Arbeitszeit ist der grösste Kostenfaktor – daher Empfehlung A trotz höherer Rechnung.

## Einmalige Kosten (Plattform)
Keine Lizenzkosten. Domain, ggf. Markenanmeldung beim IGE (Grundgebühr laut IGE prüfen), ggf. rechtliche Prüfung der AGB/Datenschutz.

## Wirtschaftlichkeits-Beispiel (nur Rechenweg, deine Zahlen fehlen noch)
```
Deckungsbeitrag pro Vermietung = Mietpreis − Druckkosten − Transport − Zeitaufwand × Stundensatz − anteilige Cloud
Break-even (Anzahl Vermietungen) = Investition Fotobox ÷ Deckungsbeitrag pro Vermietung
```
Beispiel mit **Fantasiewerten** (bitte ersetzen): Preis 590, 300 Drucke × 0.15 = 45, Transport 40, Cloud 15 →
DB 490 (ohne Arbeitszeit). Investition 2'500 → 6 Vermietungen. Mit 6 h × CHF 40 Arbeitszeit → DB 250 → 10 Vermietungen.
Das Finanzmodul rechnet das später aus echten Daten.
