/**
 * Admin: Geräte (Fotoboxen) und Events mit Galerie (Phase 5). Recht «devices:manage» (Eigentümer, Administrator).
 * Geräte-Token wird genau einmal angezeigt. Ein Gerät kann höchstens ein aktives Event haben.
 */
import type { Env } from "../env";
import type { AdminUser } from "../lib/auth";
import { protokolliere } from "../lib/audit";
import { datumCh, einstellungen, type Fehler } from "../lib/buchung";
import { istTag, plusTage } from "../lib/datum";
import { loescheFotos, neuesGeraeteToken } from "../lib/fotos";
import { esc } from "../lib/http";
import { zufallsId } from "../lib/id";
import { zaehle } from "../lib/usage";
import { rahmen, zeit } from "./layout";

const f = (status: number, code: string, text: string): Fehler => ({ status, code, text });
const EVSTATUS: Record<string, string> = { planned: "geplant", active: "aktiv (Uploads)", closed: "abgeschlossen", archived: "archiviert" };
const MB = (b: number) => `${(b / 1e6).toLocaleString("de-CH", { maximumFractionDigits: 1 })} MB`;

// ---------------- Geräte ----------------
export async function geraeteSeite(env: Env, u: AdminUser, url: URL, neuesToken?: { name: string; token: string }): Promise<string> {
  const g = await env.DB.prepare(
    `SELECT d.*, (SELECT COUNT(*) FROM device_tokens t WHERE t.device_id = d.id AND t.revoked_at IS NULL) AS tokens,
       (SELECT name FROM events e WHERE e.device_id = d.id AND e.status = 'active') AS aktiv
     FROM devices d ORDER BY d.created_at`,
  ).all<{ id: string; name: string; active: number; last_seen_at: string | null; software_version: string | null; last_report: string | null; tokens: number; aktiv: string | null }>();
  const zeilen = g.results.map((d) => {
    const r = d.last_report ? (JSON.parse(d.last_report) as { warteschlange?: number; fehler?: string | null }) : null;
    return `<tr><td><b>${esc(d.name)}</b>${d.active ? "" : ' <span class="pill rot">deaktiviert</span>'}<br><span class="klein">Version ${esc(d.software_version ?? "–")}</span></td>
    <td>${esc(zeit(d.last_seen_at))}${r ? `<br><span class="klein">Warteschlange: ${r.warteschlange ?? 0}${r.fehler ? ` · letzter Fehler: ${esc(r.fehler)}` : ""}</span>` : ""}</td>
    <td>${esc(d.aktiv ?? "–")}</td><td class="zahl">${d.tokens}</td>
    <td><form class="zeile" method="post" action="/admin/geraete/${esc(d.id)}/token"><button>Neues Token</button></form>
      <form class="zeile" method="post" action="/admin/geraete/${esc(d.id)}/widerrufen"><button class="gefahr">Alle Tokens widerrufen</button></form></td></tr>`;
  }).join("");
  const inhalt = `${neuesToken ? `<div class="hinweis" role="alert"><strong>Geräte-Token für «${esc(neuesToken.name)}» – wird nur jetzt angezeigt:</strong>
<p><code style="font-size:1.05rem;word-break:break-all;user-select:all">${esc(neuesToken.token)}</code></p>
<p class="klein">Auf der Fotobox unter Betrieb → Online-Galerie → «Plattform» eintragen. Wer dieses Token hat, kann Fotos zum aktiven Event dieses Geräts hochladen – sonst nichts.
Bei Verlust oder Diebstahl der Fotobox hier sofort widerrufen.</p></div>` : ""}
<div class="scroll" tabindex="0" role="region" aria-label="Geräte"><table><thead><tr><th>Gerät</th><th>Zuletzt gesehen</th><th>Aktives Event</th><th class="zahl">Tokens</th><th>Aktion</th></tr></thead>
<tbody>${zeilen || '<tr><td colspan="5" class="klein">Noch keine Geräte.</td></tr>'}</tbody></table></div>
<h2>Neues Gerät</h2><form method="post" action="/admin/geraete"><div class="felder"><div><label for="gn">Name</label><input id="gn" name="name" required maxlength="60" placeholder="z. B. Fotobox 1"></div><div style="align-self:end"><button class="haupt">Anlegen und Token erzeugen</button></div></div></form>`;
  return rahmen(u, "Geräte", "/admin/geraete", inhalt, url);
}

export async function geraetAnlegen(env: Env, u: AdminUser, name: string): Promise<{ name: string; token: string } | Fehler> {
  if (name.length < 2 || name.length > 60) return f(400, "name", "Name 2–60 Zeichen.");
  // Gleicher Name = vermutlich doppelt abgeschickt (z. B. Seite neu geladen) → kein zweites Gerät
  if (await env.DB.prepare("SELECT 1 FROM devices WHERE name = ?1 COLLATE NOCASE").bind(name).first()) return f(409, "name", "Ein Gerät mit diesem Namen gibt es schon. Für ein neues Token beim Gerät «Neues Token» wählen.");
  const id = zufallsId();
  await env.DB.prepare("INSERT INTO devices (id, name) VALUES (?1, ?2)").bind(id, name).run();
  const token = await neuesGeraeteToken(env, id);
  await protokolliere(env, u.email, "geraet.angelegt", id, { name });
  return { name, token };
}

export async function geraetToken(env: Env, u: AdminUser, id: string): Promise<{ name: string; token: string } | Fehler> {
  const d = await env.DB.prepare("SELECT name FROM devices WHERE id = ?1").bind(id).first<{ name: string }>();
  if (!d) return f(404, "geraet", "Dieses Gerät gibt es nicht.");
  const token = await neuesGeraeteToken(env, id);
  await protokolliere(env, u.email, "geraet.token", id);
  return { name: d.name, token };
}

export async function geraetWiderrufen(env: Env, u: AdminUser, id: string): Promise<{ ok: true } | Fehler> {
  const r = await env.DB.prepare("UPDATE device_tokens SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE device_id = ?1 AND revoked_at IS NULL").bind(id).run();
  await protokolliere(env, u.email, "geraet.widerrufen", id, { tokens: r.meta.changes });
  return { ok: true };
}

// ---------------- Events ----------------
export async function eventsSeite(env: Env, u: AdminUser, url: URL): Promise<string> {
  const e = await env.DB.prepare(
    `SELECT e.id, e.name, e.event_day, e.status, e.retention_until, d.name AS geraet, b.number,
       (SELECT COUNT(*) FROM photos p WHERE p.event_id = e.id AND p.status = 'ready') AS fotos
     FROM events e LEFT JOIN devices d ON d.id = e.device_id LEFT JOIN bookings b ON b.id = e.booking_id ORDER BY e.event_day DESC LIMIT 200`,
  ).all<{ id: string; name: string; event_day: string; status: string; retention_until: string; geraet: string | null; number: string | null; fotos: number }>();
  const zeilen = e.results.map((x) => `<tr><td><a href="/admin/events/${esc(x.id)}"><b>${esc(x.name)}</b></a>${x.number ? `<br><span class="klein">${esc(x.number)}</span>` : ""}</td>
    <td>${esc(datumCh(x.event_day))}</td><td>${esc(EVSTATUS[x.status] ?? x.status)}</td><td>${esc(x.geraet ?? "–")}</td><td class="zahl">${x.fotos}</td><td>${esc(datumCh(x.retention_until))}</td></tr>`).join("");
  const inhalt = `<p class="klein">Ein Event entsteht aus einer Buchung (Buchungsdetail → «Event anlegen») oder hier ohne Buchung, z. B. für Tests.</p>
<div class="scroll" tabindex="0" role="region" aria-label="Events"><table><thead><tr><th>Event</th><th>Datum</th><th>Status</th><th>Gerät</th><th class="zahl">Fotos</th><th>Online bis</th></tr></thead>
<tbody>${zeilen || '<tr><td colspan="6" class="klein">Noch keine Events.</td></tr>'}</tbody></table></div>
<h2>Event ohne Buchung</h2>${await eventFormular(env, null, "", "")}`;
  return rahmen(u, "Events", "/admin/events", inhalt, url);
}

async function geraeteOptionen(env: Env, gewaehlt: string | null) {
  const g = await env.DB.prepare("SELECT id, name FROM devices WHERE active = 1 ORDER BY name").all<{ id: string; name: string }>();
  return `<option value="">– noch keins –</option>${g.results.map((d) => `<option value="${esc(d.id)}"${d.id === gewaehlt ? " selected" : ""}>${esc(d.name)}</option>`).join("")}`;
}

export async function eventFormular(env: Env, bookingId: string | null, name: string, tag: string): Promise<string> {
  return `<form method="post" action="/admin/events"><input type="hidden" name="buchung" value="${esc(bookingId ?? "")}"><div class="felder">
  <div><label for="en">Name der Galerie</label><input id="en" name="name" value="${esc(name)}" required maxlength="80"></div>
  <div><label for="ed">Eventtag</label><input id="ed" type="date" name="tag" value="${esc(tag)}" required></div>
  <div><label for="eg">Fotobox</label><select id="eg" name="geraet">${await geraeteOptionen(env, null)}</select></div>
  <div style="align-self:end"><button>Event anlegen</button></div></div></form>`;
}

export async function eventAnlegen(env: Env, u: AdminUser, form: Map<string, string>): Promise<{ id: string } | Fehler> {
  const name = form.get("name") ?? "";
  const tag = form.get("tag") ?? "";
  const buchung = form.get("buchung") || null;
  const geraet = form.get("geraet") || null;
  if (name.length < 2 || name.length > 80) return f(400, "name", "Name 2–80 Zeichen.");
  if (!istTag(tag)) return f(400, "tag", "Bitte ein gültiges Datum wählen.");
  if (buchung && !(await env.DB.prepare("SELECT 1 FROM bookings WHERE id = ?1 AND status IN ('confirmed','completed')").bind(buchung).first())) return f(400, "buchung", "Events nur zu bestätigten Buchungen.");
  if (buchung && (await env.DB.prepare("SELECT 1 FROM events WHERE booking_id = ?1").bind(buchung).first())) return f(409, "doppelt", "Zu dieser Buchung gibt es schon ein Event.");
  if (geraet && !(await env.DB.prepare("SELECT 1 FROM devices WHERE id = ?1 AND active = 1").bind(geraet).first())) return f(400, "geraet", "Unbekanntes Gerät.");
  const s = await einstellungen(env);
  const id = zufallsId();
  await env.DB.prepare("INSERT INTO events (id, booking_id, device_id, name, event_day, retention_until) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(id, buchung, geraet, name, tag, plusTage(tag, Number(s.gallery_retention_days ?? 30))).run();
  await protokolliere(env, u.email, "event.angelegt", id, { name, buchung, geraet });
  return { id };
}

export async function eventDetail(env: Env, u: AdminUser, id: string, url: URL): Promise<string | null> {
  const e = await env.DB.prepare("SELECT e.*, b.number, b.id AS bid FROM events e LEFT JOIN bookings b ON b.id = e.booking_id WHERE e.id = ?1").bind(id).first<Record<string, string | null>>();
  if (!e) return null;
  const fotos = await env.DB.prepare("SELECT id, status, taken_at, web_bytes, thumb_bytes FROM photos WHERE event_id = ?1 AND status != 'deleted' ORDER BY COALESCE(taken_at, created_at)").bind(id).all<{ id: string; status: string; taken_at: string | null; web_bytes: number; thumb_bytes: number }>();
  const fertig = fotos.results.filter((p) => p.status === "ready");
  const groesse = fertig.reduce((s, p) => s + p.web_bytes + p.thumb_bytes, 0);
  const b = `/admin/events/${esc(id)}`;
  const knopf = (ziel: string, text: string, klasse = "") => `<form class="zeile" method="post" action="${b}/${ziel}"><button${klasse ? ` class="${klasse}"` : ""}>${text}</button></form>`;
  const st = e.status!;
  const inhalt = `<p><span class="pill">${esc(EVSTATUS[st] ?? st)}</span> <span class="klein">${esc(datumCh(e.event_day!))} · online bis ${esc(datumCh(e.retention_until!))}${e.number ? ` · Buchung <a href="/admin/buchungen/${esc(e.bid)}">${esc(e.number)}</a>` : ""}</span></p>
<form method="post" action="${b}/geraet"><div class="felder"><div><label for="eg">Fotobox</label><select id="eg" name="geraet">${await geraeteOptionen(env, e.device_id ?? null)}</select></div><div style="align-self:end"><button>Zuweisen</button></div></div></form>
<div>${st === "planned" || st === "closed" ? knopf("aktivieren", "Aktivieren (Uploads an)", "haupt") : ""}${st === "active" ? knopf("schliessen", "Abschliessen (keine neuen Fotos)") : ""}${st !== "archived" ? knopf("archivieren", "Archivieren und alle Fotos löschen", "gefahr") : ""}</div>
<p class="klein">Aktiv: Die zugewiesene Fotobox lädt Fotos in dieses Event. Fotos, die offline entstanden sind, dürfen auch nach dem Abschliessen noch ankommen. Archivieren löscht alle Fotos endgültig.</p>
<h2>Fotos (${fertig.length}${fotos.results.length > fertig.length ? `, ${fotos.results.length - fertig.length} unterwegs` : ""} · ${MB(groesse)})</h2>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(9rem,1fr));gap:.5rem">${fertig.map((p) => `<a href="${b}/foto/${esc(p.id)}/web"><img src="${b}/foto/${esc(p.id)}/thumb" alt="Foto ${esc(zeit(p.taken_at))}" loading="lazy" style="width:100%;height:auto;border:1px solid var(--line)"></a>`).join("") || '<p class="klein">Noch keine Fotos.</p>'}</div>
<p><a href="/admin/events">← Alle Events</a></p>`;
  return rahmen(u, e.name!, "/admin/events", inhalt, url);
}

export async function eventStatus(env: Env, u: AdminUser, id: string, ziel: "active" | "closed" | "archived"): Promise<{ ok: true } | Fehler> {
  const e = await env.DB.prepare("SELECT status, device_id FROM events WHERE id = ?1").bind(id).first<{ status: string; device_id: string | null }>();
  if (!e) return f(404, "event", "Dieses Event gibt es nicht.");
  const erlaubt: Record<string, string[]> = { active: ["planned", "closed"], closed: ["active"], archived: ["planned", "active", "closed"] };
  if (!erlaubt[ziel]!.includes(e.status)) return f(409, "status", "Dieser Statuswechsel ist nicht möglich.");
  if (ziel === "active" && !e.device_id) return f(400, "geraet", "Bitte zuerst eine Fotobox zuweisen.");
  try {
    await env.DB.prepare("UPDATE events SET status = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1").bind(id, ziel).run();
  } catch (err) {
    if (String(err).includes("UNIQUE")) return f(409, "aktiv", "Diese Fotobox hat schon ein aktives Event. Bitte jenes zuerst abschliessen.");
    throw err;
  }
  if (ziel === "archived") await loescheFotos(env, "event_id = ?1", [id], u.email, "Event archiviert", 5000);
  await protokolliere(env, u.email, `event.${ziel}`, id);
  return { ok: true };
}

export async function eventGeraet(env: Env, u: AdminUser, id: string, geraet: string): Promise<{ ok: true } | Fehler> {
  if (geraet && !(await env.DB.prepare("SELECT 1 FROM devices WHERE id = ?1 AND active = 1").bind(geraet).first())) return f(400, "geraet", "Unbekanntes Gerät.");
  try {
    const r = await env.DB.prepare("UPDATE events SET device_id = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1 AND status != 'archived'").bind(id, geraet || null).run();
    if (r.meta.changes !== 1) return f(404, "event", "Event nicht gefunden oder archiviert.");
  } catch (err) {
    if (String(err).includes("UNIQUE")) return f(409, "aktiv", "Diese Fotobox hat schon ein aktives Event.");
    throw err;
  }
  await protokolliere(env, u.email, "event.geraet", id, { geraet });
  return { ok: true };
}

/** Foto für den Admin ausliefern (Vorschau oder Web). */
export async function adminFoto(env: Env, eventId: string, photoId: string, variante: "web" | "thumb"): Promise<Response | null> {
  const p = await env.DB.prepare("SELECT web_key, thumb_key FROM photos WHERE id = ?1 AND event_id = ?2 AND status = 'ready'").bind(photoId, eventId).first<{ web_key: string; thumb_key: string }>();
  if (!p) return null;
  const obj = await env.PHOTOS.get(variante === "web" ? p.web_key : p.thumb_key);
  await zaehle(env, "r2_class_b");
  if (!obj) return null;
  return new Response(obj.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex", "X-Content-Type-Options": "nosniff" } });
}
