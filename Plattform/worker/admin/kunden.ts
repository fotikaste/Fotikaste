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
${u.permissions.includes("users:manage") ? `<h2>Datenschutz</h2>
<p><a class="knopf" href="/admin/kunden/${esc(id)}/auskunft.json">Auskunft herunterladen (alle Personendaten)</a></p>
<form method="post" action="/admin/kunden/${esc(id)}/anonymisieren"><div class="felder">
  <p class="breit klein">Löschbegehren: Name, Kontakt, Adresse, Notizen, E-Mails und Fotos werden entfernt. Buchungsnummern, Daten und Beträge bleiben für die Buchhaltung (Aufbewahrungspflicht). Nicht rückgängig zu machen.</p>
  <div><label for="anb">Zur Bestätigung ANONYMISIEREN eintippen</label><input id="anb" name="bestaetigung" autocomplete="off" required></div>
  <div style="align-self:end"><button class="gefahr">Kunde anonymisieren</button></div></div></form>` : ""}
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

// ---------------- Datenschutz (DSG): Auskunft und Anonymisierung ----------------

/** Auskunft: alle Personendaten eines Kunden als JSON-Datei (Art. 25 DSG). */
export async function kundenAuskunft(env: Env, u: AdminUser, id: string): Promise<Response | null> {
  const k = await env.DB.prepare("SELECT id, email, name, locale, created_at FROM customers WHERE id = ?1").bind(id).first();
  if (!k) return null;
  const q = async (sql: string) => (await env.DB.prepare(sql).bind(id).all()).results;
  const daten = {
    erstellt: new Date().toISOString(),
    hinweis: "Auskunft über die gespeicherten Personendaten (Fotikaste-Plattform).",
    kunde: k,
    buchungen: await q(`SELECT number, status, contact_name, contact_company, contact_phone, contact_email, event_day, start_day, end_day, delivery, street, plz, city, guests, message, total_rappen, created_at FROM bookings WHERE customer_id = ?1 ORDER BY event_day`),
    positionen: await q(`SELECT b.number, i.text, i.qty, i.total_rappen FROM booking_items i JOIN bookings b ON b.id = i.booking_id WHERE b.customer_id = ?1 ORDER BY b.number, i.pos`),
    zahlungen: await q(`SELECT b.number, z.paid_on, z.amount_rappen, z.method FROM payments z JOIN bookings b ON b.id = z.booking_id WHERE b.customer_id = ?1 ORDER BY z.paid_on`),
    notizen: await q(`SELECT at, text FROM customer_notes WHERE customer_id = ?1 ORDER BY id`),
    fotos: await q(`SELECT e.name AS event, COUNT(p.id) AS anzahl, e.retention_until AS online_bis FROM events e JOIN bookings b ON b.id = e.booking_id LEFT JOIN photos p ON p.event_id = e.id AND p.status = 'ready' WHERE b.customer_id = ?1 GROUP BY e.id`),
    emails: await q(`SELECT created_at, subject, status FROM outbox WHERE to_email = (SELECT email FROM customers WHERE id = ?1) ORDER BY id`),
  };
  await protokolliere(env, u.email, "kunde.auskunft", id);
  return new Response(JSON.stringify(daten, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="auskunft-${id.slice(0, 8)}.json"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

/**
 * Anonymisieren (Löschbegehren): Personendaten entfernen, Beträge für die Buchhaltung behalten (Aufbewahrungspflicht).
 * Nur ohne offene oder kommende Buchungen. Fotos der Events werden gelöscht. Das Protokoll (audit_log) ist unveränderlich.
 */
export async function kundenAnonymisieren(env: Env, u: AdminUser, id: string, bestaetigung: string, jetzt = new Date()): Promise<{ ok: true } | Fehler> {
  if (bestaetigung !== "ANONYMISIEREN") return f(400, "bestaetigung", "Zur Bestätigung bitte ANONYMISIEREN eintippen.");
  const k = await env.DB.prepare("SELECT email FROM customers WHERE id = ?1").bind(id).first<{ email: string }>();
  if (!k) return f(404, "unbekannt", "Diesen Kunden gibt es nicht.");
  const heute = jetzt.toISOString().slice(0, 10);
  const offen = await env.DB.prepare("SELECT COUNT(*) AS n FROM bookings WHERE customer_id = ?1 AND status IN ('request', 'confirmed') AND end_day >= ?2").bind(id, heute).first<{ n: number }>();
  if ((offen?.n ?? 0) > 0) return f(409, "offen", "Es gibt noch offene oder kommende Buchungen. Bitte zuerst abschliessen oder stornieren.");
  const anonym = `anonym-${id.slice(0, 12)}@anonymisiert.invalid`;
  const { loescheFotos } = await import("../lib/fotos");
  await loescheFotos(env, "event_id IN (SELECT e.id FROM events e JOIN bookings b ON b.id = e.booking_id WHERE b.customer_id = ?1)", [id], u.email, "Kunde anonymisiert", 5000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM outbox WHERE to_email = ?1").bind(k.email),
    env.DB.prepare("UPDATE bookings SET contact_name = 'anonymisiert', contact_company = NULL, contact_phone = '-', contact_email = ?2, street = NULL, city = NULL, guests = NULL, message = NULL WHERE customer_id = ?1").bind(id, anonym),
    env.DB.prepare(`UPDATE booking_history SET old_value = NULL, new_value = 'anonymisiert'
      WHERE booking_id IN (SELECT id FROM bookings WHERE customer_id = ?1) AND field IN ('notiz', 'contact_name', 'contact_company', 'contact_email', 'contact_phone', 'street', 'city', 'plz', 'guests')`).bind(id),
    env.DB.prepare("UPDATE payments SET note = NULL WHERE booking_id IN (SELECT id FROM bookings WHERE customer_id = ?1)").bind(id),
    env.DB.prepare("UPDATE booking_effort SET note = NULL WHERE booking_id IN (SELECT id FROM bookings WHERE customer_id = ?1)").bind(id),
    env.DB.prepare("DELETE FROM customer_notes WHERE customer_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM sessions WHERE customer_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM magic_links WHERE customer_id = ?1").bind(id),
    env.DB.prepare("UPDATE customers SET name = 'anonymisiert', email = ?2 WHERE id = ?1").bind(id, anonym),
  ]);
  await protokolliere(env, u.email, "kunde.anonymisiert", id);
  return { ok: true };
}
