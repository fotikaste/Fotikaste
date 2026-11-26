# Glossar Plattform

Ergänzt `Dokumente/GLOSSAR.md` (Fotobox). Je Begriff: Was? · Wozu? · Wo bei uns?

| Begriff | Erklärung | Bei Fotikaste |
|---|---|---|
| **Astro** | Web-Framework, das Seiten beim Bauen als fertiges HTML erzeugt und nur wo nötig Server-Code ausführt | Ganze Plattform |
| **Cloudflare Worker** | Kleines Programm, das in Cloudflares Rechenzentren bei jeder Anfrage läuft | Buchung, Galerie, Admin, Geräte-API |
| **Statische Assets** | Fertige Dateien (HTML, Bilder), die ohne Rechenarbeit ausgeliefert werden | Öffentliche Seiten |
| **Cloudflare D1** | Datenbank von Cloudflare auf Basis von SQLite | Buchungen, Kunden, Rechnungen |
| **batch()** | Mehrere D1-Befehle, die ganz oder gar nicht ausgeführt werden | Doppelbuchungsschutz |
| **UNIQUE-Regel** | Datenbank verbietet doppelte Werte | ein Tag pro Fotobox nur einmal belegt |
| **Cloudflare Access** | Vorgeschaltete Anmeldung vor einer Webadresse | Admin-Bereich |
| **Turnstile** | Unsichtbare Prüfung «Mensch oder Bot» | Buchung, Magic Link |
| **Wrangler** | Werkzeug, um Worker lokal zu testen und zu veröffentlichen | Entwicklung |
| **Free Tier / Gratisstufe** | kostenloses Kontingent eines Dienstes | gesamte Plattform |
| **TypeScript** | JavaScript mit Typen – Fehler fallen vor dem Ausführen auf | Gesamter Code |
| **Tailwind CSS** | Gestaltung über kleine Klassen direkt im HTML | Designsystem |
| **Migration** | Versionierte SQL-Datei, die die DB Schritt für Schritt verändert | `migrations/` |
| **Row Level Security (RLS)** | Regeln *in* der Datenbank, welche Zeilen jemand sehen darf (D1 hat das nicht → Prüfung im Worker) | – |
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
| **JWT** | Signiertes Ticket (JSON Web Token), das bestätigt, wer angemeldet ist | Cloudflare Access → Admin |
| **JWKS** | Liste öffentlicher Schlüssel, mit denen man die Signatur eines JWT prüft | Access-Prüfung im Worker |
| **Fail closed** | Im Zweifel ablehnen statt erlauben | fehlende Konfiguration, Turnstile-Fehler |
| **Trigger** | Regel in der Datenbank, die bei Änderungen automatisch ausgeführt wird | Protokoll unveränderlich |
| **Reservierung (Speicher)** | Platz wird vor dem Upload verbindlich vorgemerkt | Schutz vor Überschreiten der 8 GB |
| **run_worker_first** | Cloudflare-Einstellung: nur bestimmte Adressen laufen durch den Worker | /api, /admin |
