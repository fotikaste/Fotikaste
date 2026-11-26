/** Admin: Kundenliste, Kundendetail mit Buchungen und internen Notizen. */
import type { Env } from "../env";
import type { AdminUser } from "../lib/auth";
import { protokolliere } from "../lib/audit";
import type { Fehler } from "../lib/buchung";
import { esc } from "../lib/http";
import { chf } from "../lib/preis";
import { buchungsTabelle, type Zeile } from "./buchungen-seiten";
import { rahmen, zeit } from "./layout";

const f = (status: number, code: string, text: string): Fehler => ({ status, code, text });

export async function kundenListe(env: Env, u: AdminUser, url: URL): Promise<string> {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80).replace(/[%_]/g, "");
  const r = await env.DB.prepare(
    `SELECT c.id, c.name, c.email, c.created_at, COUNT(b.id) AS anzahl, MAX(b.event_day) AS letztes,
       COALESCE(SUM(CASE WHEN b.status IN ('confirmed','completed') THEN b.total_rappen END), 0) AS umsatz
     FROM customers c LEFT JOIN bookings b ON b.customer_id = c.id
     WHERE (?1 = '' OR c.name LIKE '%' || ?1 || '%' OR c.email LIKE '%' || ?1 || '%')
     GROUP BY c.id ORDER BY letztes DESC NULLS LAST, c.created_at DESC LIMIT 200`,
  ).bind(q).all<{ id: string; name: string; email: string; created_at: string; anzahl: number; letztes: string | null; umsatz: number }>();
  const finanz = u.permissions.includes("finance:read");
  const zeilen = r.results.map((k) => `<tr><td><a href="/admin/kunden/${esc(k.id)}"><b>${esc(k.name)}</b></a><br><span class="klein">${esc(k.email)}</span></td>
    <td class="zahl">${k.anzahl}</td><td>${k.letztes ? esc(k.letztes.split("-").reverse().join(".")) : "–"}</td>${finanz ? `<td class="zahl">${esc(chf(k.umsatz))}</td>` : ""}</tr>`).join("");
  const inhalt = `<form class="filter" method="get" action="/admin/kunden"><div><label for="q">Suche</label><input id="q" name="q" value="${esc(q)}" placeholder="Name oder E-Mail"></div><button>Suchen</button></form>
<div class="scroll" tabindex="0" role="region" aria-label="Kunden"><table><thead><tr><th>Kunde</th><th class="zahl">Buchungen</th><th>Letztes Event</th>${finanz ? '<th class="zahl">Umsatz (bestätigt)</th>' : ""}</tr></thead>
<tbody>${zeilen || `<tr><td colspan="4" class="klein">Keine Kunden.</td></tr>`}</tbody></table></div>`;
  return rahmen(u, "Kunden", "/admin/kunden", inhalt, url);
}

export async function kundenDetail(env: Env, u: AdminUser, id: string, url: URL): Promise<string | null> {
  const k = await env.DB.prepare("SELECT id, name, email, locale, created_at FROM customers WHERE id = ?1").bind(id).first<{ id: string; name: string; email: string; locale: string; created_at: string }>();
  if (!k) return null;
  const b = await env.DB.prepare("SELECT id, number, status, contact_name, contact_email, event_day, start_day, end_day, delivery, plz, city, total_rappen, price_final, reason FROM bookings WHERE customer_id = ?1 ORDER BY event_day DESC").bind(id).all<Zeile>();
  const n = await env.DB.prepare("SELECT at, author, text FROM customer_notes WHERE customer_id = ?1 ORDER BY id DESC").bind(id).all<{ at: string; author: string; text: string }>();
  const schreiben = u.permissions.includes("bookings:write");
  const inhalt = `<p class="klein">${esc(k.email)} · Kunde seit ${esc(zeit(k.created_at))} · Sprache ${esc(k.locale)}</p>
${schreiben ? `<form method="post" action="/admin/kunden/${esc(id)}/name"><div class="felder"><div><label for="kn">Name im Kundenkonto</label><input id="kn" name="name" value="${esc(k.name)}" required maxlength="100"></div><div style="align-self:end"><button>Speichern</button></div>
<p class="breit klein">Die E-Mail-Adresse ist die Anmeldung ins Kundenkonto und kann hier nicht geändert werden.</p></div></form>` : ""}
<h2>Buchungen</h2>${buchungsTabelle(b.results)}
<h2>Notizen</h2>
${schreiben ? `<form method="post" action="/admin/kunden/${esc(id)}/notiz"><div class="felder"><div class="breit"><label for="nt">Neue Notiz (nur intern)</label><textarea id="nt" name="text" maxlength="4000" required></textarea></div><div><button>Speichern</button></div></div></form>` : ""}
<ul class="verlauf">${n.results.map((x) => `<li><span class="klein">${esc(zeit(x.at))} · ${esc(x.author)}</span><br>${esc(x.text)}</li>`).join("") || '<li class="klein">Keine Notizen.</li>'}</ul>
<p><a href="/admin/kunden">← Alle Kunden</a></p>`;
  return rahmen(u, k.name, "/admin/kunden", inhalt, url);
}

export async function kundenNotiz(env: Env, u: AdminUser, id: string, text: string): Promise<{ ok: true } | Fehler> {
  if (text.length < 1 || text.length > 4000) return f(400, "notiz", "Bitte eine Notiz (bis 4000 Zeichen) eingeben.");
  const r = await env.DB.prepare("INSERT INTO customer_notes (customer_id, author, text) SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM customers WHERE id = ?1)").bind(id, u.email, text).run();
  if (r.meta.changes !== 1) return f(404, "unbekannt", "Diesen Kunden gibt es nicht.");
  return { ok: true };
}

export async function kundenName(env: Env, u: AdminUser, id: string, name: string): Promise<{ ok: true } | Fehler> {
  if (name.length < 2 || name.length > 100) return f(400, "name", "Bitte einen Namen (2–100 Zeichen) eingeben.");
  const alt = await env.DB.prepare("SELECT name FROM customers WHERE id = ?1").bind(id).first<{ name: string }>();
  if (!alt) return f(404, "unbekannt", "Diesen Kunden gibt es nicht.");
  await env.DB.prepare("UPDATE customers SET name = ?2 WHERE id = ?1").bind(id, name).run();
  await protokolliere(env, u.email, "kunde.name", id, { alt: alt.name, neu: name });
  return { ok: true };
}
