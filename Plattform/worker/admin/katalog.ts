/**
 * Admin: Preise (Pakete, Konditionen, Liefergebiete) und Einstellungen – nur Eigentümer (settings:write).
 * Jede Änderung wird mit alt → neu protokolliert. Was auf der Webseite erscheint, setzt «Webseite veraltet».
 * Bestehende Buchungen ändern sich nie (Positionen sind Snapshots).
 */
import type { Env } from "../env";
import type { AdminUser } from "../lib/auth";
import { protokolliere } from "../lib/audit";
import { einstellungen, type Fehler } from "../lib/buchung";
import { esc } from "../lib/http";
import { ausFormular, EINSTELLUNGEN, fuerFormular, SPEC, type Gruppe } from "./einstellungen";
import { chfFeld, rahmen, rappenAus } from "./layout";

const f = (status: number, code: string, text: string): Fehler => ({ status, code, text });
type Ok = { ok: true };

export const inhaltGeaendert = (env: Env) =>
  env.DB.prepare("UPDATE settings SET value = json_quote(strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key = 'content_changed_at'");

function einstellungsFelder(gruppe: Gruppe, werte: Record<string, unknown>): string {
  return Object.entries(SPEC).filter(([, s]) => s.gruppe === gruppe).map(([k, s]) => {
    const id = `e_${k}`;
    const wert = fuerFormular(s, werte[k]);
    const feld = s.art === "bool"
      ? `<label class="check"><input type="checkbox" id="${id}" name="${k}"${werte[k] === true ? " checked" : ""}> ${esc(s.label)}</label>`
      : `<label for="${id}">${esc(s.label)}${s.art === "rappen" ? " (CHF)" : ""}</label><input id="${id}" name="${k}" value="${esc(wert)}" ${s.art === "text" || s.art === "liste" ? "" : 'inputmode="decimal"'}>`;
    return `<div>${feld}${s.hilfe ? `<span class="klein">${esc(s.hilfe)}</span>` : ""}</div>`;
  }).join("");
}

/** Einstellungen einer Gruppe speichern: alle prüfen, dann nur Geänderte schreiben (ein batch). */
export async function speichereEinstellungen(env: Env, u: AdminUser, gruppe: Gruppe, form: Map<string, string>): Promise<Ok | Fehler> {
  const alt = await einstellungen(env);
  const neu: [string, unknown][] = [];
  for (const [k, s] of Object.entries(SPEC).filter(([, s]) => s.gruppe === gruppe)) {
    const v = ausFormular(s, form.get(k));
    if (v === undefined || !EINSTELLUNGEN[k]!(v)) return f(400, "wert", `«${s.label}»: Wert ungültig oder ausserhalb des erlaubten Bereichs.`);
    if (s.art === "plz" && !(await env.DB.prepare("SELECT 1 FROM postal_codes WHERE plz = ?1").bind(v).first())) return f(400, "plz", `«${s.label}»: Postleitzahl ${v} nicht im Verzeichnis.`);
    if (JSON.stringify(alt[k] ?? null) !== JSON.stringify(v)) neu.push([k, v]);
  }
  if (neu.length === 0) return { ok: true };
  const webseite = neu.some(([k]) => SPEC[k]!.webseite);
  await env.DB.batch([
    ...neu.map(([k, v]) => env.DB.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(k, JSON.stringify(v))),
    ...(webseite ? [inhaltGeaendert(env)] : []),
  ]);
  for (const [k, v] of neu) await protokolliere(env, u.email, "einstellung.geaendert", k, { alt: alt[k] ?? null, neu: v });
  return { ok: true };
}

export async function preiseSeite(env: Env, u: AdminUser, url: URL): Promise<string> {
  const pakete = await env.DB.prepare("SELECT slug, name, price_rappen, prints, sort, visible FROM packages ORDER BY sort, slug").all<{ slug: string; name: string; price_rappen: number; prints: number | null; sort: number; visible: number }>();
  const zonen = await env.DB.prepare("SELECT * FROM delivery_zones ORDER BY sort, id").all<Record<string, unknown> & { id: number }>();
  const werte = await einstellungen(env);
  const paketForm = pakete.results.map((p) => `<form method="post" action="/admin/preise/paket/${esc(p.slug)}"><div class="felder">
  <div><label for="pn_${esc(p.slug)}">Name</label><input id="pn_${esc(p.slug)}" name="name" value="${esc(p.name)}" required maxlength="40"></div>
  <div><label for="pp_${esc(p.slug)}">Preis (CHF)</label><input id="pp_${esc(p.slug)}" name="preis_chf" value="${chfFeld(p.price_rappen)}" inputmode="decimal" required></div>
  <div><label for="pa_${esc(p.slug)}">Abzüge (leer = ohne Drucker)</label><input id="pa_${esc(p.slug)}" name="abzuege" value="${p.prints ?? ""}" inputmode="numeric"></div>
  <div><label for="ps_${esc(p.slug)}">Reihenfolge</label><input id="ps_${esc(p.slug)}" name="sort" value="${p.sort}" inputmode="numeric"></div>
  <div><label class="check"><input type="checkbox" name="sichtbar"${p.visible ? " checked" : ""}> sichtbar und buchbar</label></div>
  <div style="align-self:end"><button>Speichern</button></div></div></form>`).join("");
  const z = (x: Record<string, unknown>) => {
    const id = x.id ?? "neu";
    const ziel = x.id ? `/admin/preise/zone/${x.id}` : "/admin/preise/zone";
    const bereiche = (JSON.parse(String(x.plz_ranges ?? "[]")) as [string, string][]).map(([a, b]) => `${a}-${b}`).join(", ");
    const cb = (name: string, text: string, an: unknown) => `<div><label class="check"><input type="checkbox" name="${name}"${an ? " checked" : ""}> ${text}</label></div>`;
    return `<form method="post" action="${ziel}"><div class="felder">
  <div><label for="zn_${id}">Name</label><input id="zn_${id}" name="name" value="${esc(x.name ?? "")}" required maxlength="60"></div>
  <div class="breit"><label for="zk_${id}">Kantone (Kürzel, mit Komma)</label><input id="zk_${id}" name="kantone" value="${esc((JSON.parse(String(x.cantons ?? "[]")) as string[]).join(", "))}" placeholder="TG, SG, ZH"></div>
  <div class="breit"><label for="zb_${id}">Zusätzliche PLZ-Bereiche (z. B. 8000-8099, 9500-9500)</label><input id="zb_${id}" name="bereiche" value="${esc(bereiche)}"></div>
  <div><label for="zg_${id}">Pauschale (CHF)</label><input id="zg_${id}" name="pauschale_chf" value="${chfFeld(Number(x.base_rappen ?? 0))}" inputmode="decimal" required></div>
  <div><label for="zi_${id}">inkl. km</label><input id="zi_${id}" name="inkl_km" value="${esc(x.included_km ?? 0)}" inputmode="numeric" required></div>
  <div><label for="zp_${id}">pro km darüber (CHF)</label><input id="zp_${id}" name="pro_km_chf" value="${chfFeld(Number(x.per_km_rappen ?? 0))}" inputmode="decimal" required></div>
  <div><label for="zm_${id}">max. km (leer = keine Grenze)</label><input id="zm_${id}" name="max_km" value="${esc(x.max_km ?? "")}" inputmode="numeric"></div>
  <div><label for="zv_${id}">Mindestvorlauf (Tage)</label><input id="zv_${id}" name="vorlauf" value="${esc(x.min_lead_days ?? 7)}" inputmode="numeric" required></div>
  <div><label for="zpv_${id}">Puffertage vorher</label><input id="zpv_${id}" name="puffer_vor" value="${esc(x.buffer_days_before ?? 0)}" inputmode="numeric" required></div>
  <div><label for="zpn_${id}">Puffertage nachher</label><input id="zpn_${id}" name="puffer_nach" value="${esc(x.buffer_days_after ?? 0)}" inputmode="numeric" required></div>
  <div><label for="zs_${id}">Reihenfolge</label><input id="zs_${id}" name="sort" value="${esc(x.sort ?? 0)}" inputmode="numeric"></div>
  ${cb("sofort", "Sofortbuchung (sonst Anfrage)", x.instant_booking ?? 1)}${cb("abholung", "Selbstabholung erlaubt", x.pickup_allowed ?? 1)}${cb("aktiv", "aktiv", x.active ?? 1)}
  <div style="align-self:end"><button>${x.id ? "Speichern" : "Zone anlegen"}</button></div></div></form>`;
  };
  const inhalt = `<p class="klein">Änderungen gelten sofort für neue Buchungen. Bestehende Buchungen bleiben unverändert. Die öffentlichen Seiten zeigen neue Preise erst nach «Webseite aktualisieren» (unter Inhalte).</p>
<h2>Pakete</h2>${paketForm}
<h2>Konditionen</h2><form method="post" action="/admin/preise/konditionen"><div class="felder">${einstellungsFelder("konditionen", werte)}<div style="align-self:end"><button>Speichern</button></div></div></form>
<h2>Liefergebiete</h2><p class="klein">Eine PLZ passt zuerst über die PLZ-Bereiche, sonst über den Kanton. Ohne passende aktive Zone wird eine Lieferung zur Anfrage. Die Webseite zeigt die Werte der ersten aktiven Zone.</p>
${zonen.results.map(z).join("")}<h3>Neue Zone</h3>${z({})}`;
  return rahmen(u, "Preise", "/admin/preise", inhalt, url);
}

export async function speicherePaket(env: Env, u: AdminUser, slug: string, form: Map<string, string>): Promise<Ok | Fehler> {
  const alt = await env.DB.prepare("SELECT name, price_rappen, prints, sort, visible FROM packages WHERE slug = ?1").bind(slug).first<Record<string, unknown>>();
  if (!alt) return f(404, "paket", "Dieses Paket gibt es nicht.");
  const name = form.get("name") ?? "";
  const preis = rappenAus(form.get("preis_chf"));
  const abz = form.get("abzuege") ?? "";
  const sort = Number(form.get("sort") ?? 0);
  if (name.length < 2 || name.length > 40) return f(400, "name", "Name 2–40 Zeichen.");
  if (preis === null || preis > 1_000_000) return f(400, "preis", "Ungültiger Preis.");
  if (abz !== "" && !(/^\d{1,4}$/.test(abz))) return f(400, "abzuege", "Abzüge: ganze Zahl oder leer.");
  if (!Number.isInteger(sort) || sort < 0 || sort > 999) return f(400, "sort", "Reihenfolge 0–999.");
  const neu = { name, price_rappen: preis, prints: abz === "" ? null : Number(abz), sort, visible: form.get("sichtbar") === "on" ? 1 : 0 };
  if (neu.visible === 0) {
    const sichtbar = await env.DB.prepare("SELECT COUNT(*) AS n FROM packages WHERE visible = 1 AND slug != ?1").bind(slug).first<{ n: number }>();
    if ((sichtbar?.n ?? 0) === 0) return f(400, "sichtbar", "Mindestens ein Paket muss sichtbar bleiben.");
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE packages SET name = ?2, price_rappen = ?3, prints = ?4, sort = ?5, visible = ?6 WHERE slug = ?1").bind(slug, neu.name, neu.price_rappen, neu.prints, neu.sort, neu.visible),
    inhaltGeaendert(env),
  ]);
  await protokolliere(env, u.email, "paket.geaendert", slug, { alt, neu });
  return { ok: true };
}

const KANTONE = new Set(["AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR", "JU", "LU", "NE", "NW", "OW", "SG", "SH", "SO", "SZ", "TG", "TI", "UR", "VD", "VS", "ZG", "ZH"]);

export async function speichereZone(env: Env, u: AdminUser, id: number | null, form: Map<string, string>): Promise<Ok | Fehler> {
  const name = form.get("name") ?? "";
  if (name.length < 2 || name.length > 60) return f(400, "name", "Name 2–60 Zeichen.");
  const kantone = (form.get("kantone") ?? "").toUpperCase().split(/[,\s]+/).filter(Boolean);
  if (kantone.some((k) => !KANTONE.has(k))) return f(400, "kantone", "Unbekanntes Kantonskürzel. Beispiel: TG, SG, ZH");
  const bereiche: [string, string][] = [];
  for (const b of (form.get("bereiche") ?? "").split(/[,\s]+/).filter(Boolean)) {
    const m = b.match(/^(\d{4})-(\d{4})$/);
    if (!m || m[1]! > m[2]!) return f(400, "bereiche", `PLZ-Bereich «${b}» ungültig. Beispiel: 8000-8099`);
    bereiche.push([m[1]!, m[2]!]);
  }
  if (kantone.length === 0 && bereiche.length === 0) return f(400, "leer", "Bitte Kantone oder PLZ-Bereiche angeben.");
  const ganz = (k: string, min: number, max: number) => { const t = form.get(k) ?? ""; const n = Number(t); return /^\d+$/.test(t) && n >= min && n <= max ? n : null; };
  const pausch = rappenAus(form.get("pauschale_chf"));
  const proKm = rappenAus(form.get("pro_km_chf"));
  const inkl = ganz("inkl_km", 0, 500);
  const vorlauf = ganz("vorlauf", 0, 60);
  const pv = ganz("puffer_vor", 0, 3);
  const pn = ganz("puffer_nach", 0, 3);
  const sort = ganz("sort", 0, 999) ?? 0;
  const maxKm = (form.get("max_km") ?? "") === "" ? null : ganz("max_km", 1, 1000);
  if (pausch === null || proKm === null || inkl === null || vorlauf === null || pv === null || pn === null || maxKm === undefined || ((form.get("max_km") ?? "") !== "" && maxKm === null))
    return f(400, "wert", "Bitte alle Zahlen prüfen (Puffer 0–3, Vorlauf 0–60, km ganze Zahlen).");
  const werte = [name, JSON.stringify(kantone), JSON.stringify(bereiche), maxKm, pausch, inkl, proKm, form.get("abholung") === "on" ? 1 : 0, form.get("sofort") === "on" ? 1 : 0, vorlauf, pv, pn, form.get("aktiv") === "on" ? 1 : 0, sort];
  const alt = id ? await env.DB.prepare("SELECT * FROM delivery_zones WHERE id = ?1").bind(id).first() : null;
  if (id && !alt) return f(404, "zone", "Diese Zone gibt es nicht.");
  const sql = id
    ? env.DB.prepare(`UPDATE delivery_zones SET name = ?1, cantons = ?2, plz_ranges = ?3, max_km = ?4, base_rappen = ?5, included_km = ?6, per_km_rappen = ?7, pickup_allowed = ?8, instant_booking = ?9, min_lead_days = ?10, buffer_days_before = ?11, buffer_days_after = ?12, active = ?13, sort = ?14 WHERE id = ?15`).bind(...werte, id)
    : env.DB.prepare(`INSERT INTO delivery_zones (name, cantons, plz_ranges, max_km, base_rappen, included_km, per_km_rappen, pickup_allowed, instant_booking, min_lead_days, buffer_days_before, buffer_days_after, active, sort) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`).bind(...werte);
  await env.DB.batch([sql, inhaltGeaendert(env)]);
  await protokolliere(env, u.email, id ? "zone.geaendert" : "zone.angelegt", name, { alt, neu: werte });
  return { ok: true };
}

export async function einstellungenSeite(env: Env, u: AdminUser, url: URL): Promise<string> {
  const werte = await einstellungen(env);
  const inhalt = `<h2>Zahlung und AGB</h2><p class="klein">Nur Information für Kunden und Zahlungsplan – es gibt keine Onlinezahlung. Gilt für neu bestätigte Buchungen.</p>
<form method="post" action="/admin/einstellungen/zahlung"><div class="felder">${einstellungsFelder("zahlung", werte)}<div style="align-self:end"><button>Speichern</button></div></div></form>
<h2>System und Kostenkontrolle</h2>
<form method="post" action="/admin/einstellungen/system"><div class="felder">${einstellungsFelder("system", werte)}<div style="align-self:end"><button>Speichern</button></div></div></form>`;
  return rahmen(u, "Einstellungen", "/admin/einstellungen", inhalt, url);
}
