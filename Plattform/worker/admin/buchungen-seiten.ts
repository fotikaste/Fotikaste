/** Admin-Seiten: Buchungsliste mit Filter und Buchungsdetail mit allen Aktionen. */
import type { Env } from "../env";
import type { AdminUser } from "../lib/auth";
import { datumCh } from "../lib/buchung";
import { heuteZurich } from "../lib/datum";
import { esc } from "../lib/http";
import { chf } from "../lib/preis";
import { chfFeld, rahmen, STATUS, zeit } from "./layout";
import { eventFormular } from "./fotobox";
import { buchungFinanzTeil } from "./finanzen";

const FELD: Record<string, string> = { status: "Status", termin: "Termin", notiz: "Notiz", "position+": "Position hinzugefügt", "position−": "Position entfernt", contact_name: "Name", contact_company: "Firma", contact_email: "E-Mail", contact_phone: "Telefon", street: "Strasse", plz: "PLZ", city: "Ort", guests: "Gäste" };

/** Statuswerte im Verlauf auf Deutsch */
const wert = (feld: string, v: string) => (feld === "status" ? (STATUS[v] ?? v) : v);

export function statusPill(s: string) {
  const farbe = s === "request" ? "gelb" : s === "confirmed" || s === "completed" ? "gruen" : "rot";
  return `<span class="pill ${farbe}">${esc(STATUS[s] ?? s)}</span>`;
}

export interface Zeile { id: string; number: string; status: string; contact_name: string; contact_email: string; event_day: string; start_day: string; end_day: string; delivery: number; plz: string | null; city: string | null; total_rappen: number; price_final: number; reason: string | null }

export function buchungsTabelle(zeilen: Zeile[], leer = "Keine Buchungen."): string {
  const z = zeilen.map((b) => `<tr><td><a href="/admin/buchungen/${esc(b.id)}"><b>${esc(b.number)}</b></a><br>${statusPill(b.status)}</td>
    <td>${esc(datumCh(b.event_day))}<br><span class="klein">${esc(datumCh(b.start_day))} – ${esc(datumCh(b.end_day))}</span></td>
    <td>${esc(b.contact_name)}<br><span class="klein">${esc(b.contact_email)}</span></td>
    <td>${b.delivery ? `Lieferung ${esc(b.plz ?? "")} ${esc(b.city ?? "")}` : "Selbstabholung"}${b.reason ? `<br><span class="klein">${esc(b.reason)}</span>` : ""}</td>
    <td class="zahl">${esc(chf(b.total_rappen))}${b.price_final ? "" : '<br><span class="klein">+ Fahrt offen</span>'}</td></tr>`).join("");
  return `<div class="scroll" tabindex="0" role="region" aria-label="Buchungen, seitlich scrollbar"><table>
<thead><tr><th>Nummer</th><th>Event / Miete</th><th>Kunde</th><th>Lieferung</th><th class="zahl">Total</th></tr></thead>
<tbody>${z || `<tr><td colspan="5" class="klein">${esc(leer)}</td></tr>`}</tbody></table></div>`;
}

const SPALTEN = "id, number, status, contact_name, contact_email, event_day, start_day, end_day, delivery, plz, city, total_rappen, price_final, reason";

export async function buchungsListe(env: Env, u: AdminUser, url: URL): Promise<string> {
  const status = url.searchParams.get("status") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const zeitraum = url.searchParams.get("zeit") ?? "kommend";
  const seite = Math.max(1, Number(url.searchParams.get("seite")) || 1);
  const bed: string[] = [];
  const p: unknown[] = [];
  if (status && STATUS[status]) { p.push(status); bed.push(`status = ?${p.length}`); }
  if (q) { p.push(`%${q.replace(/[%_]/g, "")}%`); bed.push(`(number LIKE ?${p.length} OR contact_name LIKE ?${p.length} OR contact_email LIKE ?${p.length})`); }
  const heute = heuteZurich();
  if (zeitraum === "kommend") { p.push(heute); bed.push(`end_day >= ?${p.length}`); }
  if (zeitraum === "vergangen") { p.push(heute); bed.push(`end_day < ?${p.length}`); }
  const where = bed.length ? `WHERE ${bed.join(" AND ")}` : "";
  const ordnung = zeitraum === "vergangen" ? "event_day DESC" : "event_day ASC";
  const r = await env.DB.prepare(`SELECT ${SPALTEN} FROM bookings ${where} ORDER BY ${ordnung} LIMIT 51 OFFSET ${(seite - 1) * 50}`).bind(...p).all<Zeile>();
  const mehr = r.results.length > 50;
  const opt = (wert: string, text: string, aktuell: string) => `<option value="${wert}"${wert === aktuell ? " selected" : ""}>${esc(text)}</option>`;
  const weiter = new URL(url);
  weiter.searchParams.set("seite", String(seite + 1));
  const inhalt = `<form class="filter" method="get" action="/admin/buchungen">
  <div><label for="q">Suche</label><input id="q" name="q" value="${esc(q)}" placeholder="Nummer, Name, E-Mail"></div>
  <div><label for="status">Status</label><select id="status" name="status">${opt("", "alle", status)}${Object.entries(STATUS).map(([k, v]) => opt(k, v, status)).join("")}</select></div>
  <div><label for="zeit">Zeitraum</label><select id="zeit" name="zeit">${opt("kommend", "kommende", zeitraum)}${opt("vergangen", "vergangene", zeitraum)}${opt("alle", "alle", zeitraum)}</select></div>
  <button type="submit">Filtern</button></form>
${buchungsTabelle(r.results.slice(0, 50))}
${mehr ? `<p><a class="knopf" href="${esc(weiter.pathname + weiter.search)}">Weitere</a></p>` : ""}`;
  return rahmen(u, "Buchungen", "/admin/buchungen", inhalt, url);
}

export async function buchungsDetail(env: Env, u: AdminUser, id: string, url: URL): Promise<string | null> {
  const b = await env.DB.prepare("SELECT b.*, z.name AS zone_name FROM bookings b LEFT JOIN delivery_zones z ON z.id = b.zone_id WHERE b.id = ?1").bind(id).first<Record<string, unknown> & Zeile>();
  if (!b) return null;
  const pos = await env.DB.prepare("SELECT pos, code, text, qty, unit_rappen, total_rappen FROM booking_items WHERE booking_id = ?1 ORDER BY pos").bind(id).all<{ pos: number; code: string; text: string; qty: number; unit_rappen: number; total_rappen: number }>();
  const hist = await env.DB.prepare("SELECT at, actor, field, old_value, new_value FROM booking_history WHERE booking_id = ?1 ORDER BY id DESC").bind(id).all<{ at: string; actor: string; field: string; old_value: string | null; new_value: string | null }>();
  const schreiben = u.permissions.includes("bookings:write");
  const offen = ["request", "confirmed"].includes(b.status);
  const basis = `/admin/buchungen/${esc(id)}`;
  const v = (x: unknown) => esc(x ?? "");

  const aktionen = !schreiben ? "" : `<h2>Aktionen</h2><div>
${b.status === "request" ? `<form class="zeile" method="post" action="${basis}/bestaetigen">${b.price_final ? "" : `<label for="fahrt">Fahrt CHF</label><input id="fahrt" name="fahrt_chf" inputmode="decimal" required size="7">`}<button class="haupt">Anfrage bestätigen</button></form>
<form class="zeile" method="post" action="${basis}/ablehnen"><button class="gefahr">Anfrage ablehnen</button></form>` : ""}
${b.status === "confirmed" ? `<form class="zeile" method="post" action="${basis}/abschliessen"><button>Als abgeschlossen markieren</button></form>` : ""}
${offen ? `<form class="zeile" method="post" action="${basis}/stornieren"><label class="check"><input type="checkbox" name="mail" checked> Kunde per E-Mail informieren</label><button class="gefahr">Stornieren</button></form>` : ""}
</div>`;

  const positionen = pos.results.map((p) => `<tr><td>${p.pos}</td><td>${esc(p.text)}</td><td class="zahl">${p.qty}</td><td class="zahl">${esc(chf(p.unit_rappen))}</td><td class="zahl">${esc(chf(p.total_rappen))}</td>
    <td>${schreiben && offen && pos.results.length > 1 ? `<form class="zeile" method="post" action="${basis}/position-weg"><input type="hidden" name="pos" value="${p.pos}"><button aria-label="Position ${p.pos} entfernen">Entfernen</button></form>` : ""}</td></tr>`).join("");

  const inhalt = `<p>${statusPill(b.status)} <span class="klein">erstellt ${esc(zeit(b.created_at as string))} · AGB-Version ${v(b.terms_version)}</span></p>
${b.reason ? `<p class="hinweis">Anfrage-Grund: ${v(b.reason)}</p>` : ""}
<div class="karten">
  <div class="karte"><span class="klein">Eventtag</span><b>${esc(datumCh(b.event_day))}</b><span class="klein">Miete ${esc(datumCh(b.start_day))} – ${esc(datumCh(b.end_day))}</span></div>
  <div class="karte"><span class="klein">${b.delivery ? "Lieferung" : "Selbstabholung"}</span><b style="font-size:1.2rem">${b.delivery ? `${v(b.street)}<br>${v(b.plz)} ${v(b.city)}` : "–"}</b><span class="klein">${b.delivery ? `${b.km_estimated ? `${v(b.km_estimated)} km geschätzt · ` : ""}${v(b.zone_name ?? "keine Zone")}` : ""}</span></div>
  <div class="karte"><span class="klein">Kunde</span><b style="font-size:1.2rem">${v(b.contact_name)}</b><span class="klein">${b.contact_company ? `${v(b.contact_company)} · ` : ""}${v(b.contact_email)} · ${v(b.contact_phone)}${b.guests ? ` · ${v(b.guests)} Gäste` : ""}</span><br><a class="klein" href="/admin/kunden/${v(b.customer_id)}">Kundenkonto</a></div>
  <div class="karte"><span class="klein">Total</span><b>${esc(chf(b.total_rappen))}</b><span class="klein">${b.price_final ? "" : "Fahrtkosten offen · "}${b.flex_cancel_until ? `stornierbar bis ${esc(datumCh(b.flex_cancel_until as string))}` : "ohne Storno-Option"}</span></div>
</div>
${b.message ? `<h3>Nachricht des Kunden</h3><p class="hinweis">${v(b.message)}</p>` : ""}
${aktionen}
${await eventTeil(env, u, b)}
${await buchungFinanzTeil(env, u, b)}
<h2>Positionen</h2>
<div class="scroll" tabindex="0" role="region" aria-label="Positionen"><table><thead><tr><th>Pos.</th><th>Bezeichnung</th><th class="zahl">Menge</th><th class="zahl">Einzelpreis</th><th class="zahl">Betrag</th><th></th></tr></thead>
<tbody>${positionen}<tr><td></td><td><b>Total</b></td><td></td><td></td><td class="zahl"><b>${esc(chf(b.total_rappen))}</b></td><td></td></tr></tbody></table></div>
${schreiben && offen ? `<form method="post" action="${basis}/position"><div class="felder">
  <div class="breit"><label for="ptext">Neue Position (Rabatt mit Minus, z. B. -50.00)</label><input id="ptext" name="text" required maxlength="120" placeholder="z. B. Zusätzlicher Miettag"></div>
  <div><label for="pmenge">Menge</label><input id="pmenge" name="menge" value="1" inputmode="numeric" required></div>
  <div><label for="ppreis">Einzelpreis CHF</label><input id="ppreis" name="preis_chf" inputmode="decimal" required></div>
  <div style="align-self:end"><button>Hinzufügen</button></div></div></form>` : ""}
${schreiben && offen ? `<h2>Termin ändern</h2><form method="post" action="${basis}/termin"><div class="felder">
  <div><label for="tev">Eventtag</label><input id="tev" type="date" name="event" value="${v(b.event_day)}" required></div>
  <div><label for="tst">Mietbeginn</label><input id="tst" type="date" name="start" value="${v(b.start_day)}" required></div>
  <div><label for="ten">Mietende</label><input id="ten" type="date" name="ende" value="${v(b.end_day)}" required></div>
  <div style="align-self:end"><button>Termin ändern</button></div>
  <p class="breit klein">Ist ein Tag im neuen Zeitraum belegt, wird nichts geändert. Zusatztage werden nicht automatisch verrechnet – bei Bedarf als Position ergänzen.</p></div></form>` : ""}
${schreiben ? `<h2>Kontaktangaben</h2><form method="post" action="${basis}/kontakt"><div class="felder">
  <div><label for="kn">Name</label><input id="kn" name="name" value="${v(b.contact_name)}" required maxlength="100"></div>
  <div><label for="kf">Firma</label><input id="kf" name="firma" value="${v(b.contact_company)}" maxlength="100"></div>
  <div><label for="ke">E-Mail</label><input id="ke" name="email" type="email" value="${v(b.contact_email)}" required></div>
  <div><label for="kt">Telefon</label><input id="kt" name="telefon" value="${v(b.contact_phone)}" required></div>
  <div><label for="ks">Strasse</label><input id="ks" name="strasse" value="${v(b.street)}" maxlength="120"></div>
  <div><label for="kp">PLZ</label><input id="kp" name="plz" value="${v(b.plz)}" inputmode="numeric" maxlength="4"></div>
  <div><label for="ko">Ort</label><input id="ko" name="ort" value="${v(b.city)}" maxlength="80"></div>
  <div><label for="kg">Gäste</label><input id="kg" name="gaeste" value="${v(b.guests)}" inputmode="numeric"></div>
  <p class="breit klein">Ändert nur diese Buchung. Die Postleitzahl ändert die Fahrtkosten nicht automatisch.</p>
  <div><button>Speichern</button></div></div></form>` : ""}
<h2>Verlauf und Notizen</h2>
${schreiben ? `<form method="post" action="${basis}/notiz"><div class="felder"><div class="breit"><label for="nt">Interne Notiz</label><textarea id="nt" name="text" maxlength="4000" required></textarea></div><div><button>Notiz speichern</button></div></div></form>` : ""}
<ul class="verlauf">${hist.results.map((h) => `<li><span class="klein">${esc(zeit(h.at))} · ${esc(h.actor)}</span> – <b>${esc(FELD[h.field] ?? h.field)}</b>: ${h.old_value !== null ? `${esc(wert(h.field, h.old_value))} → ` : ""}${esc(wert(h.field, h.new_value ?? "–"))}</li>`).join("")}</ul>
<p><a href="/admin/buchungen">← Alle Buchungen</a></p>`;
  return rahmen(u, `Buchung ${b.number}`, "/admin/buchungen", inhalt, url);
}

async function eventTeil(env: Env, u: AdminUser, b: Record<string, unknown>): Promise<string> {
  if (!u.permissions.includes("devices:manage") || !["confirmed", "completed"].includes(String(b.status))) return "";
  const ev = await env.DB.prepare("SELECT id, name FROM events WHERE booking_id = ?1").bind(b.id).first<{ id: string; name: string }>();
  if (ev) return `<h2>Galerie</h2><p><a href="/admin/events/${esc(ev.id)}">${esc(ev.name)}</a></p>`;
  return `<h2>Galerie</h2>${await eventFormular(env, String(b.id), `${String(b.contact_name)} ${datumCh(String(b.event_day))}`.slice(0, 80), String(b.event_day))}`;
}

export { chfFeld };
