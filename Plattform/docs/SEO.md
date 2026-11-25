# SEO – technische und inhaltliche Grundlagen

> **SEO** (Search Engine Optimization) – Webseite so bauen, dass Suchmaschinen sie verstehen und passenden Suchenden zeigen.

## Technische Pflichten (vor Veröffentlichung, Teil von Phase 1/7)
- Öffentliche Seiten **statisch oder serverseitig gerendert**; alle Produktinfos ohne JavaScript lesbar.
- Pro Seite: eigener `<title>`, Meta-Beschreibung, eine `<h1>`, logische Überschriften, Canonical, Open Graph (aus DB/Admin pflegbar).
- `sitemap.xml` automatisch (nur öffentliche Seiten), `robots.txt` (siehe `GEO.md` für Crawler), Breadcrumbs.
- Bilder: AVIF/WebP, `srcset`, feste Breite/Höhe (gegen CLS), Alt-Texte Pflichtfeld im Admin, Hero-Bild priorisiert laden.
- Schriften selbst gehostet (`next/font`), nur benötigte Schnitte → schnelles LCP.
- Korrekte Statuscodes (404, 410 für gelöschte Galerien, 301-Weiterleitungen aus Admin-Tabelle `redirects`).
- Ziele: **LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1**; Messung mit Lighthouse (Labor) und später echten Nutzerdaten (Search Console).
- Private Bereiche: Zugriffsschutz **plus** `noindex`/`X-Robots-Tag`, nicht in der Sitemap.

## Strukturierte Daten (JSON-LD, aus der Datenbank erzeugt)
| Seite | Typen |
|---|---|
| alle | `Organization` (Name, Logo, Kontakt, `sameAs` Social – nur echte Profile), `WebSite` |
| `/` | `LocalBusiness` (Unterart prüfen), `areaServed` = echtes Liefergebiet, **keine Adresse**, falls Servicegebiet-Unternehmen |
| `/preise`, Anlassseiten | `Service` + `Offer` (Preis in CHF = sichtbarer Preis) |
| Ratgeber | `Article` mit Autor und Aktualisierungsdatum |
| FAQ | `FAQPage` – Hinweis: Google zeigt FAQ-Rich-Results nur noch eingeschränkt; Markup ist trotzdem korrekt, aber keine Garantie |
| überall | `BreadcrumbList` |
**Nie:** `AggregateRating`/Sterne ohne echte, auf der Seite sichtbare Bewertungen. Prüfung mit Rich Results Test + Schema Markup Validator.

## Qualitätsprüfung im Admin (V2)
Automatische Warnungen: fehlende/doppelte Titel und Beschreibungen, fehlende Alt-Texte, defekte interne Links, Seiten mit `noindex` in der Sitemap, verwaiste Seiten.
