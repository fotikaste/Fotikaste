# Entscheidungen (ADR – Architecture Decision Records)

Format: Kontext · Entscheid · Alternativen · Folgen. Status **vorgeschlagen** = wartet auf deine Freigabe.

## ADR-001 Plattform im Unterordner `Plattform/` des Fotobox-Repositorys — *angenommen (2026-11-25, dein Entscheid)*
Kontext: Fotobox-Software liegt in `System/`. Entscheid: Plattform in `Plattform/`, eigene Doku und Regeln. Pi-Code wird nicht berührt.
Alternative: eigenes Repository (sauberere Trennung, getrennte Versionen). Folge: Deployment muss auf `Plattform/` als Root zeigen.

## ADR-002 Modularer Monolith mit Next.js + TypeScript — *vorgeschlagen*
Alternativen: separates Backend (z. B. Python/FastAPI, passt zur Pi-Sprache) – mehr Betriebsaufwand; Astro für die Webseite + separates Admin – zwei Systeme.
Folge: eine Sprache (TypeScript) für Web, Admin und API; serverseitiges Rendern für SEO.

## ADR-003 Supabase (Postgres, Auth) in EU-Region — *vorgeschlagen*
Alternativen: Neon + Auth-Bibliothek (weniger Abhängigkeit, mehr Eigenbau); eigenes Postgres (Variante B).
Folge: RLS-Policies müssen für jede Tabelle geschrieben **und getestet** werden.

## ADR-004 Fotos in privatem Cloudflare-R2-Bucket — *vorgeschlagen*
Kontext: R2 ist schon im Einsatz und hat keine Download-Gebühren. Entscheid: **neuer privater** Bucket für die Plattform; der bestehende öffentliche bleibt bis zur Umstellung des Pi.
Alternative: Supabase Storage (ein Anbieter weniger, aber Datentransfer kostet).

## ADR-005 Doppelbuchungsschutz über Postgres-Ausschlussregel — *vorgeschlagen*
Alternative: nur Prüfung im Code mit Sperren (fehleranfälliger). Folge: braucht Erweiterung `btree_gist` (bei Supabase verfügbar – in Phase 2 prüfen).

## ADR-006 Fotobox erzeugt Foto-Token selbst, Plattform speichert Hash — *vorgeschlagen*
Grund: QR-Code muss offline funktionieren; passt zur bestehenden Warteschlange. Alternative: Token von der Cloud holen (bricht offline).

## ADR-007 Geld in Rappen (integer), Zeit in UTC, Anzeige Europe/Zurich — *angenommen (technische Kleinentscheidung)*

## ADR-008 Keine Zahlungsintegration in V1 — *angenommen (Masterprompt)*
Datenmodell `payments` mit Feld `method` vorbereitet; keine scheinbar funktionierende Zahlungsfunktion.
