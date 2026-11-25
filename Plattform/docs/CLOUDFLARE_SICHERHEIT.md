# Sicherheitsmassnahmen im Cloudflare-Dashboard – Schritt für Schritt

Stand: 2026-11-25 · **Du** führst diese Schritte aus (Konto und Schlüssel gehören dir). Ich habe keinen Zugriff auf dein Konto.
Die Bezeichnungen im Dashboard können sich leicht ändern. Wenn etwas anders aussieht, schick mir ein Foto des Bildschirms.

**Wegen E5 gilt bis zu deiner Bestätigung:** keine Bilder, Buckets oder Schlüssel löschen, keine Löschregel aktivieren.
Teil A ist nur Anschauen und Warnungen einrichten – nichts geht verloren.

## Teil A – jetzt (ca. 10 Minuten, nichts wird gelöscht)

### A1 Budgetwarnung einrichten
1. Browser öffnen → `https://dash.cloudflare.com` → anmelden.
2. Links unten bzw. im Kontomenü **«Manage Account» → «Billing»** öffnen.
3. **«Billable Usage»** wählen. Dort **«Budget alerts»** → **«Create budget alert»** (Bezeichnung laut Cloudflare-Doku).
4. Betrag **1** (USD) eintragen, deine E-Mail-Adresse wählen, speichern.
5. Erwartet: Eine Zeile «USD 1» in der Liste. Hinweis: Die Warnung informiert nur, sie stoppt nichts.

### A2 Prüfen, dass kein kostenpflichtiges Workers-Abo aktiv ist
1. Links **«Workers & Pages»** öffnen → **«Plans»** bzw. Abo-Übersicht.
2. Erwartet: **«Free»**. Steht dort «Paid» oder «Workers Paid» → nichts ändern, mir Foto schicken.

### A3 Rechte der R2-Schlüssel ansehen (nur lesen)
1. Links **«R2 Object Storage»** öffnen.
2. Auf der Übersichtsseite rechts **«Manage API tokens»** (bzw. «API» → «Manage API tokens»).
3. Du siehst eine Liste, z. B. «fotobox-pi» und ein Laptop-Token. Bei jedem Token notieren:
   - **Permission**: «Admin Read & Write», «Object Read & Write» oder «Object Read only»?
   - **Bucket**: «All buckets» oder nur «fotikiste»?
   - **TTL/Ablauf**: unbegrenzt?
4. Mir die Angaben schicken (nur Name und Rechte, **nie den Schlüssel selbst**).
5. Bewertung: «Object Read & Write» nur für «fotikiste» = vertretbar für die Übergangszeit. «Admin» oder «All buckets» = dringend ersetzen (Teil B).

### A4 Inhalt des Buckets ansehen (nur lesen) – für E5
1. **R2 Object Storage → fotikiste** öffnen. Du siehst Ordner (je Veranstaltung) mit Dateien.
2. Anzahl Ordner/Dateien und Datum notieren. Einzelne Bilder anklicken → sind es Testbilder oder Fotos echter Gäste?
3. Ergebnis mir mitteilen → damit beantworten wir E5.

### A5 Öffentlichen Zugang ansehen (nur lesen)
1. Im Bucket **«Settings»** → Abschnitt **«Public access»** bzw. **«R2.dev subdomain»**.
2. Erwartet heute: «Allowed». Noch **nicht** ändern (sonst funktionieren bestehende QR-Codes nicht mehr).

### A6 Betreiber-PIN der Fotobox ändern (am Pi)
1. Am Pi Namen oben 3 s gedrückt halten → «Betrieb (Vermieter)» → PIN **1234**.
2. Bereich **«Sicherheit»** → neue PIN (mind. 6 Ziffern, nicht Geburtsdatum) → speichern.
3. Erwartet: Die rote Warnung «Standard-PIN aktiv» verschwindet. PIN an einem sicheren Ort notieren (nicht auf die Box kleben).

## Teil B – nach deiner Bestätigung von E5 (ich begleite dich)
| Schritt | Wirkung | Rückgängig? |
|---|---|---|
| B1 Neuen eingeschränkten Token «fotobox-pi-2» (Object Read & Write, nur «fotikiste», mit Ablaufdatum) erstellen und am Pi eintragen, danach alten Token löschen | Schlüsselrotation | Token-Löschung nicht rückgängig, aber jederzeit neuer Token möglich |
| B2 Lifecycle-Regel «Objekte älter als 30 Tage löschen» | automatische Löschung | Regel ja, gelöschte Bilder nein |
| B3 Laptop-Token löschen, falls nicht mehr gebraucht | weniger Angriffsfläche | nein |
| B4 r2.dev deaktivieren, sobald die Plattform-Galerie läuft | keine öffentlichen Links mehr | ja (wieder einschalten) |

## Teil C – für die Plattform (Phase 2/5, ich bereite alles vor)
- Cloudflare **Zero Trust** einrichten (Free-Plan, ohne Zahlungsmittel wenn möglich), Access-Anwendung für `/admin` und `/api/admin`, Regel «nur deine E-Mail», Anmeldung über Google oder GitHub mit **aktivierter 2FA**.
- **Alternative Adressen:** Die Plattform wird so konfiguriert, dass `*.workers.dev`- und Vorschau-Adressen **ausgeschaltet** sind (`workers_dev: false`, `preview_urls: false`). Zusätzlich prüft der Worker bei jedem Admin-Aufruf die Signatur des Access-Tokens selbst – ohne gültiges Token gibt es `403`, egal über welche Adresse.
- Neuer privater Bucket `fotikaste-fotos` (EU), eigener Schlüssel nur für vorsignierte URLs, als `wrangler secret` gespeichert, Rotation alle 12 Monate (Erinnerung im Admin).
