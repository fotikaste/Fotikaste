/** Admin-Übersicht (Dashboard): Kennzahlen, offene Anfragen, nächste Events, Webseiten-Stand, E-Mail-Ausgang, Verbrauch. */
import type { Env } from "../env";
import type { AdminUser } from "../lib/auth";
import type { Permission } from "../lib/permissions";
import { datumCh } from "../lib/buchung";
import { heuteZurich, plusTage } from "../lib/datum";
import { esc } from "../lib/http";
import { chf } from "../lib/preis";
import { verbrauch } from "../lib/usage";
import { buchungsTabelle, type Zeile } from "./buchungen-seiten";
import { webseiteStatus } from "./inhalte";
import { rahmen, zeit } from "./layout";

const QUELLE: Record<string, string> = { app: "gemessen (App)", cloudflare: "gemessen (Cloudflare)", estimate: "geschätzt" };
const MAIL: Record<string, string> = { pending: "wartet", sent: "versendet", held: "zurückgehalten", failed: "fehlgeschlagen" };
const zahl = (n: number) => new Intl.NumberFormat("de-CH").format(n);
const gb = (b: number) => `${(b / 1e9).toLocaleString("de-CH", { maximumFractionDigits: 2 })} GB`;

function stufeHtml(stufe: string, gesperrt: boolean, warn: number | null) {
  if (gesperrt) return `<span class="pill rot">gesperrt</span>`;
  if (stufe === "warnung") return `<span class="pill gelb">Warnung ${warn} %</span>`;
  return `<span class="pill gruen">ok</span>`;
}

const SPALTEN = "id, number, status, contact_name, contact_email, event_day, start_day, end_day, delivery, plz, city, total_rappen, price_final, reason";

export async function uebersicht(env: Env, u: AdminUser, url: URL): Promise<string> {
  const darf = (r: Permission) => u.permissions.includes(r);
  const heute = heuteZurich();
  const teile: string[] = [];
  const warnungen: string[] = [];

  if (darf("bookings:read")) {
    const k = (await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM bookings WHERE status = 'request') AS anfragen,
        (SELECT COUNT(*) FROM bookings WHERE status = 'confirmed' AND event_day BETWEEN ?1 AND ?2) AS naechste30,
        (SELECT COUNT(*) FROM bookings WHERE status IN ('confirmed','completed') AND substr(event_day, 1, 4) = ?3) AS jahr,
        (SELECT COALESCE(SUM(total_rappen), 0) FROM bookings WHERE status IN ('confirmed','completed') AND substr(event_day, 1, 4) = ?3) AS umsatz,
        (SELECT COUNT(*) FROM payment_schedule p JOIN bookings b ON b.id = p.booking_id WHERE p.status = 'open' AND b.status IN ('confirmed','completed') AND b.event_day < ?1) AS offen_vergangen`,
    ).bind(heute, plusTage(heute, 30), heute.slice(0, 4)).first<{ anfragen: number; naechste30: number; jahr: number; umsatz: number; offen_vergangen: number }>())!;
    if (k.anfragen > 0) warnungen.push(`${k.anfragen} offene Anfrage(n) warten auf Antwort`);
    if (k.offen_vergangen > 0 && darf("finance:read")) warnungen.push(`${k.offen_vergangen} Zahlung(en) zu vergangenen Events noch offen`);
    teile.push(`<div class="karten">
  <div class="karte"><span class="klein">Offene Anfragen</span><b>${k.anfragen}</b><a class="klein" href="/admin/buchungen?status=request&amp;zeit=alle">ansehen</a></div>
  <div class="karte"><span class="klein">Events in den nächsten 30 Tagen</span><b>${k.naechste30}</b><a class="klein" href="/admin/kalender">Kalender</a></div>
  <div class="karte"><span class="klein">Buchungen ${heute.slice(0, 4)}</span><b>${k.jahr}</b><span class="klein">bestätigt oder abgeschlossen</span></div>
  ${darf("finance:read") ? `<div class="karte"><span class="klein">Buchungsvolumen ${heute.slice(0, 4)}</span><b>${esc(chf(k.umsatz))}</b><span class="klein">laut Buchungen, nicht Zahlungseingang</span></div>` : ""}
</div>`);
    const anfragen = await env.DB.prepare(`SELECT ${SPALTEN} FROM bookings WHERE status = 'request' ORDER BY event_day LIMIT 20`).all<Zeile>();
    const naechste = await env.DB.prepare(`SELECT ${SPALTEN} FROM bookings WHERE status = 'confirmed' AND end_day >= ?1 ORDER BY event_day LIMIT 8`).bind(heute).all<Zeile>();
    teile.push(`<h2>Offene Anfragen</h2>${anfragenTabelle(anfragen.results, darf("bookings:write"))}<h2>Nächste Events</h2>${buchungsTabelle(naechste.results, "Keine kommenden Events.")}`);
  }

  if (darf("content:write")) {
    const st = await webseiteStatus(env);
    if (st.veraltet) warnungen.push("Inhalte oder Preise wurden geändert – die Webseite zeigt noch den alten Stand (Inhalte → Webseite aktualisieren)");
  }

  if (darf("bookings:read")) {
    const mails = await env.DB.prepare("SELECT to_email, subject, status, test_mode, created_at FROM outbox ORDER BY id DESC LIMIT 10").all<{ to_email: string; subject: string; status: string; test_mode: number; created_at: string }>();
    teile.push(`<h2>E-Mail-Ausgang</h2><div class="scroll" tabindex="0" role="region" aria-label="E-Mail-Ausgang, seitlich scrollbar"><table>
<thead><tr><th>Zeit</th><th>An</th><th>Betreff</th><th>Status</th></tr></thead>
<tbody>${mails.results.map((m) => `<tr><td>${esc(zeit(m.created_at))}</td><td>${esc(m.to_email)}</td><td>${esc(m.subject)}</td><td>${esc(MAIL[m.status] ?? m.status)}${m.test_mode ? " (Testmodus)" : ""}</td></tr>`).join("") || '<tr><td colspan="4" class="klein">Keine E-Mails.</td></tr>'}</tbody></table></div>`);
  }

  if (darf("usage:read")) {
    const { messwerte, speicher } = await verbrauch(env);
    if (speicher.stufe !== "ok") warnungen.push(`Fotospeicher bei ${speicher.prozent} % der App-Grenze`);
    warnungen.push(...messwerte.filter((m) => m.stufe !== "ok").map((m) => `${m.bezeichnung}: ${m.prozent} %`));
    const zeilen = messwerte.map((m) => `<tr>
      <td>${esc(m.bezeichnung)}${m.kostenpflichtig ? ' <span class="klein">(kostenpflichtig über Gratisgrenze)</span>' : ""}</td>
      <td class="zahl">${m.wert === null ? '<span class="klein">nicht verfügbar (lokal)</span>' : zahl(m.wert)}</td>
      <td class="zahl">${zahl(m.grenze)}</td><td class="zahl">${m.prozent === null ? "–" : `${m.prozent} %`}</td>
      <td>${m.wert === null ? '<span class="klein">–</span>' : stufeHtml(m.stufe, m.gesperrt, m.warnschwelle)}</td>
      <td class="klein">${esc(m.wert === null ? "nicht verfügbar" : QUELLE[m.quelle])}</td></tr>`).join("");
    teile.push(`<h2>Fotospeicher</h2><div class="karten">
  <div class="karte"><span class="klein">Belegt</span><b>${gb(speicher.belegt)}</b><span class="klein">reserviert: ${gb(speicher.reserviert)}</span></div>
  <div class="karte"><span class="klein">App-Grenze</span><b>${gb(speicher.grenze)}</b><span class="klein">Sperre ab ${gb(speicher.sperrgrenze)}</span></div>
  <div class="karte"><span class="klein">Auslastung</span><b>${speicher.prozent} %</b>${stufeHtml(speicher.stufe, speicher.gesperrt, speicher.warnschwelle)}
    <div class="balken" role="img" aria-label="Auslastung ${speicher.prozent} Prozent"><i style="width:${Math.min(100, speicher.prozent)}%"></i></div></div>
  <div class="karte"><span class="klein">Geschätzte Kosten diesen Monat</span><b>CHF 0.00</b><span class="klein">solange alle Werte unter den Gratisgrenzen liegen</span></div>
</div>
<h2>Gratiskontingente</h2><div class="scroll" tabindex="0" role="region" aria-label="Verbrauch, seitlich scrollbar"><table>
<thead><tr><th>Kontingent</th><th class="zahl">Verbrauch</th><th class="zahl">Gratis</th><th class="zahl">Anteil</th><th>Status</th><th>Herkunft</th></tr></thead>
<tbody>${zeilen}</tbody></table></div>
<p class="klein">Werte «gemessen (Cloudflare)» werden ab der Veröffentlichung über die Cloudflare-Auswertung ergänzt. Fehlende Werte werden nie geschätzt angezeigt.</p>`);
  }

  const kopf = warnungen.length ? `<div class="hinweis"><strong>Zu erledigen:</strong><ul>${warnungen.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : "";
  return rahmen(u, "Übersicht", "/admin", kopf + teile.join(""), url);
}

function anfragenTabelle(z: Zeile[], schreiben: boolean): string {
  const zeilen = z.map((b) => `<tr><td><a href="/admin/buchungen/${esc(b.id)}"><b>${esc(b.number)}</b></a><br><span class="klein">${esc(b.reason ?? "")}</span></td>
    <td>${esc(datumCh(b.event_day))}</td><td>${esc(b.contact_name)}</td><td class="zahl">${esc(chf(b.total_rappen))}${b.price_final ? "" : '<br><span class="klein">+ Fahrt offen</span>'}</td>
    <td>${schreiben ? `<form class="zeile" method="post" action="/admin/buchungen/${esc(b.id)}/bestaetigen">${b.price_final ? "" : `<label>Fahrt CHF <input name="fahrt_chf" inputmode="decimal" required size="6"></label>`}<button>Bestätigen</button></form>
      <form class="zeile" method="post" action="/admin/buchungen/${esc(b.id)}/ablehnen"><button class="gefahr">Ablehnen</button></form>` : ""}</td></tr>`).join("");
  return `<div class="scroll" tabindex="0" role="region" aria-label="Offene Anfragen, seitlich scrollbar"><table>
<thead><tr><th>Anfrage (Grund)</th><th>Event</th><th>Kunde</th><th class="zahl">Total</th><th>Aktion</th></tr></thead>
<tbody>${zeilen || '<tr><td colspan="5" class="klein">Keine offenen Anfragen.</td></tr>'}</tbody></table></div>`;
}
