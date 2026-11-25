# Glossar Plattform

Ergänzt `Dokumente/GLOSSAR.md` (Fotobox). Je Begriff: Was? · Wozu? · Wo bei uns?

| Begriff | Erklärung | Bei Fotikaste |
|---|---|---|
| **Next.js** | Web-Framework auf Basis von React; kann Seiten auf dem Server fertig bauen | Ganze Plattform |
| **TypeScript** | JavaScript mit Typen – Fehler fallen vor dem Ausführen auf | Gesamter Code |
| **Tailwind CSS** | Gestaltung über kleine Klassen direkt im HTML | Designsystem |
| **PostgreSQL** | Relationale Datenbank (Tabellen mit Beziehungen) | Buchungen, Kunden, Rechnungen |
| **Supabase** | Dienst, der Postgres + Login + Werkzeuge betreibt | DB und Anmeldung |
| **Migration** | Versionierte SQL-Datei, die die DB Schritt für Schritt verändert | `supabase/migrations/` |
| **Row Level Security (RLS)** | Regeln *in* der Datenbank, welche Zeilen jemand sehen darf | Kunde sieht nur eigene Buchung |
| **Exclusion Constraint** | DB-Regel: zwei Einträge dürfen sich nicht überschneiden | Kein Gerät doppelt gebucht |
| **Transaktion** | Mehrere DB-Schritte gelten ganz oder gar nicht | Hold → Buchung |
| **Hold** | Kurze Reservierung (15 min) während der Kunde bucht | Buchungsstrecke |
| **Object Storage** | Speicher für Dateien (Objekte) statt Tabellen | Cloudflare R2 für Fotos |
| **Vorsignierte URL** | Zeitlich begrenzter Link mit Unterschrift, erlaubt genau eine Aktion | Upload vom Pi, Download für Gäste |
| **Token / Hash** | Token = langes Zufallswort als Schlüssel; Hash = nicht umkehrbarer Fingerabdruck davon | QR-Code-Link, Geräte-Login |
| **Magic Link** | Anmeldelink per E-Mail statt Passwort | Kundenportal |
| **2FA / TOTP** | Zweiter Faktor: 6-stelliger Code aus einer App | Admin-Login |
| **Idempotent** | Wiederholen schadet nicht | Upload, E-Mails |
| **Outbox** | Warteschlange für ausgehende Nachrichten mit eindeutigem Schlüssel | Keine Doppel-Mails |
| **Rate Limiting** | Begrenzung der Anfragen pro Zeit | Login, Buchung, Geräte-API |
| **CSRF / XSS / SQL-Injection** | Angriffe: fremde Aktion auslösen / Schadcode einschleusen / DB-Befehle einschleusen | Abwehr siehe SECURITY.md |
| **SSR / SSG** | Seite auf dem Server bei Anfrage bzw. beim Bauen erzeugt | Öffentliche Seiten (gut für Google) |
| **JSON-LD** | Maschinenlesbare Beschreibung (Schema.org) im Seitenquelltext | Unternehmen, Angebote, FAQ |
| **Core Web Vitals** | Google-Messwerte: LCP (Ladezeit Hauptinhalt), INP (Reaktionszeit), CLS (Verspringen) | Ziel ≤ 2.5 s / ≤ 200 ms / ≤ 0.1 |
| **SEO / GEO / AEO** | Optimierung für Suchmaschinen / generative KI-Suche / Antwortmaschinen | `SEO.md`, `GEO.md` |
| **Canonical URL** | Angabe der «Original»-Adresse einer Seite | Verhindert doppelte Inhalte |
| **IndexNow** | Protokoll, um Suchmaschinen (z. B. Bing) über neue Seiten zu informieren | Nach Veröffentlichung |
| **MVP** | Kleinste sinnvolle Version | V1 in ROADMAP.md |
| **Deckungsbeitrag** | Preis minus variable Kosten | Finanzmodul |
| **Break-even** | Punkt, an dem Investition wieder eingespielt ist | Wirtschaftlichkeit |
