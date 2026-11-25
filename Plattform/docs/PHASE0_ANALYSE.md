# Phase 0 – Analyse und kritische Prüfung

Stand: 2026-11-25 · Status: **Version 1 – teilweise überholt.** Architektur, Kosten und Datenbank gelten jetzt in Version 2
(`ARCHITECTURE.md`, `COSTS.md`, `DATABASE.md`). Die kritische Prüfung unten bleibt gültig.

## 1. Ausgangslage (geprüft, nicht angenommen)

### Entwicklungsumgebung (Windows 11, geprüft 2026-11-25)
| Werkzeug | Zustand |
|---|---|
| Git | ✅ 2.56, Repository `Fotobox` auf `main`, sauber |
| Node.js / npm | ❌ **nicht installiert** – wird für Next.js benötigt (Phase 1, deine Zustimmung nötig) |
| Python | ⚠️ nicht im PATH (`python`), die Fotobox läuft über `System\.venv` bzw. `py` |
| Supabase CLI, Docker | ❌ nicht vorhanden (erst bei Bedarf) |

### Bestehende Fotobox-Software (`System/`, nur gelesen, nichts verändert)
Python 3 + Flask + waitress, SQLite, lauscht nur auf 127.0.0.1. Bausteine mit austauschbaren Umsetzungen (simuliert/echt):
Kamera (digiCamControl, gphoto2), Drucker (CUPS/IPP), **Galerie** (`galerie.py`), WLAN, USB-Export. 85 Tests.

**Wichtigste Schnittstelle für die Plattform – `galerie.py`:**
```
class Galerie:
    status()                    -> {"bereit": bool, "text": str}
    url(schluessel)             -> spätere öffentliche Adresse (für den QR-Code, auch offline!)
    hochladen(datei, schluessel)
```
- Upload-Warteschlange: Tabelle `uploads` in SQLite (`sitzung_id` UNIQUE, Status, Versuche) + Hintergrund-Arbeiter in `ablauf.py`.
- Schlüssel: `<veranstaltung_id>/<secrets.token_urlsafe(16)>.jpg` (128 Bit Zufall – gut).
- Heute: Pi lädt **direkt** per S3-API in den Cloudflare-R2-Bucket «fotikiste» (EU), Abruf öffentlich über **r2.dev**.

**Bewertung:** Die Architektur ist gut vorbereitet. Die Plattform kann als **neue Galerie-Umsetzung `PlattformGalerie`**
angedockt werden, ohne Ablauf, Kamera oder Druck anzufassen. Die Offline-Fähigkeit bleibt erhalten, weil die Fotobox den
Zugriffsschlüssel selbst erzeugt und die URL schon vor dem Upload kennt.

**Heutige Schwachstellen (für Echtbetrieb):**
1. Fotos liegen in einem **öffentlich lesbaren** Bucket. Wer einen Link hat, kann das Bild ohne Ablauf abrufen; Löschung nur über Lifecycle-Regel.
2. Der Pi besitzt einen **R2-Schreibschlüssel für den ganzen Bucket** → bei Diebstahl der Fotobox könnten fremde Event-Fotos gelöscht/überschrieben werden.
3. r2.dev ist laut Cloudflare nur für Entwicklung gedacht (gedrosselt).
→ Lösung siehe `ARCHITECTURE.md` §4 (Geräte-Token + vorsignierte Uploads + privater Bucket).

## 2. Widersprüche, die du entscheiden musst

| # | Widerspruch | Warum wichtig |
|---|---|---|
| W1 | **Markenname:** Masterprompt «Fotikaste», bisherige Doku «momntbox» (Domain momntbox.ch gewählt), Bucket «fotikiste» | Domain, Logo, SEO, Google-Profil hängen daran. Ein späterer Wechsel kostet Sichtbarkeit. |
| W2 | **Verwechslungsgefahr:** «Fotikaste» ist sehr nah an **«Fotokasten»** (bekannter deutscher Fotobuch-/Fotodruck-Anbieter) | Markenrechtliches Risiko + Suchmaschinen korrigieren «Fotikaste» evtl. zu «Fotokasten». Vor Logo/Domain: Prüfung in **Swissreg** (IGE) und EUIPO. Keine Rechtsberatung – bei Unsicherheit Fachperson. |
| W3 | Fotobox-`CLAUDE.md`: «Nicht bauen: Bezahlung, Online-Buchung» – Masterprompt verlangt Online-Buchung | Die Regel gilt für die **Pi-Software**. Die Buchung entsteht in der **Plattform** (eigener Ordner). Ich habe die Regel entsprechend präzisiert. |

## 3. Kritische Prüfung des Masterprompts

### Was sehr gut ist
Sicherheits- und Datenschutzdenken von Anfang an, Offline-First der Fotobox, «keine erfundenen Daten», modulare Phasen, Testmodus für E-Mails.

### Schwachstellen und fehlende Anforderungen
1. **Umfang:** Das ist der Funktionsumfang mehrerer kommerzieller Produkte (Buchung, CRM, Rechnungen, Galerie, Gerätemanagement, CMS, Marketing-Dashboard, KI-Monitoring). Als Einzelperson-Projekt nur mit striktem **MVP** realistisch (siehe `ROADMAP.md`).
2. **Die knappste Ressource bist du, nicht die Fotobox.** Verfügbarkeit hängt auch davon ab, wer liefert/aufbaut. Zwei Boxen am selben Abend in Genf und St. Gallen sind mit einer Person unmöglich. → Neues Konzept «**Liefer-Kapazität**» (Personal/Fahrzeug) zusätzlich zu Geräten.
3. **Verbindliche Sofortbuchung ohne Prüfung** ist riskant: Distanz, Treppen/Lift, Strom am Ort, Datum in 3 Tagen. → Vorschlag: Sofortbuchung nur innerhalb definierter **Liefergebiete (PLZ-Liste)** und Mindestvorlauf (z. B. 7 Tage); sonst automatisch «Anfrage» mit Antwort innerhalb 24 h.
4. **Ohne Online-Zahlung drohen Scheinbuchungen** (Datum blockiert, Kunde zahlt nie). → Buchung «bestätigt, Anzahlung offen»; ohne Zahlung bis Frist X wird nach Erinnerung freigegeben (du entscheidest manuell, nicht automatisch).
5. **Kaution** bei Rechnungskauf schwer durchsetzbar. → Vorschlag: keine Kaution in V1, dafür klare AGB-Haftung + Schadenpauschale. Entscheid bei dir.
6. **Rechtliches fehlt:** Impressum (in der Schweiz für Online-Angebote Pflicht), AGB inkl. Storno-/Haftungsregeln, Datenschutzerklärung, Hinweis für Gäste an der Fotobox («Fotos werden gespeichert/gedruckt»).
7. **Verbrauchskosten:** CHF 0.15 pro Druck ist zu prüfen – beim DNP DS620 entsprechen 400 Abzüge einer Rolle; teile mir deinen tatsächlichen Einkaufspreis (Papier+Farbband) mit. Wert wird konfigurierbar.
8. **Gerät ≠ Benutzer:** Die Rolle «Fotobox-Gerät» sollte kein Benutzerkonto sein, sondern eine eigene Geräte-Identität mit eigenem Token (sicherer, widerrufbar).
9. **Bewertungen:** Automatische Bewertungsanfrage ok, aber neutral an alle (kein «nur zufriedene Kunden zu Google» – das verstösst gegen Google-Richtlinien).
10. **KI-Sichtbarkeitsmonitoring** über offizielle APIs kostet laufend Geld und liefert stark schwankende Stichproben. → Späte Phase, manuell starten, Budget-Obergrenze.
11. **Marketing-Dashboard:** Search Console/Bing haben APIs; Google Business Profile API hat Zugangshürden. → Späte Phase, erst manuell.
12. **MWST:** Pflicht erst ab CHF 100 000 Jahresumsatz (weltweit) – nicht automatisch erheben; Feld «MWST-pflichtig ja/nein + Satz».
13. **DSGVO:** Für Schweizer Kunden gilt das revDSG. Die DSGVO kann gelten, wenn du gezielt Kunden in der EU ansprichst (z. B. Konstanz). Empfehlung: Angebot klar auf die Schweiz ausrichten.
14. **Fotos von Gästen** sind Personendaten. Gemeinsame Galerie nur mit Zustimmung des Veranstalters, standardmässig aus (wie gefordert), Löschfristen sichtbar.

### Bessere Alternativen zu einzelnen Anforderungen
| Anforderung | Alternative | Vor-/Nachteile |
|---|---|---|
| Tabellen `booking_holds` + `availability_blocks` getrennt | **Eine Tabelle `resource_allocations`** (Buchung, Reservierung, Wartung, Sperre) mit Datenbank-Ausschlussregel | + Doppelbuchung ist von der Datenbank selbst unmöglich · − etwas anspruchsvolleres SQL |
| `photo_access_tokens` als eigene Tabelle | Token-Hash direkt am Foto + optional mehrere Freigaben | + einfacher · − weniger flexibel (reicht für V1) |
| Supabase Storage für Fotos | **Cloudflare R2 behalten** (privat) | + keine Download-Gebühren, Konto existiert, Fotobox-Code vorhanden · − zweiter Anbieter |
| Eigene Rollen-Tabelle `roles` | Feste Rollenliste in der Datenbank (Enum) | + weniger Fehlerquellen; Rollen ändern sich selten |
