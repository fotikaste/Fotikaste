/**
 * Fotos im privaten Speicher (R2) – Geräte-Anmeldung, Upload-Prüfung, Löschen.
 * Die Fotobox besitzt KEINEN Speicherschlüssel, nur ein Geräte-Token. Sie darf ausschliesslich Fotos
 * für das ihr zugewiesene Event hochladen – kein Lesen, kein Auflisten, kein Löschen.
 */
import type { Env } from "../env";
import { protokolliere } from "./audit";
import { heuteZurich } from "./datum";
import { fehler } from "./http";
import { sha256, zufallsId } from "./id";
import { bestaetige, gibFrei, istGesperrt, reserviere, speicherFrei, zaehle } from "./usage";

export const TOKEN_MUSTER = /^[A-Za-z0-9_-]{22,64}$/;
const HEX64 = /^[0-9a-f]{64}$/;

/** Zentrale Prüfung des Geräte-Tokens (Authorization: Bearer …). */
export async function verlangeGeraet(request: Request, env: Env, jetzt = new Date()): Promise<{ deviceId: string; name: string } | Response> {
  const m = (request.headers.get("Authorization") ?? "").match(/^Bearer ([A-Za-z0-9_-]{32,128})$/);
  if (!m) return fehler(401, "token", "Geräte-Token fehlt oder ungültig.");
  const d = await env.DB.prepare(
    `SELECT d.id, d.name FROM device_tokens t JOIN devices d ON d.id = t.device_id
     WHERE t.token_hash = ?1 AND t.revoked_at IS NULL AND d.active = 1`,
  ).bind(await sha256(m[1]!)).first<{ id: string; name: string }>();
  if (!d) return fehler(401, "token", "Geräte-Token fehlt oder ungültig.");
  await env.DB.prepare("UPDATE devices SET last_seen_at = ?2 WHERE id = ?1").bind(d.id, jetzt.toISOString()).run();
  return { deviceId: d.id, name: d.name };
}

/** Neues Geräte-Token (wird genau einmal angezeigt). */
export async function neuesGeraeteToken(env: Env, deviceId: string): Promise<string> {
  const token = zufallsId(32); // 256 Bit, 64 Hex-Zeichen
  await env.DB.prepare("INSERT INTO device_tokens (token_hash, device_id) VALUES (?1, ?2)").bind(await sha256(token), deviceId).run();
  return token;
}

export const schluessel = (eventId: string, photoId: string, variante: "web" | "thumb") => `events/${eventId}/${photoId}-${variante}.jpg`;

export interface Anmeldung {
  event_id: string | null;
  client_photo_id: string;
  token_hash: string;
  taken_at: string | null;
  web: { bytes: number; sha256: string };
  thumb: { bytes: number; sha256: string };
}

export function leseAnmeldung(x: unknown, maxWeb: number, maxThumb: number): Anmeldung | string {
  const o = (x ?? {}) as Record<string, unknown>;
  const v = (k: string) => (o[k] ?? {}) as { bytes?: unknown; sha256?: unknown };
  if (o.event_id !== null && o.event_id !== undefined && !(typeof o.event_id === "string" && /^[0-9a-f]{32}$/.test(o.event_id))) return "event_id ungültig";
  if (typeof o.client_photo_id !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(o.client_photo_id)) return "client_photo_id ungültig";
  if (typeof o.token_hash !== "string" || !HEX64.test(o.token_hash)) return "token_hash ungültig";
  const taken = typeof o.taken_at === "string" && !Number.isNaN(Date.parse(o.taken_at)) ? new Date(o.taken_at).toISOString() : null;
  for (const [k, max] of [["web", maxWeb], ["thumb", maxThumb]] as const) {
    const b = v(k).bytes;
    if (!(Number.isInteger(b) && (b as number) > 0 && (b as number) <= max)) return `${k}.bytes ungültig (höchstens ${max})`;
    if (typeof v(k).sha256 !== "string" || !HEX64.test(v(k).sha256 as string)) return `${k}.sha256 ungültig`;
  }
  return {
    event_id: (o.event_id as string | undefined) ?? null, client_photo_id: o.client_photo_id, token_hash: o.token_hash, taken_at: taken,
    web: { bytes: v("web").bytes as number, sha256: v("web").sha256 as string },
    thumb: { bytes: v("thumb").bytes as number, sha256: v("thumb").sha256 as string },
  };
}

export interface Foto {
  id: string; event_id: string; device_id: string; status: string; web_key: string; thumb_key: string; web_bytes: number; thumb_bytes: number;
  web_sha256: string; thumb_sha256: string; web_ok: number; thumb_ok: number; reservation_id: string | null; token_hash: string; client_photo_id: string;
}

type Fehlerantwort = { status: number; code: string; text: string };
const f = (status: number, code: string, text: string): Fehlerantwort => ({ status, code, text });

/** Upload anmelden. Gleiches client_photo_id → bestehender Eintrag (keine Doppelten). Speicher wird vorher reserviert. */
export async function meldeAn(env: Env, deviceId: string, a: Anmeldung, jetzt = new Date()): Promise<{ photo_id: string; fehlend: ("web" | "thumb")[]; fertig: boolean } | Fehlerantwort> {
  const vorhanden = await env.DB.prepare("SELECT * FROM photos WHERE device_id = ?1 AND client_photo_id = ?2").bind(deviceId, a.client_photo_id).first<Foto>();
  if (vorhanden) {
    if (vorhanden.token_hash !== a.token_hash || vorhanden.web_sha256 !== a.web.sha256 || vorhanden.thumb_sha256 !== a.thumb.sha256) return f(409, "anders", "Dieses Foto wurde schon mit anderem Inhalt angemeldet.");
    if (vorhanden.status === "ready") return { photo_id: vorhanden.id, fehlend: [], fertig: true };
    if (vorhanden.status === "deleted") return f(410, "geloescht", "Dieses Foto wurde bereits gelöscht.");
    // Reservierung erneuern (kann während einer langen Offline-Phase abgelaufen sein)
    const neu = zufallsId();
    if (vorhanden.reservation_id) await gibFrei(env, vorhanden.reservation_id);
    if (!(await reserviere(env, neu, vorhanden.web_bytes + vorhanden.thumb_bytes, 3600, jetzt))) return f(507, "speicher_voll", "Speichergrenze erreicht. Die Fotobox behält das Foto und versucht es später.");
    await env.DB.prepare("UPDATE photos SET reservation_id = ?2 WHERE id = ?1").bind(vorhanden.id, neu).run();
    return { photo_id: vorhanden.id, fehlend: [...(vorhanden.web_ok ? [] : ["web" as const]), ...(vorhanden.thumb_ok ? [] : ["thumb" as const])], fertig: false };
  }

  // Zu welchem Event? Angegeben (muss diesem Gerät gehören und offen sein) oder das aktive Event des Geräts.
  const ev = a.event_id
    ? await env.DB.prepare("SELECT id, status, retention_until FROM events WHERE id = ?1 AND device_id = ?2").bind(a.event_id, deviceId).first<{ id: string; status: string; retention_until: string }>()
    : await env.DB.prepare("SELECT id, status, retention_until FROM events WHERE device_id = ?1 AND status = 'active'").bind(deviceId).first<{ id: string; status: string; retention_until: string }>();
  if (!ev) return f(409, "kein_event", "Diesem Gerät ist kein passendes Event zugewiesen.");
  if (ev.status === "archived" || ev.retention_until < heuteZurich(jetzt)) return f(410, "event_geschlossen", "Die Galerie dieses Events ist geschlossen.");
  if (await env.DB.prepare("SELECT 1 FROM photos WHERE token_hash = ?1").bind(a.token_hash).first()) return f(409, "token_doppelt", "Dieser Gäste-Link ist schon vergeben.");
  if (await istGesperrt(env, "r2_class_a", jetzt)) return f(507, "kontingent", "Schreibkontingent fast erreicht. Die Fotobox versucht es später.");

  const id = zufallsId();
  const res = zufallsId();
  if (!(await reserviere(env, res, a.web.bytes + a.thumb.bytes, 3600, jetzt))) return f(507, "speicher_voll", "Speichergrenze erreicht. Die Fotobox behält das Foto und versucht es später.");
  try {
    await env.DB.prepare(
      `INSERT INTO photos (id, event_id, device_id, client_photo_id, token_hash, web_key, thumb_key, web_bytes, thumb_bytes, web_sha256, thumb_sha256, reservation_id, taken_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
    ).bind(id, ev.id, deviceId, a.client_photo_id, a.token_hash, schluessel(ev.id, id, "web"), schluessel(ev.id, id, "thumb"), a.web.bytes, a.thumb.bytes, a.web.sha256, a.thumb.sha256, res, a.taken_at).run();
  } catch (e) {
    await gibFrei(env, res);
    if (String(e).includes("UNIQUE")) return f(409, "doppelt", "Gleichzeitige Anmeldung desselben Fotos – bitte erneut versuchen.");
    throw e;
  }
  return { photo_id: id, fehlend: ["web", "thumb"], fertig: false };
}

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

/** Eine Variante hochladen: Grösse und Prüfsumme müssen zur Anmeldung passen, erst dann wird gespeichert. */
export async function ladeHoch(env: Env, deviceId: string, photoId: string, variante: "web" | "thumb", body: ArrayBuffer, jetzt = new Date()): Promise<{ fertig: boolean } | Fehlerantwort> {
  const p = await env.DB.prepare("SELECT * FROM photos WHERE id = ?1 AND device_id = ?2").bind(photoId, deviceId).first<Foto>();
  if (!p) return f(404, "unbekannt", "Dieses Foto gibt es nicht.");
  if (p.status === "ready") return { fertig: true };
  if (p.status !== "pending") return f(410, "geloescht", "Dieses Foto wurde gelöscht.");
  const erwartet = variante === "web" ? { bytes: p.web_bytes, sha: p.web_sha256, key: p.web_key } : { bytes: p.thumb_bytes, sha: p.thumb_sha256, key: p.thumb_key };
  if (body.byteLength !== erwartet.bytes) return f(400, "groesse", "Die Dateigrösse passt nicht zur Anmeldung.");
  if (hex(await crypto.subtle.digest("SHA-256", body)) !== erwartet.sha) return f(400, "pruefsumme", "Die Prüfsumme passt nicht zur Anmeldung.");
  const b = new Uint8Array(body);
  if (!(b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)) return f(415, "format", "Nur JPEG-Bilder.");
  if (!p.reservation_id) return f(409, "keine_reservierung", "Bitte das Foto neu anmelden.");
  await env.PHOTOS.put(erwartet.key, body, { httpMetadata: { contentType: "image/jpeg" }, sha256: erwartet.sha });
  await zaehle(env, "r2_class_a", 1, jetzt);
  await env.DB.prepare(`UPDATE photos SET ${variante === "web" ? "web_ok" : "thumb_ok"} = 1 WHERE id = ?1`).bind(photoId).run();
  const jetztFoto = await env.DB.prepare("SELECT web_ok, thumb_ok, reservation_id FROM photos WHERE id = ?1").bind(photoId).first<{ web_ok: number; thumb_ok: number; reservation_id: string | null }>();
  if (!(jetztFoto?.web_ok && jetztFoto.thumb_ok)) return { fertig: false };
  // Beide Varianten da → Reservierung in belegten Speicher umwandeln (tatsächliche Grösse ≤ reserviert)
  if (!(await bestaetige(env, jetztFoto.reservation_id!, p.web_bytes + p.thumb_bytes, jetzt))) {
    // Reservierung abgelaufen: neu reservieren; scheitert das, Objekte löschen (Speichergrenze)
    const neu = zufallsId();
    if (!(await reserviere(env, neu, p.web_bytes + p.thumb_bytes, 60, jetzt)) || !(await bestaetige(env, neu, p.web_bytes + p.thumb_bytes, jetzt))) {
      await env.PHOTOS.delete([p.web_key, p.thumb_key]);
      await env.DB.prepare("UPDATE photos SET web_ok = 0, thumb_ok = 0, reservation_id = NULL WHERE id = ?1").bind(photoId).run();
      return f(507, "speicher_voll", "Speichergrenze erreicht. Die Fotobox behält das Foto und versucht es später.");
    }
  }
  await env.DB.prepare("UPDATE photos SET status = 'ready', ready_at = ?2, reservation_id = NULL WHERE id = ?1").bind(photoId, jetzt.toISOString()).run();
  return { fertig: true };
}

/** Fotos endgültig löschen (R2 + Speicherzähler). Gibt die Anzahl gelöschter Fotos zurück. */
export async function loescheFotos(env: Env, where: string, params: unknown[], actor: string, grund: string, max = 500): Promise<number> {
  const r = await env.DB.prepare(`SELECT id, event_id, web_key, thumb_key, web_bytes, thumb_bytes, status, reservation_id FROM photos WHERE status != 'deleted' AND ${where} LIMIT ${max}`)
    .bind(...params).all<Foto>();
  if (r.results.length === 0) return 0;
  await env.PHOTOS.delete(r.results.flatMap((p) => [p.web_key, p.thumb_key]));
  let frei = 0;
  for (const p of r.results) {
    if (p.status === "ready") frei += p.web_bytes + p.thumb_bytes;
    if (p.reservation_id) await gibFrei(env, p.reservation_id);
  }
  await env.DB.batch(r.results.map((p) => env.DB.prepare("UPDATE photos SET status = 'deleted', deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), reservation_id = NULL WHERE id = ?1").bind(p.id)));
  if (frei) await speicherFrei(env, frei);
  await protokolliere(env, actor, "fotos.geloescht", r.results[0]!.event_id, { anzahl: r.results.length, grund });
  return r.results.length;
}
