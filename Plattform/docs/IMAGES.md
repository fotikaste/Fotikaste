# Bildverarbeitung für die Online-Galerie (E4)

Stand: 2026-11-25 · Grundsatz: **Originale bleiben auf dem Raspberry Pi.** Online liegen nur optimierte Bilder.

## Pipeline (läuft auf der Fotobox, Pillow, offline-fähig)
1. Original von der Kamera bleibt unverändert lokal (wie bisher).
2. Galeriebild: Drehung nach EXIF anwenden → auf **Längskante 2400 px** verkleinern (Lanczos) → RGB → JPEG **Qualität 85**, progressiv, optimiert.
3. Vorschaubild: **480 px, Qualität 80**.
4. Postkarte (bestehend, 1800×1200) optional als eigene Datei.
5. **Metadaten entfernen:** gespeichert wird ohne EXIF (keine Kamera-Seriennummer, keine Aufnahmezeit, kein GPS), kein XMP/IPTC.
6. Alle Werte im Admin pro Event einstellbar (Kante 1600–3000, Qualität 70–95), Standard wie oben.
7. Originale auf Kundenwunsch: Export auf USB-Stick (vorhanden) oder befristeter Einzel-Upload für dieses Event (zählt gegen die Speichergrenze).

## Test mit echten Fotos (2026-11-25)
Werkzeug: `Plattform/tools/bildtest/bildtest.py`. 4 Originale der Canon EOS 600D (5184×3456, 6.0–6.5 MB, Innenraum, Kunstlicht) + 1 Postkarte.
Gemessen wird nur der Kompressionsverlust (Vergleich mit derselben Auflösung ohne JPEG-Verlust).
PSNR > 40 dB und SSIM > 0.99 gelten allgemein als sehr gute Qualität.

| Längskante | Qualität | Grösse (Ø der 4 Fotos) | PSNR | SSIM |
|---|---|---|---|---|
| 2400 | 92 | 805 KB | 42.5–43.1 dB | 0.9965–0.9977 |
| 2400 | 88 | 467 KB | 40.5–41.5 | 0.9959–0.9973 |
| **2400** | **85** | **387 KB** | **40.1–41.1** | **0.9952–0.9969** |
| 2400 | 78 | 283 KB | 39.2–40.3 | 0.9939–0.9960 |
| 2048 | 85 | 279 KB | 39.8–41.1 | 0.9945–0.9964 |
| 1600 | 85 | 168 KB | 39.4–41.0 | 0.9915–0.9949 |
| Vorschau 480 | 80 | 10–20 KB | – | – |

- **EXIF:** In allen Ausgaben 0 Einträge (Originale hatten Kamera- und Zeitdaten; GPS hatten sie keine).
- **Sichtprüfung:** 100-%-Ausschnitt 2400 px unkomprimiert vs. q85 vs. q78 → kein sichtbarer Unterschied erkennbar.
- **Einschränkung:** Testfotos zeigen Gegenstände, keine Gesichter/Hauttöne, keine dunklen Partyszenen. Wiederholen mit Fotos vom ersten echten Testevent.
- Der Sprung bei q92 kommt von voller Farbauflösung (4:4:4); ab q < 90 wird 4:2:0 verwendet.

## Entscheid (vorläufig)
**2400 px / q85 / 4:2:0** ≈ 0.4 MB statt 6 MB (−94 %). Reicht für Bildschirm, Social Media und Abzüge bis ca. 13×18 cm.
Speicher pro Event (400 Fotos × (0.4 + 0.02 + 0.22 Postkarte)) ≈ **0.26 GB** → 8 GB reichen für rund 30 gleichzeitig gespeicherte Events.

## Aufbewahrung
Standard 30 Tage online (pro Event einstellbar). Kunde erhält Hinweis-Mails **7 Tage und 1 Tag vor Löschung**. Täglicher Cron löscht
abgelaufene Bilder in R2 und markiert sie in D1; zusätzlich R2-Lifecycle-Regel als Sicherheitsnetz (z. B. 120 Tage).

## Webseitenbilder (nicht Galerie)
Symbolbilder der Webseite: KI-generiert, gekennzeichnet, siehe `DECISIONS.md` ADR-022. Umwandlung mit `tools/bilder/optimieren.py`
(WebP q80 in 480/800/1200/1600 px, JPEG-Rückfall 1200 px q82, ohne Metadaten). Einbindung über `src/components/Picture.astro`
(srcset/sizes, feste width/height, Hero-Bilder mit `fetchpriority="high"`, übrige `loading="lazy"`).
