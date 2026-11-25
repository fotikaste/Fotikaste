# Kosten

Stand: 2026-11-25 (Version 2) · Ziel: **CHF 0 pro Monat**, einzig die Domain kostet (jährlich).
Quellen: offizielle Seiten, am 2026-11-25 gelesen (Links unten). Vor Go-Live erneut prüfen.

## Laufende Kosten

| Dienst | Gratisstufe (geprüft 2026-11-25) | Was passiert am Limit | Kosten Fotikaste |
|---|---|---|---|
| Cloudflare Workers + statische Assets | 100 000 Aufrufe/Tag, 10 ms CPU/Aufruf, 5 Cron, Assets unbegrenzt | Fehler, keine Rechnung (Paid-Plan nicht aktiv) | **CHF 0** |
| Cloudflare D1 | 5 Mio. Lese-/100 000 Schreibzeilen pro Tag, 500 MB/DB, 5 GB/Konto, 7 Tage Time Travel | Abfragen scheitern, keine Rechnung | **CHF 0** |
| Cloudflare R2 | 10 GB-Monat, 1 Mio. Klasse-A, 10 Mio. Klasse-B pro Monat, Download gratis | **wird verrechnet**: USD 0.015/GB, 4.50/Mio. A, 0.36/Mio. B | **CHF 0** bei Einhaltung der App-Grenzen |
| Cloudflare Access | Zero Trust Free < 50 Benutzer | – | **CHF 0** |
| Cloudflare Turnstile, Email Routing, DNS | gratis | – | **CHF 0** |
| Resend | 100 E-Mails/Tag, 3 000/Monat, 3 Domains, 30 Tage Logs | Versand blockiert (429) | **CHF 0** |
| GitHub | privates Repo, Actions-Kontingent | Actions stoppen | **CHF 0** |
| **Domain .ch** | – | – | ca. CHF 10–25 / Jahr (noch nicht gekauft) |

### Reicht das? (Rechnung mit Annahmen)
| Grösse | Annahme | Verbrauch | Gratisgrenze |
|---|---|---|---|
| Fotos | 6 Events/Monat × 400 Fotos × (6 MB + 0.6 MB + 0.05 MB) | ≈ 16 GB/Monat **ohne Löschung** | 10 GB → **Löschfrist nötig** |
| mit 30 Tagen Aufbewahrung | gleichzeitig ca. 1 Monat | ≈ 8–16 GB | **zu knapp bei 6 Events** |
| mit 14 Tagen Original + 60 Tagen Webversion | Originale gehen zusätzlich per USB-Stick an den Kunden | ≈ 4–8 GB | ✅ |
| Schreibvorgänge R2 | 2 400 Fotos × 3 Dateien | ≈ 7 200 | 1 Mio. ✅ |
| Lesevorgänge R2 | 200 Gäste × 20 Bilder × 6 Events | ≈ 24 000 | 10 Mio. ✅ |
| Worker-Aufrufe | Galerie, Buchung, Fotobox | einige Tausend/Tag | 100 000/Tag ✅ |
| E-Mails | 6 Buchungen × ca. 6 Mails | ≈ 40/Monat | 3 000 ✅ |

**Wichtigste Erkenntnis:** Engpass ist allein der **Fotospeicher**. Wer CHF 0 will, braucht kurze Aufbewahrungsfristen für
Originale in der Cloud. Vorschlag: Originale **nicht** standardmässig hochladen, sondern Web-Version (≈ 0.6 MB) online, Originale
auf USB-Stick/Download-Link nur auf Wunsch → Speicherbedarf sinkt um ca. 90 % (Entscheid E4).

## Schutz vor Kosten (Details `ARCHITECTURE.md` §7)
- Workers Paid, R2 Infrequent Access, Cloudflare Images werden **nie** ohne deine Zustimmung aktiviert.
- App-Obergrenze R2: 8 GB, Upload-Stopp mit lokaler Warteschlange auf der Fotobox.
- Warnungen per E-Mail bei 50/80/95 %, Verbrauchsanzeige im Admin.
- Cloudflare-Budgetwarnung bei USD 1 (richtest du ein; informiert nur).
- E-Mail-Outbox drosselt auf 80/Tag.

## Einmalige Kosten
Domain (jährlich). Optional später: Markenanmeldung beim IGE (Gebühr laut IGE prüfen), rechtliche Prüfung der Texte.

## Vergleich zu Version 1
| | Version 1 (Vercel + Supabase) | **Version 2 (Cloudflare)** |
|---|---|---|
| Monatlich | ca. CHF 45–70 | **CHF 0** |
| Wartung | gering | gering bis mittel |
| Einschränkungen | kaum | 10 ms CPU, Speicher 10 GB, Backups selbst organisieren, kein Server-PDF |
| Anbieter | 4 | im Kern 1 (Cloudflare) + Resend |

## Wirtschaftlichkeit (Rechenweg, Werte vorläufig)
Druckkosten vorläufig **CHF 0.15 pro Abzug** (kalkulatorisch, im Admin änderbar). Keine MWST berechnet, bis deine Situation geklärt ist.
```
Deckungsbeitrag = Mietpreis − Abzüge × 0.15 − Transport − Arbeitszeit × Stundensatz   (Cloud = 0)
Break-even      = Investition ÷ Deckungsbeitrag
```

Quellen: [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) · [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/) · [D1 Limits](https://developers.cloudflare.com/d1/platform/limits/) · [R2 Pricing](https://developers.cloudflare.com/r2/pricing/) · [Budget Alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/) · [Zero Trust Plans](https://www.cloudflare.com/plans/sase-zero-trust.md) · [Resend Limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits) · [Resend Pricing](https://resend.com/pricing) · [Cloudflare Terms](https://www.cloudflare.com/terms/)
