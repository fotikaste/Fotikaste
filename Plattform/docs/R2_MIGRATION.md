# Sicherheitsanalyse und Migration der Online-Galerie

Stand: 2026-11-25 · **An der produktiven Fotobox wird nichts verändert, bevor du ausdrücklich zustimmst.**

## 1. Ist-Zustand (geprüft am Laptop, nur gelesen)
| Punkt | Befund | Quelle |
|---|---|---|
| Speicher | Bucket «fotikiste», EU, Konto-ID im Code hinterlegt | `System/daten/fotobox.db` (Einstellungen) |
| Öffentlicher Zugang | **r2.dev-Adresse aktiv**: `https://pub-….r2.dev/<veranstaltung>/<zufall>.jpg` | Einstellung `r2_oeffentliche_url` |
| Schlüssel am Laptop | Access Key ID + Secret **im Klartext** in SQLite (nicht in Git, `.gitignore` greift) | Einstellungen `r2_zugangs_id`, `r2_geheimnis` |
| Schlüssel am Pi | eigener Token «fotobox-pi», ebenfalls im Klartext in der Pi-Datenbank (laut Übergabe) | `UEBERGABE_NEUER_CHAT.md` |
| Rechte der Tokens | **nicht prüfbar von hier** – im Cloudflare-Dashboard nachsehen (siehe Schritt 0) | – |
| Hochgeladene Bilder | Laptop: 7 Uploads Status «online» (Testbilder); Pi: Testfotos vom 17.11. | Tabelle `uploads` |
| Lifecycle «30 Tage löschen» | offen, laut `AUFGABEN.md` nicht bestätigt | `Dokumente/AUFGABEN.md` |
| Echte Kundenfotos | laut Übergabe **noch keine Vermietung** → nur Testbilder (bitte bestätigen) | – |

## 2. Risiken
| Risiko | Schwere | Erklärung |
|---|---|---|
| Diebstahl der Fotobox oder SD-Karte | **hoch** | Wer die Karte ausliest, hat einen R2-Schlüssel. Mit «Object Read & Write» kann er **alle** Fotos im Bucket lesen, überschreiben und löschen. Mit einem Admin-Token sogar mehr. |
| Öffentliche Links ohne Ablauf | mittel | Wer einen Link hat (weitergeleitet, im Browserverlauf), sieht das Foto, bis es gelöscht wird. Nicht erratbar (128 Bit), aber nicht widerrufbar. |
| Keine automatische Löschung | mittel | Ohne Lifecycle-Regel bleiben Fotos unbegrenzt → Datenschutz und Speicherkosten. |
| r2.dev gedrosselt | niedrig | laut Cloudflare nur für Entwicklung. |
| Schlüssel am Laptop | mittel | Laptop-Diebstahl = gleicher Effekt wie oben. |

## 3. Zielzustand
- Neuer Bucket **`fotikaste-fotos`** (EU-Jurisdiktion), **ohne** r2.dev und ohne öffentliche Domain.
- Die Fotobox hat **keinen R2-Schlüssel** mehr, nur noch ein **Geräte-Token** der Plattform: darf nur Uploads für das ihr zugewiesene,
  aktive Event anmelden. Kein Lesen, kein Auflisten, kein Löschen. Im Admin mit einem Klick widerrufbar.
- Uploads per vorsignierter URL (5 min gültig, genau ein Dateipfad).
- Gäste sehen Fotos nur über die Plattform (`/f/<token>`), die bei jedem Abruf Token, Ablauf und Event-Status prüft.
- Der R2-Schlüssel der Plattform liegt nur als verschlüsseltes Geheimnis im Worker (`wrangler secret`), nie im Code.

## 4. Migrationsplan
| Schritt | Was | Wer | Fotobox betroffen? |
|---|---|---|---|
| **0 – Sofort, nur ansehen** | `CLOUDFLARE_SICHERHEIT.md` Teil A: Budgetwarnung, Abo prüfen, Token-Rechte und Bucket-Inhalt **ansehen**, PIN ändern. **Nichts löschen** (E5 offen). Rotation/Lifecycle erst in Teil B nach E5. | du (ich erkläre jeden Klick) | nur PIN |
| 1 – Plattform-Grundlage | Worker mit Geräte-API, privater Bucket, Geräte-Tokens, Simulator, Tests | ich | nein |
| 2 – Fotobox-Erweiterung | Neue Klasse `PlattformGalerie` in `galerie.py` **zusätzlich** zu Simuliert/R2 (Auswahl auf der Betriebsseite); Vorschaubilder mit Pillow; Geräte-Token-Feld; neue Tests. Bestehende Funktionen bleiben, 85 bestehende Tests müssen grün bleiben. | ich, am Laptop | nein (nur Laptop) |
| 3 – Test am Laptop | Laptop-Fotobox gegen lokale Plattform (`wrangler dev`) und Simulator | ich | nein |
| **4 – Freigabe** | Du gibst das Update für den Pi frei | du | – |
| 5 – Pi umstellen | Update per USB-Stick, Geräte-Token eintragen, auf «Plattform» umschalten, Testfoto mit Handy | du + ich | ja, nach Freigabe |
| 6 – Alte Schlüssel weg | R2-Tokens «fotobox-pi» und Laptop-Token **in Cloudflare löschen** (Rotation abgeschlossen), Einstellungen `r2_zugangs_id`/`r2_geheimnis` auf beiden Geräten leeren | du + ich | ja |
| 7 – Alten Bucket schliessen | r2.dev-Zugang von «fotikiste» deaktivieren und Bucket nach Ablauf leeren/löschen | du | nein |

## 5. Bestehende QR-Codes und Galerien
- Bisher wurden laut Unterlagen nur **Testbilder** hochgeladen → Links dürfen ungültig werden. Bitte bestätigen (Entscheid E5).
- Falls doch echte Gäste-Links existieren: r2.dev bleibt bis zum Ablauf der zugesagten Frist (30 Tage) aktiv, erst dann Schritt 7.
- Neue QR-Codes zeigen auf `https://<domain>/f/<token>`. Diese Adresse bleibt auch bei einem späteren Speicherwechsel gleich.
- Bis eine Domain existiert, verwenden Tests die kostenlose `*.workers.dev`-Adresse (nicht für echte Gäste).

## 6. Weitere Punkte am Pi (nicht Teil der Migration, aber sicherheitsrelevant)
- Betreiber-PIN ist laut Übergabe noch **1234** → vor erster Vermietung ändern.
- Geräte-Token liegt auf dem Pi zwangsläufig im Klartext; sein Schaden bei Diebstahl ist durch die engen Rechte begrenzt und er wird im Admin widerrufen.
