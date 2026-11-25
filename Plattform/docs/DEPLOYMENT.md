# Deployment (Plan)

Noch nichts eingerichtet. Jeder Schritt, der ein Konto, Kosten oder eine Veröffentlichung auslöst, braucht deine Freigabe.

## Umgebungen
| Umgebung | Zweck | Daten |
|---|---|---|
| Lokal | Entwicklung auf deinem PC | nur Testdaten |
| Preview (Vercel) | Vorschau pro Änderung, passwortgeschützt, `noindex` | nur Testdaten |
| Produktion | echte Kunden | erst nach Phase 7 |

## Checkliste Phase 7 (vor Go-Live)
- [ ] Domain gekauft (Name entschieden, Markenprüfung gemacht)
- [ ] DNS: Webseite, `files.`-Subdomain für R2 falls nötig, E-Mail **SPF/DKIM/DMARC**
- [ ] Supabase Pro, Region EU, tägliche Backups, Wiederherstellung getestet
- [ ] Umgebungsvariablen in Vercel gesetzt (nie im Code)
- [ ] Mail-Testmodus **aus**, Testkonten gelöscht
- [ ] Sicherheitsprüfung, `npm audit`, RLS-Tests grün
- [ ] Rechtstexte geprüft, Impressum vollständig
- [ ] robots.txt/Sitemap korrekt, Search Console + Bing verbunden
- [ ] Überwachung (Uptime, Fehler-Mails)
