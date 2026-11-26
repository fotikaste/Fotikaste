# Entscheidungen (ADR – Architecture Decision Records)

Format: Kontext · Entscheid · Alternativen · Folgen.

## ADR-001 Plattform im Unterordner `Plattform/` — *angenommen (2026-11-25)*
## ADR-007 Geld in Rappen, Zeit UTC, Anzeige Europe/Zurich — *angenommen*
## ADR-008 Keine Zahlungsintegration in V1 — *angenommen*

## ADR-002 Next.js — *ersetzt durch ADR-010*
## ADR-003 Supabase — *ersetzt durch ADR-009*
## ADR-005 Postgres-Ausschlussregel — *ersetzt durch ADR-011*

## ADR-004 Fotos in privatem R2-Bucket — *angenommen (Vorgabe: vorhandene Infrastruktur nutzen)*
Neuer Bucket `fotikaste-fotos`, EU-Jurisdiktion, ohne öffentlichen Zugang.

## ADR-006 Fotobox erzeugt Foto-Token selbst — *angenommen*

## ADR-009 Cloudflare-Gratisstufen statt Vercel/Supabase — *angenommen (Vorgabe CHF 0, 2026-11-25)*
Kontext: Budget CHF 0/Monat. Entscheid: Workers (+ statische Assets), D1, R2, Access, Turnstile, Email Routing; Resend Free; GitHub Free.
Alternativen: Vercel Hobby (laut Bedingungen nicht kommerziell), Supabase Free (pausiert bei Inaktivität). Folgen: 10 ms CPU, keine RLS,
eigene Magic-Links, Backups selbst; einzige Kostengefahr R2 → harte App-Grenzen.
Hinweis: Die Freigabe von Variante A (D2) ist dadurch überholt.

## ADR-010 Astro statt Next.js — *vorgeschlagen (Entscheid E2)*
Kontext: Öffentliche Seiten sollen statisch, schnell und ohne Server-CPU sein; Free-Plan 10 ms CPU. Astro erzeugt statisches HTML und
nur dort Server-Code, wo nötig; offizieller Cloudflare-Adapter; Astro gehört seit Jan. 2026 zu Cloudflare (bleibt MIT-lizenziert).
Alternativen: Next.js über OpenNext auf Workers (seit Sept. 2026 bis 64 MiB möglich, aber schwerer, mehr CPU pro Aufruf);
SvelteKit. Folge: React-Komponenten weiterhin möglich (Astro-Inseln), z. B. für Buchungsstrecke und Admin.

## ADR-011 Doppelbuchungsschutz über `allocation_days` UNIQUE + `batch()` — *vorgeschlagen*
D1 hat keine Ausschlussregel; `batch()` ist laut Doku eine Transaktion. Tagesbasierte Belegung pro Ressource. Alternative: Durable Object
als Buchungs-«Schalter» (auch gratis verfügbar) – komplexer; nur falls Tests Probleme zeigen.

## ADR-012 Admin-Anmeldung über Cloudflare Access + Token-Prüfung im Worker — *vorgeschlagen*
Alternative: eigene Passwort+TOTP-Anmeldung (mehr Code, mehr Risiko). Folge: 2FA hängt am Google/GitHub-Konto des Admins – dort Pflicht.

## ADR-013 Bildvarianten auf der Fotobox, PDF/ZIP im Browser — *vorgeschlagen*
Grund: keine Bildverarbeitung/kein Rechenaufwand in Gratis-Workern.

## ADR-014 Markenname zentral in `brand.ts`, Arbeitsname «Fotikaste» — *angenommen (D1)*

## ADR-015 KI-Suche erlaubt, KI-Training gesperrt — *angenommen (D7)*
robots.txt aus Konfiguration erzeugt: Such-Crawler (Googlebot, Bingbot, OAI-SearchBot, PerplexityBot …) erlaubt; Trainings-Crawler
(GPTBot, Google-Extended, ClaudeBot, CCBot, Applebot-Extended …) gesperrt; Liste vor Go-Live gegen aktuelle Anbieterdoku prüfen.
Zusätzlich Cloudflare-Einstellung «AI Crawl Control/Bot-Schutz» prüfen, damit erlaubte Such-Crawler nicht blockiert werden.

## ADR-016 Sprache de-CH, Mehrsprachigkeit vorbereitet — *angenommen (D6)*

## ADR-009/010/012 — *angenommen (E1, E2, 2026-11-25)*

## ADR-017 Schriften lokal statt Google Fonts — *angenommen (Phase 1)*
Schneller (kein Fremd-Server), datenschutzfreundlich (keine IP-Übermittlung an Google), vorgeladen gegen Layoutverschiebung.

## ADR-018 Phase 1 rein statisch, Cloudflare-Adapter erst ab Phase 2 — *angenommen*
Öffentliche Seiten bleiben auch danach statisch (prerender); nur Buchung/Portal/Admin/API werden Server-Routen.

## ADR-019 Platzhalterseiten noindex — *angenommen*
Anlass-, Regional-, Rechts- und Kontaktseiten sind bis zu echtem Inhalt `noindex` und nicht in der Sitemap (gegen dünne Inhalte).

## ADR-020 Galeriebilder 2400 px / JPEG 85 / ohne Metadaten — *vorläufig (E4)*, siehe `IMAGES.md`.

## ADR-021 Zahlung 100 % auf Rechnung vor dem Event — *angenommen (Geschäftsmodell, ersetzt 30 %-Vorschlag)*

## ADR-022 KI-generierte Symbolbilder bis echte Fotos vorliegen — *angenommen (Benutzerwunsch, 2026-11-25)*
Erstellt mit Canva (Bildgenerierung). Regeln: zeigen **nicht** die Fotikaste-Fotobox und keine echten Kunden; keine erkennbaren
Gesichter; jedes Bild ist auf der Seite als «Symbolbild (KI-generiert)» gekennzeichnet (Transparenz, keine Irreführung nach UWG);
Beispielgalerie und Produktfotos bleiben bewusst Platzhalter, bis echte Fotos (mit Einwilligung) vorhanden sind.
Bilder werden mit `tools/bilder/optimieren.py` in WebP 480–1600 px + JPEG-Rückfall ohne Metadaten umgewandelt (`public/bilder/`).
Nutzungsrechte: gemäss Canva-Bedingungen für KI-generierte Inhalte – vor Go-Live prüfen.

## ADR-023 Bilder vom Benutzer ersetzen die Canva-Bilder — *angenommen (2026-11-25)*
Der Benutzer hat 10 KI-generierte Visualisierungen geliefert (9 verschiedene, zwei identisch). Sie zeigen eine Fotobox mit Holzgehäuse,
Stativ, Leuchte und Drucker sowie Gäste an Anlässen. Kennzeichnung auf der Seite: «Visualisierung(en) (KI-generiert)».
Einsatz: Hero-Postkarten, Erlebnis, Anlasskarten/-seiten, Fotobox-Seite, Beispielgalerie (mit Hinweis «echte Eventfotos folgen»).
Offen: Stimmt das gezeigte Gehäuse mit der echten Fotobox überein? Falls nicht, Kennzeichnung beibehalten und bald durch echte Fotos ersetzen.
Die Canva-Bilder (ADR-022) sind entfernt.

## ADR-024 Worker getrennt von Astro, nur für /api und /admin — *angenommen (Phase 2)*
Astro bleibt rein statisch; ein eigener Worker (`worker/`) mit `run_worker_first` für `/api/*` und `/admin`. Statische Seiten lösen keine
Worker-Aufrufe aus (gratis). Alternative Astro-Cloudflare-Adapter: mehr Abhängigkeiten, schwerer zu testen.

## ADR-025 Access-JWT-Prüfung mit WebCrypto statt Zusatzpaket — *angenommen (Phase 2)*
Prüft RS256-Signatur, `iss`, `aud`, `exp`, `nbf`, E-Mail; Schlüssel von `https://<team>/cdn-cgi/access/certs`, 10 min Zwischenspeicher.
Testschlüssel (`ACCESS_JWKS`) nur ausserhalb der Produktion. Ohne Konfiguration: Zugriff verweigert.

## ADR-026 Entwicklungs-Abkürzung für lokalen Admin — *angenommen*
Nur bei ENVIRONMENT=development **und** localhost **und** DEV_ADMIN_EMAIL. Produktion: ENVIRONMENT fest «production», keine workers.dev-/Vorschau-Adressen. Durch Tests abgesichert.

## ADR-027 Bestehendes Cloudflare-Konto — *angenommen (Benutzer, 2026-11-25)*
Wird ausschliesslich für Fotikaste genutzt → teilt keine Gratiskontingente mit anderen Projekten.

## ADR-028 Sperre ab 90 % der App-Grenze — *angenommen*
Fotospeicher: Uploads gesperrt ab 90 % von 8 GB (= 7.2 GB). Kontingente: Sperre kostenrelevanter Vorgänge ab 90 % der Gratisgrenze.

## ADR-029 Keine Onlinezahlung — *angenommen (Benutzer, 2026-11-26)*
Ersetzt ADR-021 (100 % auf Rechnung vor dem Event): Bezahlung wird nach der Buchung per E-Mail oder persönlich vereinbart.
Keine Zahlungsfunktion, keine Anzahlung/Kaution online. Buchung trotzdem verbindlich. Preisvorschlag und offene Punkte: `PREISE.md`.
