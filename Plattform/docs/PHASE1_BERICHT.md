# Phase 1 – Bericht (Fundament, Design, SEO-Fundament)

Stand: 2026-11-25 · Branch `plattform/entwicklung` · Status: **umgesetzt und lokal getestet**, nicht veröffentlicht.

## Was wurde entwickelt?
- **Astro-7-Projekt** (TypeScript strikt, Tailwind 4) in `Plattform/`, rein statische Ausgabe → öffentliche Seiten brauchen **0 Worker-Aufrufe**.
- **Designsystem** «Postkarte» + Ruhe von «Galerie»: Farben/Schriften als Tokens (`src/styles/global.css`), Schriften lokal ausgeliefert
  (Cormorant Garamond + Manrope, kein Google-Fonts-Abruf), Komponenten Header, Footer, Logo, Postkarten-Stapel, Paketkarten, FAQ.
- **Startseite** mit allen 11 geforderten Abschnitten (Hero mit Datumsfeld, Erlebnis, Vorteile, Ablauf, Pakete, Produktfakten, Anlässe,
  Beispielgalerie, Bewertungen als ehrlicher Leerzustand, FAQ, Buchungsaufforderung, Footer).
- **17 Seiten**: Fotobox, Preise (Vergleichstabelle), FAQ, Verfügbarkeit, Galerie, Kontakt, Über uns, 3 Anlass-, 3 Regionalseiten, Impressum/Datenschutz/AGB (Entwurf), 404.
- **SEO-Fundament**: eigene Titel/Beschreibung, Canonical, Open Graph, `robots`-Meta, JSON-LD (Organization, WebSite, Service, FAQPage, BreadcrumbList)
  aus `brand.ts`, Sitemap und robots.txt aus Konfiguration, semantisches HTML, Breadcrumbs. Platzhalterseiten sind **noindex** und fehlen in der Sitemap.
- **KI-Crawler**: Such-Crawler (Google, Bing, OAI-SearchBot, Perplexity …) erlaubt, Trainings-Crawler (GPTBot, Google-Extended, ClaudeBot, CCBot …) gesperrt.
- **Sicherheits-Header** (`public/_headers`): CSP, HSTS, nosniff, Frame-Verbot, Permissions-Policy.
- **Cloudflare-Konfiguration** `wrangler.jsonc`: nur statische Assets, `workers_dev` und `preview_urls` **aus** (keine Umgehungsadressen).
- **Markenname zentral** in `src/config/brand.ts` (Domain ist Platzhalter `fotikaste.example`).
- Ausserdem (Phase 0b): Node.js 24.22.3 installiert (mit deiner Zustimmung), Bildtest mit echten Fotos (`IMAGES.md`), Kostenkontrolle (`COST_CONTROL.md`), Dashboard-Anleitung (`CLOUDFLARE_SICHERHEIT.md`).

## Testergebnisse (2026-11-25, tatsächlich ausgeführt)
| Test | Ergebnis |
|---|---|
| `astro check` (Typen) | 0 Fehler, 0 Warnungen |
| Unit-Tests (Vitest) – robots, Sitemap, JSON-LD, keine erfundenen Daten, Script-Ausbruch | **13/13 grün** |
| Browser-Tests (Playwright, Desktop 1440 px + Handy 375 px) – alle 17 Seiten: Status 200, genau eine H1, Titel, Beschreibung, Canonical, index/noindex korrekt, JSON-LD gültig, kein seitliches Scrollen; 404; private Pfade nicht vorhanden; Sicherheits-Header; axe WCAG 2.2 AA ohne schwere Verstösse | **46/46 grün** |
| Lighthouse (Labor, lokal) Start/Preise/Fotobox/FAQ, Handy + Desktop | Performance 99–100 · Barrierefreiheit 100 · Best Practices 100 · SEO 100 · LCP 0.8 s · CLS 0 |
| Fotobox-Software (`System/`, unverändert) | 116 Tests grün |

## Unterwegs gefundene und behobene Fehler
1. **robots.txt sperrte `/fotobox` und `/faq`**: Die Regel `Disallow: /f` (für Foto-Links) trifft als Präfix auch `/fotobox` und `/faq`. Lighthouse-SEO fiel auf 66.
   Behoben mit `/f/`, `/event/`, `/api/`; neuer Test prüft, dass keine öffentliche Seite gesperrt ist.
2. CSP blockierte eine eingebettete Schrift → `font-src 'self' data:`.
3. Layoutverschiebung durch Schriftwechsel (CLS 0.09) → Schriften werden vorgeladen, CLS jetzt 0.
4. Zu schwacher Kontrast im Postkarten-Platzhalter, nicht per Tastatur erreichbare scrollbare Tabelle, übersprungene Überschriftenebene → behoben.

## Wichtige Dateien
`src/config/brand.ts` (Marke) · `src/config/site.ts` (Navigation, private Pfade, Crawler) · `src/config/pages.ts` (Seitenregister: index/noindex) ·
`src/lib/seo.ts` (robots, Sitemap, JSON-LD) · `src/data/content.ts` (Texte, Platzhalter) · `src/layouts/` · `src/components/` · `src/pages/` ·
`public/_headers` · `wrangler.jsonc` · `tests/` · `tools/lighthouse.mjs` · `tools/bildtest/bildtest.py`

## Wie arbeiten die Teile zusammen?
`npm run build` → Astro liest Konfiguration und Inhalte → erzeugt fertiges HTML in `dist/` (inkl. robots.txt, sitemap.xml) →
Cloudflare liefert diese Dateien später direkt aus (lokal simuliert durch `wrangler dev`). Kein Server-Code, keine Datenbank in Phase 1.

## Selbst testen
In PowerShell im Ordner `Plattform`:
1. `npm run build` → erwartet «0 errors» und «Complete!»
2. `npx wrangler dev --port 8788` → Browser `http://localhost:8788` öffnen (Beenden: Strg+C)
3. `npm test` → «13 passed» · `npx playwright test` → «46 passed»

## Bekannte Lücken / offene Risiken
- Alle Preise, Kontaktdaten, Produktmasse, Produktfotos, Rechtstexte und Regionaltexte sind **Platzhalter**.
- Lighthouse misst lokal ohne echtes Netz/CDN; echte Werte (Core Web Vitals) erst nach Veröffentlichung messbar.
- Nach der Domain-Wahl müssen `siteUrl`, OG-Bild und Logo final werden.
- Bildtest nur mit Gegenstand-Fotos; Wiederholung mit echten Event-Fotos nötig.
- `allowScripts` in `package.json` erlaubt Installationsskripte nur für esbuild und workerd (npm 11 blockiert andere).
- Noch nicht nach `main` übernommen (wartet auf deine Sichtprüfung des Designs).

## Nächster Schritt
Deine Sichtprüfung des Designs → Merge nach `main` → Phase 2 (D1-Datenbank, Cloudflare Access, Rollen, Verbrauchszähler, Speicherreservierung).
