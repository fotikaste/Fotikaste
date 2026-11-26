/**
 * Geräte-API für die Fotobox: /api/device/v1/…  (Authorization: Bearer <Geräte-Token>)
 * Kein Cookie → keine CSRF-Gefahr; darum ist die Herkunftsprüfung für diese Pfade in index.ts ausgenommen.
 */
import type { Env } from "../env";
import { einstellungen } from "../lib/buchung";
import { leseAnmeldung, ladeHoch, meldeAn, verlangeGeraet } from "../lib/fotos";
import { fehler, json } from "../lib/http";
import { begrenze } from "../lib/ratelimit";

const zahl = (s: Record<string, unknown>, k: string, std: number) => (typeof s[k] === "number" ? (s[k] as number) : std);

export async function geraeteRoute(request: Request, env: Env, pfad: string): Promise<Response | null> {
  if (!pfad.startsWith("/api/device/v1/")) return null;
  const g = await verlangeGeraet(request, env);
  if (g instanceof Response) return g;
  if (!(await begrenze(env, `geraet:${g.deviceId}`, 1200, 3600)).erlaubt) return fehler(429, "zu_viele", "Zu viele Anfragen.");
  const m = request.method;

  if (pfad === "/api/device/v1/config" && m === "GET") {
    const s = await einstellungen(env);
    const ev = await env.DB.prepare("SELECT id, name, event_day, retention_until FROM events WHERE device_id = ?1 AND status = 'active'").bind(g.deviceId).first();
    return json({
      geraet: { id: g.deviceId, name: g.name },
      event: ev ?? null,
      bild: { lange_seite_px: zahl(s, "image_long_edge_px", 2400), jpeg_qualitaet: zahl(s, "image_jpeg_quality", 85), vorschau_px: 400 },
      grenzen: { web_bytes: zahl(s, "photo_max_bytes", 8_000_000), vorschau_bytes: zahl(s, "thumb_max_bytes", 400_000) },
      galerie_tage: zahl(s, "gallery_retention_days", 30),
      serverzeit: new Date().toISOString(),
    });
  }

  if (pfad === "/api/device/v1/heartbeat" && m === "POST") {
    const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const version = typeof b?.version === "string" ? b.version.slice(0, 40) : null;
    const bericht = b ? JSON.stringify({ zaehler: b.zaehler ?? null, warteschlange: Number(b.warteschlange) || 0, fehler: typeof b.fehler === "string" ? b.fehler.slice(0, 300) : null }) : null;
    await env.DB.prepare("UPDATE devices SET software_version = ?2, last_report = ?3 WHERE id = ?1").bind(g.deviceId, version, bericht).run();
    return json({ ok: true, serverzeit: new Date().toISOString() });
  }

  if (pfad === "/api/device/v1/uploads" && m === "POST") {
    const s = await einstellungen(env);
    const a = leseAnmeldung(await request.json().catch(() => null), zahl(s, "photo_max_bytes", 8_000_000), zahl(s, "thumb_max_bytes", 400_000));
    if (typeof a === "string") return fehler(400, "anmeldung", a);
    const r = await meldeAn(env, g.deviceId, a);
    return "code" in r ? fehler(r.status, r.code, r.text) : json(r, r.fertig ? 200 : 201);
  }

  const put = pfad.match(/^\/api\/device\/v1\/uploads\/([0-9a-f]{32})\/(web|thumb)$/);
  if (put && m === "PUT") {
    const laenge = Number(request.headers.get("Content-Length"));
    if (!Number.isFinite(laenge) || laenge <= 0 || laenge > 8_000_000) return fehler(413, "zu_gross", "Datei fehlt oder ist zu gross.");
    const r = await ladeHoch(env, g.deviceId, put[1]!, put[2] as "web" | "thumb", await request.arrayBuffer());
    return "code" in r ? fehler(r.status, r.code, r.text) : json(r);
  }

  return fehler(404, "nicht_gefunden", "Diese Adresse gibt es nicht.");
}
