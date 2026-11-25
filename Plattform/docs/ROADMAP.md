# Roadmap

Stand: 2026-11-25 · Prinzip: erst ein **verkaufsfähiges MVP**, dann ausbauen. Jede Phase endet mit Tests, Doku, Commit und deiner Abnahme.

> **MVP** (Minimum Viable Product) – die kleinste Version, mit der echte Kunden buchen können und die du sicher betreiben kannst.

## MVP (V1) – Ziel: erste Online-Buchung
| Phase | Inhalt | Ergebnis |
|---|---|---|
| **0** Analyse ✅ (Entwurf) | Dieses Konzept | Freigabe durch dich |
| **1** Fundament & Design | Node.js, Next.js+TS+Tailwind, Designsystem (Farben, Schriften, Logo-Entwurf), Komponenten, **Startseite** mit Platzhalter-Inhalten, SEO-Grundgerüst (Metadaten, Sitemap, robots, JSON-LD aus Daten) | Startseite lokal im Browser |
| **2** Datenbank & Sicherheit | Supabase-Projekt (EU), Migrationen, RLS + Tests, Admin-Login mit 2FA, Rollen, Audit-Log | Geschützter leerer Admin |
| **3** Buchung | Pakete/Extras/Lieferzonen (admin-pflegbar), serverseitige Preisberechnung, Verfügbarkeit mit Ausschlussregel, Buchungsstrecke, Bestätigungs-Mail (Testmodus), Magic-Link-Portal | Testbuchung Ende-zu-Ende |
| **4** Administration | Dashboard (echte Zahlen), Buchungen, Kalender (Monat/Woche/Tag), Kunden-CRM, Inhalte/FAQ/Preise bearbeiten | Du verwaltest alles ohne Code |
| **5** Fotobox-Integration | Geräteverwaltung, Geräte-API, **Simulator**, private Galerie, Einzelfoto-Token, Vorschaubilder, ZIP, Löschfristen; danach `PlattformGalerie` im Pi-Code (eigene Freigabe!) | QR → Foto über eigene Domain |
| **6a** Rechnungen | Nummernkreis, PDF, Sperre nach Ausstellung, Storno/Gutschrift, CSV-Export, Zahlungserinnerung | Rechnung zur Buchung |
| **7** Veröffentlichung | Sicherheits- und Datenschutzprüfung, Rechtstexte prüfen lassen, Domain, E-Mail-Domain (SPF/DKIM/DMARC), Backups + Wiederherstellungstest, Lighthouse | Live – nur mit deiner Freigabe |

## Später (V2+)
| Priorität | Erweiterung |
|---|---|
| hoch | Schweizer QR-Rechnung (nach Prüfung der SIX-Spezifikation), Finanzübersicht + Wirtschaftlichkeit, Bewertungsanfrage, Event-/Galerie-Mails |
| mittel | Ratgeber-CMS mit Redaktionsplan, Regionalseiten, SEO-Qualitätsprüfung im Admin, Weiterleitungen, IndexNow, datenschutzfreundliche Analyse |
| mittel | Onlinezahlung (TWINT/Karte über z. B. Stripe oder Payrexx), Anzahlungen |
| niedrig | Marketing-Dashboard (Search Console, Bing), KI-Sichtbarkeitsmonitoring (Budget), Mitarbeiter-Rolle aktiv, lokale WLAN-Downloads an der Box |

## Notwendig vs. später (Kurzfassung)
**Notwendig für den Start:** Webseite, Preise, Verfügbarkeit, Buchung, Bestätigung, Admin, Rechnung als PDF, Rechtstexte, Galerie mit Einzelfoto-Links, Backups, 2FA.
**Bewusst später:** Onlinezahlung, QR-Rechnung, Marketing- und KI-Dashboards, Mitarbeiter, Ratgeber-Masse, mehrere Fotoboxen im Alltag (Datenmodell kann es von Anfang an).
