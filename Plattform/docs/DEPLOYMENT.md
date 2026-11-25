# Deployment (Plan)

Noch nichts eingerichtet. Jeder Schritt, der ein Konto, Kosten oder eine Veröffentlichung auslöst, braucht deine Freigabe.

## Umgebungen
| Umgebung | Zweck | Daten |
|---|---|---|
| Lokal | Entwicklung auf deinem PC | nur Testdaten |
| Vorschau (Cloudflare `*.workers.dev`, hinter Cloudflare Access) | Vorschau pro Änderung, `noindex` | nur Testdaten |
| Produktion | echte Kunden | erst nach Phase 7 |

## Checkliste Phase 7 (vor Go-Live)
- [ ] Domain gekauft (Name entschieden, Markenprüfung gemacht)
- [ ] DNS: Webseite, `files.`-Subdomain für R2 falls nötig, E-Mail **SPF/DKIM/DMARC**
- [ ] D1 Time Travel aktiv, wöchentlicher Export per GitHub Actions, Wiederherstellung getestet
- [ ] Geheimnisse mit `wrangler secret put` gesetzt (nie im Code); Workers Paid **nicht** aktiviert; Budgetwarnung USD 1 aktiv
- [ ] Mail-Testmodus **aus**, Testkonten gelöscht
- [ ] Sicherheitsprüfung, `npm audit`, Berechtigungstests grün
- [ ] Rechtstexte geprüft, Impressum vollständig
- [ ] robots.txt/Sitemap korrekt, Search Console + Bing verbunden
- [ ] Überwachung (Uptime, Fehler-Mails)
