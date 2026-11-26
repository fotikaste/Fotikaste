# Fortschritt

Ehrlich geführt: «erledigt» heisst umgesetzt **und** geprüft. Neueste Einträge oben.

## 2026-11-26 – Phase 4 umgesetzt (Administration)
- Admin mit Übersicht, Buchungen (Detail, Storno, Termin ändern, Positionen, Zahlung, Kontakt, Notizen), Kalender (Sperren), Kunden, Preise
  (Pakete, Konditionen, Liefergebiete), Inhalte (FAQ mit Platzhaltern, Leistungen, technische Angaben), Einstellungen → `PHASE4_BERICHT.md`.
- Entscheid ADR-030: Inhalte in D1, Webseite bleibt statisch, Knopf «Webseite aktualisieren» (lokal geprüft: 4 s; online ab Phase 7).
- Tests: 96 Vitest, 74 Playwright grün. Fotobox-Software unverändert.

## 2026-11-26 – Phase 3 umgesetzt (Buchung)
- Migration 0002: Pakete, Liefergebiete, PLZ-Tabelle, Ressourcen, Kunden, Buchungen mit Positions-Snapshot, Zahlungsplan, allocation_days (UNIQUE),
  Magic Links, Sitzungen, Outbox. Serverseitige Preise, Hold 15 Min., Direktbuchung + Anfrage-Weg, Admin bestätigen/ablehnen,
  Kundenportal mit Magic Link, Seiten /buchen, /verfuegbarkeit (Kalender), /konto → `PHASE3_BERICHT.md`, `BUCHUNG.md`.
- Tests: 77 Vitest (inkl. 50 gleichzeitige Reservierungen → genau 1), 70 Playwright grün (Desktop + Handy, zweimal hintereinander). Fotobox-Software unverändert.
- Nachtrag: amtliches PLZ-Verzeichnis (swisstopo, mit Freigabe heruntergeladen) als Migration 0003 – 3190 PLZ. Tests danach: 79 Vitest, 70 Playwright grün.
- Offen: Mails nur im Testmodus; Quellenangabe swisstopo im Impressum (Phase 7).

## 2026-11-26 – Preise festgelegt und auf der Webseite
- Essential 290 (ohne Drucker) · Premium 450 (300 Abzüge) · Signature 590 (600 Abzüge) · Zusatztag 45 · Fahrt 50 bis 20 km ab 8370 Sirnach, +1.20/km
  (Lieferung und Abholung zusammen) · nicht stornierbar, Option «stornierbar» +20 (bis 28 Tage) · keine Onlinezahlung → `PREISE.md`.
- Preisseite mit Zusatzleistungen und Angebots-JSON-LD (Preise = sichtbare Preise, per Test geprüft). Tests: 37 Vitest, 58 Playwright grün.
- Bestätigt: km zählen als einfache Strecke ab Sirnach.

## 2026-11-26 – Phase 2 umgesetzt (Datenbank und Sicherheit)
- Worker für `/api/*` und `/admin`, D1-Migration 0001, Access-JWT-Prüfung (WebCrypto, kein Zusatzpaket), Rollen, Protokoll, Verbrauchszähler,
  Warnstufen 50/75/90 %, Sperre ab 90 %, atomare Speicherreservierung, Anfragebegrenzung, Turnstile, Admin-Seite → `PHASE2_BERICHT.md`.
- Tests: 37 Vitest (inkl. 20 gleichzeitige Uploads → genau 9 erlaubt), 56 Playwright grün. Fotobox-Software unverändert.
- Entscheide: nur lokal; Google-Login mit 2FA; nur Inhaber; bestehendes Cloudflare-Konto (wird nur für Fotikaste genutzt).

## 2026-11-25 – Eigene Bilder des Benutzers eingebaut
- Canva-Bilder entfernt, 9 gelieferte Visualisierungen optimiert (WebP bis Originalbreite, nie hochskaliert; JPEG-Rückfall ≤ 1200 px) und eingebaut.
- Gekennzeichnet als «Visualisierung (KI-generiert)». Tests: 13 Unit, 48 Browser grün. Lighthouse: Start/Fotobox/Preise 94–100, LCP ≤ 2.0 s, CLS 0.

## 2026-11-25 – Design freigegeben, KI-Symbolbilder eingebaut
- Design vom Benutzer freigegeben → Phase 0–1 nach `main` übernommen.
- 6 Bilder mit Canva generiert (Vorgaben: keine Fotobox, keine erkennbaren Kunden, Farbpalette). Canva lieferte die Originale nur über ein
  automatisch erzeugtes Layout; Bilder daraus in hoher Auflösung exportiert, ausgeschnitten und begradigt. 1 Bild (Hochzeitstafel) fehlte im Export und wird nicht verwendet.
- 5 Bilder als WebP 480–1600 px + JPEG-Rückfall (zusammen 2 MB, pro Seite geladen deutlich weniger), alle als «Symbolbild (KI-generiert)» gekennzeichnet.
- Einsatz: Postkarten im Hero, «Das Erlebnis», Anlasskarten, Anlassseiten. Beispielgalerie und Produktfotos bleiben bewusst Platzhalter.
- Tests: 13 Unit, 48 Browser grün. Lighthouse: Start 99–100 überall; /fotobox und /hochzeit Desktop Performance 90, LCP 2.0 s (Ziel ≤ 2.5 s); /hochzeit SEO 69 = gewollt (noindex).
- In deinem Canva-Konto liegen dadurch 6 generierte Bilder und eine Hilfspräsentation «DAHb8ziOJCA» (kann gelöscht werden).

## 2026-11-25 – Phase 1 umgesetzt (Branch `plattform/entwicklung`)
- Entscheide E1–E6 umgesetzt (Cloudflare CHF 0, Astro, Design C+A, Originale lokal, E5 offen → nichts gelöscht, Node 24).
- Node.js 24.22.3 per winget installiert (Zustimmung vorhanden), Kompatibilität mit Astro 7.4 / Wrangler 4 / Vitest 5 geprüft.
- Bildtest mit 4 echten Canon-Fotos: 2400 px / q85 ≈ 0.39 MB (−94 %), PSNR ≥ 40 dB, SSIM ≥ 0.995, EXIF entfernt → `IMAGES.md`.
- `COST_CONTROL.md` (verhinderbar vs. nur reduzierbar, Speicherreservierung), `CLOUDFLARE_SICHERHEIT.md` (Schritt-für-Schritt, ohne Löschungen).
- Astro-Webseite mit Designsystem, Startseite, 17 Seiten, SEO-/KI-Fundament. Tests: 13 Unit, 46 Browser, Lighthouse 99–100 in allen Kategorien → `PHASE1_BERICHT.md`.
- Fotobox-Software unverändert, 116 Tests grün.
- **Nicht** gemacht: Veröffentlichung, Konten, Domain, Löschungen in Cloudflare, Merge nach `main`.

## 2026-11-25 – Phase 0, Version 2
Cloudflare-Architektur, D1-Modell, R2-Migrationsplan, Markenprüfung, Wettbewerbsanalyse, drei Designkonzepte.

## 2026-11-25 – Phase 0, Version 1 (auf `main`)
Erste Analyse (Vercel/Supabase, überholt).

## Nächster Schritt
Sichtprüfung Admin, Merge nach `main`, dann Phase 5 (Fotobox-Integration).
