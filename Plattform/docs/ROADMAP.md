# Roadmap

Stand: 2026-11-25 (Version 2, Cloudflare CHF 0) · Jede Phase endet mit: Funktionsübersicht, echten Browseransichten, Testergebnissen,
bekannten Fehlern, Risiken, geänderten Dateien, nächsten Schritten, Fachbegriffen und drei Verständnisfragen.
Entwicklung auf Branch `plattform/entwicklung`; Übernahme nach `main` nur nach grünen Tests.

| Phase | Inhalt | Ergebnis | Änderung zu V1 |
|---|---|---|---|
| **0** ✅ Entwurf | Konzept, Recherche, Marken-/Wettbewerbsprüfung, drei Designkonzepte | Freigabe | Architektur auf Cloudflare umgestellt |
| **0b – Sofortmassnahme R2** | Token-Rechte prüfen, Lifecycle 30 Tage, Budgetwarnung (du im Dashboard, ich erkläre) | Risiko gesenkt | neu |
| **1** ✅ Fundament & Design (2026-11-25, lokal getestet) | Node.js, **Astro** + TypeScript + Tailwind, `wrangler`, Designsystem (gewähltes Konzept), Logo-Entwurf, Startseite, Navigation, **SEO-Fundament** (Metadaten, Canonical, Sitemap, robots.txt mit getrennter KI-Such-/Trainingssteuerung, JSON-LD aus `brand.ts`/Daten, semantisches HTML, Bildoptimierung), Regionalseiten-Gerüst, FAQ-Struktur, Lighthouse-Messung | Startseite lokal im Browser (Desktop + Handy) | SEO ab Phase 1 verbindlich |
| **2** ✅ Datenbank & Sicherheit (2026-11-26, lokal getestet) | D1-Migrationen, Cloudflare Access für Admin, Rollenprüfung im Worker, Audit-Log, Turnstile, Rate-Limits, Verbrauchszähler, Tests für Zugriffsrechte | geschützter leerer Admin | RLS → Worker-Prüfung + Tests |
| **3** ✅ Buchung (2026-11-26, lokal getestet; PLZ-Import offen) | Pakete, Extras, **Liefergebiete** (PLZ, Kantone, km, Kosten, Abholung, Vorlauf, Kapazität, Puffer), serverseitige Preise, Verfügbarkeit mit `allocation_days`, Direktbuchung + Anfrage-Weg, Anzahlung/Rest/Kaution konfigurierbar, Bestätigungsmail (Testmodus), Magic-Link-Portal | Testbuchung A–Z, Gleichzeitigkeitstest | Liefergebiet/Zahlungsplan ausgebaut |
| **4** Administration | Dashboard inkl. **Verbrauchsanzeige**, Buchungen, Kalender, Kunden, Inhalte/Preise/FAQ ohne Code | Selbstverwaltung | Verbrauch neu |
| **5** Fotobox-Integration | Geräteverwaltung, Geräte-API, Simulator, privater Bucket, Galerie, `PlattformGalerie` im Pi-Code (Laptop), **Migration nach `R2_MIGRATION.md`**, Pi-Update erst nach Freigabe | QR → Plattform, alte Schlüssel gelöscht | Pi darf erweitert werden |
| **6** Rechnungen & Finanzen | Rechnung als PDF (im Browser erzeugt, unveränderlich), Storno/Gutschrift, CSV, Zahlungserinnerung, Wirtschaftlichkeit (0.15/Abzug vorläufig) | Rechnung zur Buchung | PDF-Erzeugung im Browser |
| **7** Veröffentlichung | Sicherheits-/Datenschutzprüfung, Rechtstexte, Domain (nach Namensentscheid), Search Console/Bing, Backups + Wiederherstellungstest | Live nach Freigabe | – |

**Später:** QR-Rechnung, Onlinezahlung (nur gehostete Zahlungsseite), Marketing-Dashboard, KI-Sichtbarkeitsmonitoring, Sprachen FR/IT/EN, Halbtages-Slots, Mitarbeiter-Rolle.

**Auswirkungen der CHF-0-Vorgabe auf den Plan:** +ca. 1 Woche Aufwand für Eigenbau Anmeldung/Magic Link, Backup-Export,
Verbrauchsschutz und Browser-PDF; dafür entfallen Anbieterkonten bei Vercel/Supabase.
