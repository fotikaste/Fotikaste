# Geräte-API (Entwurf v1)

Stand: 2026-11-26 · **umgesetzt in Phase 5** (siehe Abschnitt «Umsetzung»; vorsignierte URLs ersetzt durch Upload durch den Worker, ADR-031). Basis: `https://<domain>/api/device/v1` · nur HTTPS · JSON.

## Authentifizierung
`Authorization: Bearer <geraete-token>` – Token wird einmalig bei der Registrierung im Admin angezeigt (danach nie mehr),
in der DB nur als Hash gespeichert, jederzeit widerrufbar. Rate Limit pro Gerät.

## Endpunkte
| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/config` | Aktuelle Event-Konfiguration des Geräts (Event-ID, Name, Namen, Datum, Rahmen, Download an/aus, Token-Gültigkeit, Kontingent). `ETag` für «nichts geändert». |
| `POST` | `/heartbeat` | Softwareversion, Zähler (Fotos, Drucke), Warteschlangenlänge, letzte Fehler (gekürzt). Antwort: Serverzeit. |
| `POST` | `/uploads` | Upload anmelden: `{event_id, client_photo_id, sha256, bytes, taken_at, access_token_hash?}` → `{photo_id, upload_url, expires_at}` oder `{photo_id, already_uploaded: true}` |
| `POST` | `/uploads/{photo_id}/complete` | Upload abschliessen; Server prüft Objekt, Grösse, Prüfsumme |

## Fehler
`401` Token ungültig/widerrufen · `403` Event nicht diesem Gerät zugewiesen oder geschlossen · `409` gleiche `client_photo_id` mit anderer Prüfsumme · `413` zu gross · `429` zu viele Anfragen · `507` Speichergrenze erreicht (Fotobox behält Foto in der Warteschlange und versucht es später).

## Ergänzungen Version 2 (Cloudflare)
- `POST /uploads` liefert **drei** vorsignierte URLs (Original optional je nach Event-Einstellung, Web ca. 1600 px, Vorschau ca. 400 px); die Fotobox erzeugt die Varianten mit Pillow.
- Gäste-Download läuft durch den Worker (Token-Prüfung, Rate-Limit), der die Datei aus dem privaten Bucket streamt.
Der Pi wiederholt bei `5xx`/Netzwerkfehlern mit wachsendem Abstand; bei `4xx` (ausser 429) nicht automatisch.

## Gäste-Endpunkte (Web)
`GET /f/{token}` – Seite mit Foto und Download (vorsignierter Link, kurz gültig) oder «noch unterwegs» / «abgelaufen».

## Umsetzung Phase 5 (verbindlich)
| Methode | Pfad | Inhalt |
|---|---|---|
| GET | `/config` | `{geraet, event|null, bild:{lange_seite_px, jpeg_qualitaet, vorschau_px}, grenzen, galerie_tage, serverzeit}` |
| POST | `/heartbeat` | `{version, warteschlange, zaehler, fehler}` |
| POST | `/uploads` | `{event_id|null, client_photo_id, token_hash, taken_at, web:{bytes,sha256}, thumb:{bytes,sha256}}` → 201 `{photo_id, fehlend}` · 200 `{fertig:true}` |
| PUT | `/uploads/{photo_id}/web` bzw. `/thumb` | JPEG-Rohdaten; Grösse und SHA-256 müssen zur Anmeldung passen → `{fertig}` |
Fehler: 401 Token · 409 kein/anderes Event, anderer Inhalt · 410 Event geschlossen/gelöscht · 400 Grösse/Prüfsumme · 415 kein JPEG · 507 Speichergrenze · 429.
