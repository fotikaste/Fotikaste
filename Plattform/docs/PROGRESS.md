# Fortschritt

Ehrlich geführt: «erledigt» heisst umgesetzt **und** geprüft. Neueste Einträge oben.

## 2026-11-25 – Phase 0, Version 2 (Branch `plattform/entwicklung`)
- Architektur auf **Cloudflare-Gratisstufen** umgestellt (Workers + statische Assets, D1, R2 privat, Access, Turnstile) + Resend Free + GitHub Free.
  Gratisgrenzen, Verhalten am Limit und Bedingungen auf den offiziellen Seiten gelesen (Quellen in `COSTS.md`).
- Doppelbuchungsschutz für D1 entworfen (`allocation_days` UNIQUE + `batch()`), Anmeldung ohne Supabase (Access, Magic Link).
- Verbrauchsschutz entworfen (harte R2-Grenze 8 GB, Warnungen, Mail-Drossel).
- Sicherheitsanalyse der bestehenden Online-Galerie (nur gelesen) und Migrationsplan mit Schlüsselrotation: `R2_MIGRATION.md`.
- Markenprüfung Swissreg/Zefix/RDAP/Websuche: `BRAND_CHECK.md` (Treffer «Event Fotibox», Bettwiesen).
- Wettbewerbsanalyse mit 11 direkt abgerufenen Webseiten: `COMPETITOR_ANALYSIS.md` (2 Seiten nicht ladbar).
- Drei Designkonzepte (Desktop + Handy) erstellt und **im Browser gerendert geprüft**: `design/startseite-konzepte.html`.
- Node.js-LTS ermittelt (24.22.3 / 26.13.1), **nicht installiert** (wartet auf Zustimmung).
- `.claude/launch.json` um Vorschau-Eintrag `plattform-design` ergänzt.
- **Nicht** gemacht: Code, Konten, Käufe, Änderungen an der Fotobox oder am Cloudflare-Konto.

## 2026-11-25 – Phase 0, Version 1 (auf `main`)
Erste Analyse, Architektur mit Vercel/Supabase (überholt), Doku-Grundgerüst.

## Nächster Schritt
Antworten auf E1–E6 (`README.md`), Sofortmassnahme 0b, dann Phase 1.
