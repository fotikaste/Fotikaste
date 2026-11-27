# Phase 7 – Bericht (Veröffentlichung vorbereitet)

Stand: 2026-11-26 · Branch `plattform/entwicklung` · **nichts veröffentlicht, keine Konten, keine Käufe.** Alles Lokale ist erledigt; der Rest wartet auf deine Schritte (`DEPLOYMENT.md`).

## Entscheide (Inhaber, 2026-11-26)
- **Name «Fotikaste» bleibt** (ADR-033). Das Verwechslungsrisiko mit der eingetragenen Marke «Event Fotibox» (Bettwiesen TG, Klasse 41) nimmst du bewusst in Kauf. Empfehlung bleibt: vor grösserer Werbung eine Fachperson fragen.
- **Privates GitHub-Repository** für Veröffentlichung, «Webseite aktualisieren» und Datensicherung (ADR-034).

## Was wurde gemacht?
**Sicherheits- und Datenschutzprüfung**
- `npm audit`: 0 bekannte Schwachstellen. Git-Verlauf: keine Schlüssel gefunden.
- Strengere Skript-Regel (CSP): Weil auf keiner Seite eingebetteter Skript-Code vorkommt, entfällt `'unsafe-inline'`. Erlaubt ist nur noch die eigene Domain sowie Turnstile.
- Anmeldelinks werden nach dem Versand aus dem Mail-Ausgang entfernt.
- Der tägliche Cron löscht abgelaufene Anmeldelinks, Sitzungen und Mails, die älter als 180 Tage sind.
- **DSG:** Pro Kunde gibt es «Auskunft herunterladen» (alle Personendaten als Datei) und «Anonymisieren». Name, Kontakt, Adresse, Notizen, Mails und Fotos werden dabei entfernt, Beträge bleiben für die Buchhaltung. Beides kann nur der Eigentümer.
- Überschriften trennen jetzt Silben, damit lange Wörter auf schmalen Handys nicht über den Rand laufen.

**Rechtstexte (ENTWURF – nicht rechtlich geprüft)**
- Impressum, Datenschutzerklärung (DSG: Daten, Zwecke, Auftragsbearbeiter Cloudflare und Resend, Aufbewahrung, Cookies, Rechte) und AGB (Buchung, Preise automatisch aus der Datenbank, persönliche Zahlung, Storno-Option, Lieferung, Haftung, Galerie, Recht).
- Was nur du weisst, steht sichtbar als **«noch offen: …»** im Text: Inhaber, Adresse, Kontakt, MWST, Zahlungszeitpunkt, Folgen einer Absage, Haftung für Schäden, Gerichtsstand, Grundlage der Datenbekanntgabe in die USA, Datum.
- Inhaberdaten pflegst du an einer Stelle: `src/config/brand.ts` → `owner` und `contact`.
- Quellenangabe swisstopo steht im Impressum.

**Veröffentlichung vorbereitet**
- GitHub-Abläufe: Tests bei jeder Änderung. Von `main` wird nur veröffentlicht, wenn die Tests grün sind, du ausdrücklich freigibst und die Konfiguration stimmt (Datenbank-ID, Access, Produktion).
- «Webseite aktualisieren» spricht online GitHub an (Token darf nur diesen Ablauf starten). Der lokale Dienst funktioniert unverändert.
- Wöchentliche Datensicherung in GitHub. **Wiederherstellung lokal getestet: 33 Tabellen identisch** (`npm run sicherung:test`).
- `DEPLOYMENT.md`: komplette Anleitung A–H mit allen Klicks, Rechten und Geheimnissen.

## Tests (tatsächlich gelaufen)
- Vitest **124/124** (4 neu: Auskunft, Anonymisierung, Anmeldelink nach Versand entfernt, Cron-Aufräumen).
- Playwright **76/76** (Desktop + Handy). Die Rechtstexte liefen zuerst auf dem Handy über den Rand, das ist behoben.
- Wiederherstellungsprobe der lokalen Datenbank: erfolgreich.
- Die GitHub-Abläufe selbst konnten **nicht** getestet werden, weil es noch kein Repository gibt. Sie laufen erst nach Schritt A.

## Was du jetzt tun musst (Reihenfolge)
1. **A** GitHub-Konto und privates Repository → mir die Adresse geben (ich lade erst nach deinem OK hoch).
2. **B** Cloudflare: Budgetwarnung, `wrangler login`, dann mit deinem OK Datenbank und Fotospeicher anlegen, API-Token.
3. **C** Domain `fotikaste.ch` kaufen und zu Cloudflare umziehen.
4. **D–G** Access, Turnstile, Resend, Token für «Webseite aktualisieren».
5. Inhaberdaten nennen (für das Impressum) und die offenen Punkte in AGB und Datenschutz entscheiden. Danach **fachlich prüfen lassen**.
6. **H** Erste Veröffentlichung im Testmodus, Abnahme, dann Go-Live. Danach Pi-Umstellung (nur mit Freigabe).

## Risiken
- Name: siehe Entscheid. Rechtstexte ohne Fachprüfung sind ein Risiko. Sie sind darum als Entwurf gekennzeichnet und mit `noindex` versehen.
- Das Protokoll (`audit_log`) ist absichtlich unveränderlich und wird darum auch beim Anonymisieren nicht bereinigt (enthält vor allem Kennungen, kaum Namen).
- Der Free-Plan von Cloudflare hat Grenzen (100'000 Worker-Aufrufe pro Tag, 10 GB Speicher). Die App sperrt kostenrelevante Vorgänge vorher.

## Drei Verständnisfragen
1. Warum kann ein Push auf `main` nicht versehentlich eine halb eingerichtete Plattform veröffentlichen?
2. Was passiert mit einer Kundin, die ihre Daten löschen lassen will, aber vor drei Monaten gebucht hat?
3. Wo liegt der geheime Schlüssel von Turnstile, und warum nicht im Code?
