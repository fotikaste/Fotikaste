# GEO / AEO – Auffindbarkeit in KI-Suchsystemen

> **GEO** (Generative Engine Optimization) und **AEO** (Answer Engine Optimization) – Inhalte so gestalten, dass KI-Suchsysteme
> (Google AI Overviews, ChatGPT Search, Copilot, Perplexity) Fotikaste verstehen und als Quelle nennen *können*. **Keine Garantie.**

## Inhaltliche Grundsätze
- Ein klarer Satz «Was ist Fotikaste?» auf Start- und Über-uns-Seite (wer, was, wo, für wen).
- Konkrete, prüfbare Fakten statt Floskeln: Kamera (Canon EOS 600D, DSLR), Drucker (Sublimation, 10×15 cm), Druckzeit (erst messen!), Platzbedarf, Strom, Liefergebiet, Preise in CHF.
- Frage-Antwort-Blöcke mit direkter Antwort im ersten Satz.
- Vergleichstabelle der Pakete als echtes HTML-`<table>`.
- «Zuletzt aktualisiert» bei Preisen und Ratgebern.
- Eigene Erfahrungswerte (erst nach echten Events, mit Zahlen aus der Fotobox-Statistik).

## Crawler-Steuerung (Entwurf robots.txt, vor Go-Live gegen aktuelle Doku prüfen)
| Crawler | Zweck | Vorschlag |
|---|---|---|
| Googlebot, Bingbot | Suche | erlauben |
| OAI-SearchBot (OpenAI), PerplexityBot | KI-Suche | erlauben |
| Google-Extended, GPTBot, ClaudeBot, CCBot, Applebot-Extended | **Training** von KI-Modellen | **gesperrt** (D7, separat konfigurierbar) |
Alle: `Disallow: /admin /konto /event /f /api /buchen`. Zusätzlich prüfen, dass Cloudflare-Bot-Schutz / AI Crawl Control erlaubte Such-Crawler nicht blockiert.

**llms.txt:** optionaler Vorschlag, kein etablierter Standard und kein bekannter Rankingfaktor → höchstens als kleine Ergänzung.
**IndexNow:** für Bing/Yandex bei neuen/geänderten Seiten (Phase 7).

## Monitoring (V2)
Fragenkatalog (≥ 30 Fragen, z. B. «Empfiehl mir eine Fotobox im Thurgau») wird monatlich stichprobenartig geprüft und protokolliert:
Datum · System · Frage · Region · Websuche an? · Fotikaste erwähnt? · verlinkt? · genannte Wettbewerber · fehlende Infos.
Automatisierung nur über offizielle APIs mit festem Monatsbudget (Entscheid später). Einzelne Antworten sind **keine** Rankings.
