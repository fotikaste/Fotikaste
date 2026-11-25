# Kostenkontrolle

Stand: 2026-11-25 · Budget **CHF 0/Monat**. Schwellen: Warnung bei **50 / 75 / 90 %**, Sperre kostenrelevanter Vorgänge ab **90 %**
(Ausnahme: Buchungsbestätigungen und Löschvorgänge laufen weiter). Die Fotobox fotografiert, zeigt und druckt in jedem Fall lokal weiter.

## Was technisch verhindert werden kann – und was nur reduziert
| Dienst | Kann eine Rechnung entstehen? | Art des Schutzes |
|---|---|---|
| Workers (Aufrufe, CPU) | **Nein**, solange Workers Paid nicht aktiviert ist. Am Limit: Fehler 1027/1102 | **verhindert** (Free-Plan). Risiko: Ausfall statt Kosten |
| D1 | **Nein** im Free-Plan. Am Limit: Abfragen scheitern | **verhindert** |
| Resend Free | Laut Preisseite blockiert (429). AGB erlauben Resend aber, Free-Konten bei Überschreitung in Abos umzuwandeln | **weitgehend verhindert**: App-Drossel 80/Tag, 2 500/Monat; keine Zahlungsmethode bei Resend hinterlegen |
| Cloudflare Access, Turnstile, DNS, Email Routing | Nein (Gratisprodukte) | verhindert |
| **R2** | **Ja**, mit hinterlegter Zahlungsmethode wird Mehrverbrauch verrechnet; Cloudflare hat **keine harte Ausgabengrenze** | **nur Risikoreduktion**: App-Grenzen, Reservierung, Lifecycle, Warnungen. Restrisiko: Fehler im eigenen Code, andere Projekte im Konto, direkte Zugriffe am Code vorbei |
| Andere Projekte im selben Cloudflare-Konto | Teilen sich die Gratismengen (Workers-Aufrufe, D1, R2 kontoweit) | **Risikoreduktion**: kontoweite Messung über Cloudflare-Analyse-API, Warnung; Empfehlung: separates Cloudflare-Konto nur für Fotikaste |
| GitHub Actions | Nein ohne Zahlungsmethode (Minuten stoppen) | verhindert |
| Domain | jährliche Gebühr | bewusst akzeptiert |

## R2: Speicher serverseitig reservieren (gegen gleichzeitige Uploads)
1. Fotobox meldet Upload mit erwarteter Grösse an (`bytes`).
2. Worker schreibt in **einem D1-Batch**: `UPDATE storage_budget SET reserved = reserved + :bytes WHERE id = 1 AND used + reserved + :bytes <= :limit` und legt eine Reservierung (10 min) an. Ändert das UPDATE keine Zeile → `507`, Foto bleibt in der lokalen Warteschlange.
   Da D1 Schreibvorgänge nacheinander ausführt, können zwei gleichzeitige Uploads die Grenze nicht gemeinsam überschreiten.
3. Vorsignierte URL erlaubt nur diesen Pfad und diese **Content-Length**.
4. `complete`: Worker liest die **tatsächliche Objektgrösse** aus R2 (`head`). Weicht sie ab oder überschreitet sie die Reservierung → Objekt löschen, Upload abgelehnt.
   Sonst `used += tatsächlich`, `reserved -= angemeldet`.
5. Nicht abgeschlossene Reservierungen verfallen per Cron; zugehörige Objekte (falls doch hochgeladen) werden gelöscht.
6. Löschungen verringern `used`. Wöchentlicher Abgleich: Summe der Objektgrössen (R2-Listing) vs. `used`, Abweichung → Warnung.

## Zähler und Grenzen (Standardwerte, im Admin änderbar)
| Grösse | Gratis | Warnung 50/75/90 % | Sperre ab 90 % blockiert |
|---|---|---|---|
| R2-Speicher | 10 GB | bezogen auf **8 GB** App-Grenze | neue Foto-Uploads |
| R2 Klasse A (Schreiben/Listen) / Monat | 1 Mio. | ja | Uploads, Listings |
| R2 Klasse B (Lesen) / Monat | 10 Mio. | ja | Galerie-Downloads (Seite zeigt «vorübergehend nicht verfügbar») |
| Worker-Aufrufe / Tag (kontoweit) | 100 000 | ja | nicht nötig (sperrt selbst, kostenlos) |
| D1 gelesene / geschriebene Zeilen / Tag | 5 Mio. / 100 000 | ja | Hintergrundjobs pausieren |
| E-Mails | 100/Tag, 3 000/Monat | ja | nicht dringende Mails (Erinnerungen) – Bestätigungen haben Vorrang |
Eigene Zähler (`usage_counters`) sind **gemessen in der App**; kontoweite Werte aus der Cloudflare-GraphQL-Analyse sind **gemessen bei Cloudflare**
(mit Verzögerung); Hochrechnungen auf Monatsende sind **geschätzt** – die Verbrauchsübersicht zeigt diese Herkunft bei jedem Wert an.

## Verbrauchsübersicht im Admin (geplant, Phase 4)
Belegter/verfügbarer Fotospeicher · Anzahl Fotos · aktive Galerien · D1-Verbrauch · Worker-Aufrufe · E-Mails · Gratiskontingente ·
aktuelle/geschätzte Kosten (sollte CHF 0.00 sein) · Warnungen · geplante Löschungen (nächste 14 Tage).

## Deine einmaligen Einstellungen (siehe `CLOUDFLARE_SICHERHEIT.md`)
Budgetwarnung USD 1 · R2-Lifecycle-Regel · kein Workers-Paid-Abo · keine Zahlungsmethode bei Resend.
