/** Admin-Kalender: Monatsansicht aller Belegungen, Tage sperren (Ferien/Wartung) und Sperren aufheben. */
import type { Env } from "../env";
import type { AdminUser } from "../lib/auth";
import { protokolliere } from "../lib/audit";
import type { Fehler } from "../lib/buchung";
import { heuteZurich, istTag, tageVonBis, tageZwischen } from "../lib/datum";
import { esc } from "../lib/http";
import { zufallsId } from "../lib/id";
import { rahmen } from "./layout";

const f = (status: number, code: string, text: string): Fehler => ({ status, code, text });
const pad = (n: number) => String(n).padStart(2, "0");

export async function kalenderSeite(env: Env, u: AdminUser, url: URL): Promise<string> {
  const heute = heuteZurich();
  const m = (url.searchParams.get("monat") ?? "").match(/^(\d{4})-(\d{2})$/);
  let jahr = m ? Number(m[1]) : Number(heute.slice(0, 4));
  let monat = m ? Number(m[2]) : Number(heute.slice(5, 7));
  if (monat < 1 || monat > 12) [jahr, monat] = [Number(heute.slice(0, 4)), Number(heute.slice(5, 7))];
  const tage = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  const von = `${jahr}-${pad(monat)}-01`;
  const bis = `${jahr}-${pad(monat)}-${pad(tage)}`;
  const r = await env.DB.prepare(
    `SELECT d.day, d.resource_id, a.id AS alloc, a.type, a.note, a.expires_at, b.id AS bid, b.number, b.status, b.contact_name
     FROM allocation_days d JOIN allocations a ON a.id = d.allocation_id LEFT JOIN bookings b ON b.id = a.booking_id
     WHERE d.day BETWEEN ?1 AND ?2 AND NOT (a.type = 'hold' AND a.expires_at <= ?3) ORDER BY d.day, d.resource_id`,
  ).bind(von, bis, new Date().toISOString()).all<{ day: string; resource_id: string; alloc: string; type: string; note: string | null; bid: string | null; number: string | null; status: string | null; contact_name: string | null }>();
  const schreiben = u.permissions.includes("bookings:write");
  const proTag = new Map<string, string[]>();
  const gesehen = new Set<string>();
  for (const e of r.results) {
    const key = `${e.day}|${e.alloc}`;
    if (gesehen.has(key)) continue; // Fotobox + Lieferung derselben Buchung nur einmal zeigen
    gesehen.add(key);
    const liste = proTag.get(e.day) ?? [];
    if (e.type === "booking" && e.bid) liste.push(`<a class="e${e.status === "request" ? " req" : ""}" href="/admin/buchungen/${esc(e.bid)}">${esc(e.number)} ${esc(e.contact_name)}${e.status === "request" ? " (Anfrage)" : ""}</a>`);
    else if (e.type === "hold") liste.push(`<span class="e hold">reserviert (Buchung läuft)</span>`);
    else liste.push(`<span class="e block">${e.type === "maintenance" ? "Wartung" : "gesperrt"}${e.resource_id === "lieferung" ? " (Lieferung)" : ""}${e.note ? `: ${esc(e.note)}` : ""}</span>`);
    proTag.set(e.day, liste);
  }
  const sperren = [...new Map(r.results.filter((e) => e.type === "block" || e.type === "maintenance").map((e) => [e.alloc, e])).values()];
  const versatz = (new Date(Date.UTC(jahr, monat - 1, 1)).getUTCDay() + 6) % 7;
  const zellen = [
    ...["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((t) => `<div class="kopfz">${t}</div>`),
    ...Array.from({ length: versatz }, () => `<div class="leer"></div>`),
    ...Array.from({ length: tage }, (_, i) => {
      const tag = `${jahr}-${pad(monat)}-${pad(i + 1)}`;
      return `<div${tag === heute ? ' class="heute"' : ""}><span class="tag">${i + 1}</span>${(proTag.get(tag) ?? []).join("")}</div>`;
    }),
  ];
  while ((zellen.length - 7) % 7) zellen.push(`<div class="leer"></div>`); // letzte Woche auffüllen
  const vor = monat === 1 ? `${jahr - 1}-12` : `${jahr}-${pad(monat - 1)}`;
  const nach = monat === 12 ? `${jahr + 1}-01` : `${jahr}-${pad(monat + 1)}`;
  const titel = new Date(Date.UTC(jahr, monat - 1, 1)).toLocaleDateString("de-CH", { month: "long", year: "numeric", timeZone: "UTC" });
  const inhalt = `<p class="filter"><a class="knopf" href="/admin/kalender?monat=${vor}">← Vormonat</a> <strong style="font-size:1.2rem;align-self:center">${esc(titel)}</strong> <a class="knopf" href="/admin/kalender?monat=${nach}">Folgemonat →</a></p>
<div class="kal" role="region" aria-label="Belegungen ${esc(titel)}">${zellen.join("")}</div>
${schreiben ? `<h2>Tage sperren</h2>
<form method="post" action="/admin/kalender/sperren"><div class="felder">
  <div><label for="sv">Von</label><input id="sv" type="date" name="von" required></div>
  <div><label for="sb">Bis</label><input id="sb" type="date" name="bis" required></div>
  <div><label for="sa">Art</label><select id="sa" name="art"><option value="block">Sperre (z. B. Ferien)</option><option value="maintenance">Wartung</option></select></div>
  <div><label for="sr">Was</label><select id="sr" name="ressource"><option value="fotobox-1">Fotobox</option><option value="lieferung">nur Lieferung</option></select></div>
  <div class="breit"><label for="sn">Bemerkung</label><input id="sn" name="notiz" maxlength="100"></div>
  <div><button class="haupt">Sperren</button></div></div></form>` : ""}
${sperren.length ? `<h2>Sperren in diesem Monat</h2><ul>${sperren.map((s) => `<li>${s.type === "maintenance" ? "Wartung" : "Sperre"}${s.note ? `: ${esc(s.note)}` : ""} ${schreiben ? `<form class="zeile" method="post" action="/admin/kalender/aufheben"><input type="hidden" name="id" value="${esc(s.alloc)}"><input type="hidden" name="monat" value="${jahr}-${pad(monat)}"><button>Aufheben</button></form>` : ""}</li>`).join("")}</ul>` : ""}`;
  return rahmen(u, "Kalender", "/admin/kalender", inhalt, url);
}

/** Tage sperren – atomar; ist ein Tag schon belegt, wird nichts gesperrt. */
export async function sperre(env: Env, u: AdminUser, von: string, bis: string, art: string, ressource: string, notiz: string): Promise<{ ok: true } | Fehler> {
  if (!istTag(von) || !istTag(bis) || von > bis) return f(400, "datum", "Bitte einen gültigen Zeitraum wählen.");
  if (tageZwischen(von, bis) > 366) return f(400, "dauer", "Höchstens ein Jahr auf einmal.");
  if (!["block", "maintenance"].includes(art) || !["fotobox-1", "lieferung"].includes(ressource)) return f(400, "art", "Ungültige Auswahl.");
  const kap = await env.DB.prepare("SELECT capacity FROM resources WHERE id = ?1").bind(ressource).first<{ capacity: number }>();
  const id = zufallsId();
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM allocations WHERE type = 'hold' AND expires_at <= ?1").bind(new Date().toISOString()),
      env.DB.prepare("INSERT INTO allocations (id, type, note) VALUES (?1, ?2, ?3)").bind(id, art, notiz.slice(0, 100) || null),
      // Sperre belegt alle Slots des Tages
      ...tageVonBis(von, bis).flatMap((day) => Array.from({ length: kap?.capacity ?? 1 }, (_, i) =>
        env.DB.prepare("INSERT INTO allocation_days (allocation_id, resource_id, day, slot) VALUES (?1, ?2, ?3, ?4)").bind(id, ressource, day, i + 1))),
    ]);
  } catch (e) {
    if (String(e).includes("UNIQUE")) return f(409, "belegt", "Im Zeitraum gibt es bereits Buchungen oder Reservierungen. Es wurde nichts gesperrt.");
    throw e;
  }
  await protokolliere(env, u.email, "kalender.gesperrt", ressource, { von, bis, art, notiz });
  return { ok: true };
}

export async function hebeAuf(env: Env, u: AdminUser, id: string): Promise<{ ok: true } | Fehler> {
  const r = await env.DB.prepare("DELETE FROM allocations WHERE id = ?1 AND type IN ('block', 'maintenance') RETURNING note").bind(id).first<{ note: string | null }>();
  if (!r) return f(404, "unbekannt", "Diese Sperre gibt es nicht.");
  await protokolliere(env, u.email, "kalender.aufgehoben", id, { notiz: r.note });
  return { ok: true };
}
