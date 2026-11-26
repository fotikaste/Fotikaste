/**
 * Admin: Zahlungseingang (von Hand), Aufwand pro Buchung, Ausgaben, Anschaffungen, Fixkosten und Wirtschaftlichkeit.
 * Nur Eigentümer (finance:read / finance:write). Keine Zahlungsfunktion: es wird nur festgehalten, was du selbst einträgst.
 */
import type { Env } from "../env";
import type { AdminUser } from "../lib/auth";
import { protokolliere } from "../lib/audit";
import { datumCh, einstellungen, type Fehler } from "../lib/buchung";
import { heuteZurich, istTag } from "../lib/datum";
import { esc, withSecurityHeaders } from "../lib/http";
import { chf } from "../lib/preis";
import { csv, jahresauswertung, type Buchung } from "../lib/wirtschaft";
import { chfFeld, rahmen, rappenAus, STATUS } from "./layout";

const f = (status: number, code: string, text: string): Fehler => ({ status, code, text });
type Ok = { ok: true };
export const ARTEN: Record<string, string> = { bar: "bar", twint: "Twint", ueberweisung: "Überweisung", andere: "andere" };
export const KATEGORIEN: Record<string, string> = { material: "Material (Papier, Farbband …)", fahrzeug: "Fahrzeug", reparatur: "Reparatur/Unterhalt", werbung: "Werbung", software: "Software/Domain", versicherung: "Versicherung", gebuehren: "Gebühren", anderes: "anderes" };
const stunden = (min: number | null) => (min === null ? "" : (min / 60).toLocaleString("de-CH", { maximumFractionDigits: 2 }));
const opt = (werte: Record<string, string>, gewaehlt = "") => Object.entries(werte).map(([k, v]) => `<option value="${k}"${k === gewaehlt ? " selected" : ""}>${esc(v)}</option>`).join("");
const betrag = (x: number | null) => (x === null ? '<span class="klein">Ansatz offen</span>' : esc(chf(x)));

// ---------------- pro Buchung ----------------
export async function buchungFinanzTeil(env: Env, u: AdminUser, b: Record<string, unknown>): Promise<string> {
  if (!u.permissions.includes("finance:read")) return "";
  const id = String(b.id);
  const zahlungen = await env.DB.prepare("SELECT id, paid_on, amount_rappen, method, note FROM payments WHERE booking_id = ?1 ORDER BY paid_on, id").bind(id).all<{ id: number; paid_on: string; amount_rappen: number; method: string; note: string | null }>();
  const auf = await env.DB.prepare("SELECT prints, km, minutes, note FROM booking_effort WHERE booking_id = ?1").bind(id).first<{ prints: number | null; km: number | null; minutes: number | null; note: string | null }>();
  const bezahlt = zahlungen.results.reduce((s, z) => s + z.amount_rappen, 0);
  const total = Number(b.total_rappen);
  const schreiben = u.permissions.includes("finance:write");
  const basis = `/admin/buchungen/${esc(id)}`;
  const kmHinweis = b.delivery && b.km_estimated ? `geschätzt: 2 Fahrten hin und zurück = 4 × ${b.km_estimated} km = ${4 * Number(b.km_estimated)} km` : "";
  return `<h2>Zahlungseingang</h2>
<p class="klein">Keine Zahlungsfunktion – hier hältst du nur fest, was du persönlich erhalten hast.</p>
<p><b>${esc(chf(bezahlt))}</b> von ${esc(chf(total))} erhalten ${bezahlt >= total && total > 0 ? '<span class="pill gruen">bezahlt</span>' : `<span class="pill gelb">offen ${esc(chf(total - bezahlt))}</span>`}</p>
${zahlungen.results.length ? `<div class="scroll" tabindex="0" role="region" aria-label="Zahlungseingänge"><table><thead><tr><th>Datum</th><th>Art</th><th class="zahl">Betrag</th><th>Notiz</th><th></th></tr></thead><tbody>
${zahlungen.results.map((z) => `<tr><td>${esc(datumCh(z.paid_on))}</td><td>${esc(ARTEN[z.method] ?? z.method)}</td><td class="zahl">${esc(chf(z.amount_rappen))}</td><td>${esc(z.note ?? "")}</td>
<td>${schreiben ? `<form class="zeile" method="post" action="${basis}/zahlung-weg"><input type="hidden" name="id" value="${z.id}"><button aria-label="Zahlung vom ${esc(datumCh(z.paid_on))} löschen">Löschen</button></form>` : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}
${schreiben ? `<form method="post" action="${basis}/zahlung"><div class="felder">
  <div><label for="zd">Erhalten am</label><input id="zd" type="date" name="datum" value="${heuteZurich()}" required></div>
  <div><label for="zb">Betrag CHF (Rückerstattung mit Minus)</label><input id="zb" name="betrag_chf" inputmode="decimal" value="${total - bezahlt > 0 ? chfFeld(total - bezahlt) : ""}" required></div>
  <div><label for="za">Art</label><select id="za" name="art">${opt(ARTEN, "twint")}</select></div>
  <div><label for="zn">Notiz</label><input id="zn" name="notiz" maxlength="200"></div>
  <div style="align-self:end"><button>Zahlung festhalten</button></div></div></form>` : ""}
<h2>Aufwand</h2>
<p class="klein">Für die Wirtschaftlichkeit. Leer = noch nicht erfasst.</p>
<form method="post" action="${basis}/aufwand"><div class="felder">
  <div><label for="ap">Gedruckte Abzüge</label><input id="ap" name="abzuege" inputmode="numeric" value="${auf?.prints ?? ""}"${schreiben ? "" : " disabled"}></div>
  <div><label for="ak">Gefahrene km (alle Fahrten)</label><input id="ak" name="km" inputmode="numeric" value="${auf?.km ?? ""}"${schreiben ? "" : " disabled"}>${kmHinweis ? `<span class="klein">${esc(kmHinweis)}</span>` : ""}</div>
  <div><label for="ah">Zeitaufwand in Stunden</label><input id="ah" name="stunden" inputmode="decimal" value="${stunden(auf?.minutes ?? null)}"${schreiben ? "" : " disabled"}><span class="klein">Vorbereitung, Fahrt, Aufbau, Abbau, Nacharbeit</span></div>
  <div class="breit"><label for="an">Notiz</label><input id="an" name="notiz" maxlength="500" value="${esc(auf?.note ?? "")}"${schreiben ? "" : " disabled"}></div>
  ${schreiben ? `<div><button>Aufwand speichern</button></div>` : ""}</div></form>`;
}

export async function zahlungErfassen(env: Env, u: AdminUser, id: string, form: Map<string, string>): Promise<Ok | Fehler> {
  const datum = form.get("datum") ?? "";
  const betragR = rappenAus(form.get("betrag_chf"), true);
  const art = form.get("art") ?? "";
  const notiz = (form.get("notiz") ?? "").slice(0, 200);
  if (!istTag(datum) || datum > heuteZurich()) return f(400, "datum", "Bitte ein gültiges Datum (nicht in der Zukunft) wählen.");
  if (betragR === null || betragR === 0) return f(400, "betrag", "Bitte einen Betrag eingeben (z. B. 450.00, Rückerstattung -50.00).");
  if (!ARTEN[art]) return f(400, "art", "Ungültige Zahlungsart.");
  const b = await env.DB.prepare("SELECT number FROM bookings WHERE id = ?1").bind(id).first<{ number: string }>();
  if (!b) return f(404, "unbekannt", "Diese Buchung gibt es nicht.");
  await env.DB.prepare("INSERT INTO payments (booking_id, paid_on, amount_rappen, method, note, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(id, datum, betragR, art, notiz || null, u.email).run();
  await protokolliere(env, u.email, "zahlung.erfasst", b.number, { datum, betrag_rappen: betragR, art });
  return { ok: true };
}

export async function zahlungLoeschen(env: Env, u: AdminUser, id: string, zahlungId: number): Promise<Ok | Fehler> {
  const r = await env.DB.prepare("DELETE FROM payments WHERE id = ?1 AND booking_id = ?2 RETURNING paid_on, amount_rappen, method").bind(zahlungId, id).first();
  if (!r) return f(404, "zahlung", "Diese Zahlung gibt es nicht.");
  await protokolliere(env, u.email, "zahlung.geloescht", id, r as Record<string, unknown>);
  return { ok: true };
}

export async function aufwandSpeichern(env: Env, u: AdminUser, id: string, form: Map<string, string>): Promise<Ok | Fehler> {
  const ganz = (k: string, max: number) => { const t = (form.get(k) ?? "").trim(); if (t === "") return null; return /^\d+$/.test(t) && Number(t) <= max ? Number(t) : NaN; };
  const prints = ganz("abzuege", 10000), km = ganz("km", 5000);
  const st = (form.get("stunden") ?? "").trim().replace(",", ".");
  const minuten = st === "" ? null : /^\d{1,3}(\.\d{1,2})?$/.test(st) ? Math.round(Number(st) * 60) : NaN;
  if ([prints, km, minuten].some((x) => Number.isNaN(x))) return f(400, "wert", "Bitte ganze Zahlen für Abzüge und km, Stunden z. B. 6.5.");
  if (!(await env.DB.prepare("SELECT 1 FROM bookings WHERE id = ?1").bind(id).first())) return f(404, "unbekannt", "Diese Buchung gibt es nicht.");
  const notiz = (form.get("notiz") ?? "").slice(0, 500) || null;
  await env.DB.prepare(`INSERT INTO booking_effort (booking_id, prints, km, minutes, note, updated_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT (booking_id) DO UPDATE SET prints = ?2, km = ?3, minutes = ?4, note = ?5, updated_by = ?6, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .bind(id, prints, km, minuten, notiz, u.email).run();
  await protokolliere(env, u.email, "aufwand.gespeichert", id, { prints, km, minuten });
  return { ok: true };
}

// ---------------- Ausgaben, Anschaffungen, Fixkosten ----------------
export async function ausgabeErfassen(env: Env, u: AdminUser, form: Map<string, string>): Promise<Ok | Fehler> {
  const datum = form.get("datum") ?? "", kat = form.get("kategorie") ?? "", text = (form.get("beschreibung") ?? "").trim();
  const betragR = rappenAus(form.get("betrag_chf"));
  const beleg = (form.get("beleg") ?? "").trim().slice(0, 80) || null;
  const nummer = (form.get("buchung") ?? "").trim();
  if (!istTag(datum)) return f(400, "datum", "Bitte ein gültiges Datum wählen.");
  if (betragR === null || betragR <= 0) return f(400, "betrag", "Bitte einen Betrag eingeben (z. B. 89.90).");
  if (!KATEGORIEN[kat]) return f(400, "kategorie", "Bitte eine Kategorie wählen.");
  if (text.length < 2 || text.length > 200) return f(400, "beschreibung", "Beschreibung 2–200 Zeichen.");
  let bookingId: string | null = null;
  if (nummer) {
    const b = await env.DB.prepare("SELECT id FROM bookings WHERE number = ?1").bind(nummer).first<{ id: string }>();
    if (!b) return f(400, "buchung", `Buchung ${nummer} nicht gefunden (Format FK-2027-0001).`);
    bookingId = b.id;
  }
  await env.DB.prepare("INSERT INTO expenses (spent_on, amount_rappen, category, description, receipt_ref, booking_id, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
    .bind(datum, betragR, kat, text, beleg, bookingId, u.email).run();
  await protokolliere(env, u.email, "ausgabe.erfasst", null, { datum, betrag_rappen: betragR, kat, text });
  return { ok: true };
}

export async function anlageErfassen(env: Env, u: AdminUser, form: Map<string, string>): Promise<Ok | Fehler> {
  const name = (form.get("name") ?? "").trim(), datum = form.get("datum") ?? "", jahre = Number(form.get("jahre"));
  const betragR = rappenAus(form.get("betrag_chf"));
  if (name.length < 2 || name.length > 80) return f(400, "name", "Bezeichnung 2–80 Zeichen.");
  if (!istTag(datum)) return f(400, "datum", "Bitte das Kaufdatum wählen.");
  if (betragR === null || betragR <= 0) return f(400, "betrag", "Bitte den Kaufpreis eingeben.");
  if (!Number.isInteger(jahre) || jahre < 1 || jahre > 20) return f(400, "jahre", "Nutzungsdauer 1–20 Jahre.");
  await env.DB.prepare("INSERT INTO assets (name, purchased_on, amount_rappen, life_years, note) VALUES (?1, ?2, ?3, ?4, ?5)").bind(name, datum, betragR, jahre, (form.get("notiz") ?? "").slice(0, 200) || null).run();
  await protokolliere(env, u.email, "anlage.erfasst", name, { datum, betrag_rappen: betragR, jahre });
  return { ok: true };
}

export async function fixkostenErfassen(env: Env, u: AdminUser, form: Map<string, string>): Promise<Ok | Fehler> {
  const name = (form.get("name") ?? "").trim(), von = form.get("von") ?? "", bis = form.get("bis") ?? "";
  const betragR = rappenAus(form.get("betrag_chf"));
  if (name.length < 2 || name.length > 80) return f(400, "name", "Bezeichnung 2–80 Zeichen.");
  if (betragR === null || betragR <= 0) return f(400, "betrag", "Bitte den Betrag pro Jahr eingeben.");
  if (!istTag(von) || (bis && (!istTag(bis) || bis < von))) return f(400, "datum", "Bitte einen gültigen Zeitraum wählen.");
  await env.DB.prepare("INSERT INTO fixed_costs (name, amount_rappen_year, valid_from, valid_to) VALUES (?1, ?2, ?3, ?4)").bind(name, betragR, von, bis || null).run();
  await protokolliere(env, u.email, "fixkosten.erfasst", name, { betrag_rappen: betragR, von, bis });
  return { ok: true };
}

const TABELLEN: Record<string, string> = { ausgabe: "expenses", anlage: "assets", fixkosten: "fixed_costs" };
export async function eintragLoeschen(env: Env, u: AdminUser, art: string, id: number): Promise<Ok | Fehler> {
  const t = TABELLEN[art];
  if (!t) return f(400, "art", "Unbekannt.");
  const r = await env.DB.prepare(`DELETE FROM ${t} WHERE id = ?1 RETURNING *`).bind(id).first();
  if (!r) return f(404, "eintrag", "Dieser Eintrag existiert nicht.");
  await protokolliere(env, u.email, `${art}.geloescht`, String(id), r as Record<string, unknown>);
  return { ok: true };
}

// ---------------- Auswertung ----------------
export async function lade(env: Env, jahr: number) {
  const s = await einstellungen(env);
  const von = `${jahr}-01-01`, bis = `${jahr}-12-31`;
  const buchungen = await env.DB.prepare(
    `SELECT b.id, b.number, b.event_day, b.status, p.name AS package_name, b.total_rappen,
       COALESCE((SELECT SUM(amount_rappen) FROM payments z WHERE z.booking_id = b.id), 0) AS bezahlt_rappen,
       e.prints, e.km, e.minutes,
       COALESCE((SELECT SUM(amount_rappen) FROM expenses x WHERE x.booking_id = b.id), 0) AS direkte_ausgaben_rappen
     FROM bookings b JOIN packages p ON p.slug = b.package_slug LEFT JOIN booking_effort e ON e.booking_id = b.id
     WHERE b.status IN ('confirmed', 'completed') AND b.event_day BETWEEN ?1 AND ?2 ORDER BY b.event_day`,
  ).bind(von, bis).all<Buchung>();
  const ein = await env.DB.prepare("SELECT COALESCE(SUM(amount_rappen), 0) AS n FROM payments WHERE paid_on BETWEEN ?1 AND ?2").bind(von, bis).first<{ n: number }>();
  const ausgaben = await env.DB.prepare("SELECT id, spent_on, amount_rappen, category, description, receipt_ref, booking_id FROM expenses WHERE spent_on BETWEEN ?1 AND ?2 ORDER BY spent_on, id").bind(von, bis)
    .all<{ id: number; spent_on: string; amount_rappen: number; category: string; description: string; receipt_ref: string | null; booking_id: string | null }>();
  const anlagen = await env.DB.prepare("SELECT id, name, purchased_on, amount_rappen, life_years FROM assets ORDER BY purchased_on").all<{ id: number; name: string; purchased_on: string; amount_rappen: number; life_years: number }>();
  const fix = await env.DB.prepare("SELECT id, name, amount_rappen_year, valid_from, valid_to FROM fixed_costs ORDER BY valid_from").all<{ id: number; name: string; amount_rappen_year: number; valid_from: string; valid_to: string | null }>();
  const ansaetze = { material_pro_abzug: Number(s.print_cost_rappen ?? 15), pro_km: (s.cost_per_km_rappen as number | null) ?? null, pro_stunde: (s.hourly_rate_rappen as number | null) ?? null };
  const auswertung = jahresauswertung({ jahr, heute: heuteZurich(), ansaetze, buchungen: buchungen.results, eingenommen: ein?.n ?? 0, ausgaben: ausgaben.results, anlagen: anlagen.results, fixkosten: fix.results });
  return { auswertung, ausgaben: ausgaben.results, anlagen: anlagen.results, fixkosten: fix.results, ansaetze };
}

export async function finanzenSeite(env: Env, u: AdminUser, url: URL): Promise<string> {
  const heute = heuteZurich();
  const jahr = Number(url.searchParams.get("jahr")) || Number(heute.slice(0, 4));
  const { auswertung: a, ausgaben, anlagen, fixkosten, ansaetze } = await lade(env, jahr);
  const schreiben = u.permissions.includes("finance:write");
  const loesch = (art: string, id: number, text: string) => schreiben ? `<form class="zeile" method="post" action="/admin/finanzen/${art}/${id}/loeschen"><input type="hidden" name="jahr" value="${jahr}"><button aria-label="${esc(text)} löschen">Löschen</button></form>` : "";
  const zeile = (text: string, wert: string, fett = false, hilfe = "") => `<tr><td>${fett ? `<b>${text}</b>` : text}${hilfe ? `<br><span class="klein">${hilfe}</span>` : ""}</td><td class="zahl">${fett ? `<b>${wert}</b>` : wert}</td></tr>`;
  const inhalt = `<form class="filter" method="get" action="/admin/finanzen"><div><label for="j">Jahr</label><select id="j" name="jahr">${[jahr - 2, jahr - 1, jahr, jahr + 1].map((j) => `<option${j === jahr ? " selected" : ""}>${j}</option>`).join("")}</select></div><button>Anzeigen</button>
<a class="knopf" href="/admin/finanzen/export.csv?jahr=${jahr}">CSV für Treuhand/Steuern</a></form>
${a.offene_ansaetze.length ? `<p class="hinweis">Noch offen: ${a.offene_ansaetze.map(esc).join(", ")} – unter <a href="/admin/einstellungen">Einstellungen → Kosten-Ansätze</a> eintragen. Bis dahin fehlen die kalkulatorischen Kosten.</p>` : ""}
${a.buchungen.some((b) => b.aufwand_fehlt && b.event_day <= heute) ? `<p class="hinweis">Bei ${a.buchungen.filter((b) => b.aufwand_fehlt && b.event_day <= heute).length} vergangenen Buchung(en) fehlt der Aufwand (Abzüge, km oder Stunden) – im Buchungsdetail ergänzen.</p>` : ""}
<div class="karten">
  <div class="karte"><span class="klein">Eingenommen ${jahr}</span><b>${esc(chf(a.eingenommen))}</b><span class="klein">laut erfassten Zahlungen</span></div>
  <div class="karte"><span class="klein">Ergebnis (Geld)</span><b>${esc(chf(a.ergebnis_geld))}</b><span class="klein">vor eigener Arbeit und Fahrzeug</span></div>
  <div class="karte"><span class="klein">Effektiver Stundenlohn</span><b>${a.stundenlohn === null ? "–" : esc(chf(a.stundenlohn))}</b><span class="klein">${a.stunden} Std. erfasst${a.stundenlohn === null ? " · km-Ansatz oder Stunden fehlen" : ""}</span></div>
  <div class="karte"><span class="klein">Break-even</span><b>${a.break_even.buchungen_noetig ?? "–"}</b><span class="klein">Buchungen pro Jahr nötig für Fixkosten + Abschreibung${a.break_even.db_durchschnitt === null ? " (noch keine Buchung mit Aufwand)" : ""}</span></div>
</div>
<h2>Rechnung ${jahr}</h2>
<div class="scroll" tabindex="0" role="region" aria-label="Jahresrechnung"><table style="min-width:28rem"><tbody>
${zeile("Gebucht (Events im Jahr)", esc(chf(a.gebucht)), false, `${a.anzahl} Buchungen, bestätigt oder abgeschlossen`)}
${zeile("Eingenommen (Zahlungen im Jahr)", esc(chf(a.eingenommen)), true)}
${zeile("Noch offen (vergangene Events)", esc(chf(a.offen)))}
${zeile("− Material", esc(chf(a.material)), false, `erfasste Abzüge × ${esc(chf(ansaetze.material_pro_abzug))}`)}
${zeile("− Ausgaben", esc(chf(a.ausgaben)), false, Object.entries(a.ausgaben_nach_kategorie).map(([k, v]) => `${esc(KATEGORIEN[k] ?? k)} ${esc(chf(v))}`).join(" · "))}
${zeile("− Fixkosten (anteilig)", esc(chf(a.fixkosten)))}
${zeile("− Abschreibung", esc(chf(a.abschreibung)), false, "linear über die Nutzungsdauer")}
${zeile("= Ergebnis (Geld)", esc(chf(a.ergebnis_geld)), true)}
${zeile("− Fahrzeug (kalkulatorisch)", betrag(a.fahrzeug), false, `${a.km} km`)}
${zeile("− eigene Arbeit (kalkulatorisch)", betrag(a.arbeit), false, `${a.stunden} Std.`)}
${zeile("= Ergebnis nach Lohn und Fahrzeug", a.ergebnis_kalkulatorisch === null ? '<span class="klein">Ansätze offen</span>' : esc(chf(a.ergebnis_kalkulatorisch)), true, "Positiv = die Arbeit ist mehr wert als dein Stundenansatz")}
</tbody></table></div>
<h2>Pro Buchung</h2>
<div class="scroll" tabindex="0" role="region" aria-label="Wirtschaftlichkeit pro Buchung"><table><thead><tr><th>Buchung</th><th class="zahl">Umsatz</th><th class="zahl">Bezahlt</th><th class="zahl">Material</th><th class="zahl">Direkte Ausgaben</th><th class="zahl">Fahrzeug</th><th class="zahl">Deckungsbeitrag</th><th class="zahl">Std.</th><th class="zahl">pro Std.</th></tr></thead><tbody>
${a.buchungen.map((b) => `<tr><td><a href="/admin/buchungen/${esc(b.id)}">${esc(b.number)}</a><br><span class="klein">${esc(datumCh(b.event_day))} · ${esc(b.package_name)} · ${esc(STATUS[b.status] ?? b.status)}${b.aufwand_fehlt ? " · Aufwand fehlt" : ""}</span></td>
<td class="zahl">${esc(chf(b.total_rappen))}</td><td class="zahl">${esc(chf(b.bezahlt_rappen))}</td><td class="zahl">${esc(chf(b.material))}</td><td class="zahl">${esc(chf(b.direkte_ausgaben_rappen))}</td>
<td class="zahl">${betrag(b.fahrzeug)}</td><td class="zahl"><b>${esc(chf(b.deckungsbeitrag))}</b></td><td class="zahl">${esc(stunden(b.minutes) || "–")}</td><td class="zahl">${b.pro_stunde === null ? "–" : esc(chf(b.pro_stunde))}</td></tr>`).join("") || '<tr><td colspan="9" class="klein">Keine Buchungen in diesem Jahr.</td></tr>'}
</tbody></table></div>
<p class="klein">Deckungsbeitrag = Umsatz − Material − direkte Ausgaben − Fahrzeug. Er muss Fixkosten, Abschreibung und deine Arbeit decken.</p>

<h2>Ausgaben ${jahr}</h2>
<div class="scroll" tabindex="0" role="region" aria-label="Ausgaben"><table><thead><tr><th>Datum</th><th>Kategorie</th><th>Beschreibung</th><th>Beleg</th><th class="zahl">Betrag</th><th></th></tr></thead><tbody>
${ausgaben.map((x) => `<tr><td>${esc(datumCh(x.spent_on))}</td><td>${esc(KATEGORIEN[x.category] ?? x.category)}</td><td>${esc(x.description)}</td><td>${esc(x.receipt_ref ?? "")}</td><td class="zahl">${esc(chf(x.amount_rappen))}</td><td>${loesch("ausgabe", x.id, `Ausgabe ${x.description}`)}</td></tr>`).join("") || '<tr><td colspan="6" class="klein">Keine Ausgaben erfasst.</td></tr>'}
</tbody></table></div>
${schreiben ? `<form method="post" action="/admin/finanzen/ausgabe"><input type="hidden" name="jahr" value="${jahr}"><div class="felder">
  <div><label for="ad">Datum</label><input id="ad" type="date" name="datum" value="${heute}" required></div>
  <div><label for="ab">Betrag CHF</label><input id="ab" name="betrag_chf" inputmode="decimal" required></div>
  <div><label for="ak">Kategorie</label><select id="ak" name="kategorie">${opt(KATEGORIEN)}</select></div>
  <div class="breit"><label for="at">Beschreibung</label><input id="at" name="beschreibung" required maxlength="200" placeholder="z. B. Papier und Farbband DS620 (2 Rollen)"></div>
  <div><label for="ar">Beleg (wo abgelegt)</label><input id="ar" name="beleg" maxlength="80" placeholder="z. B. Ordner 2027 / Nr. 12"></div>
  <div><label for="ag">Zu Buchung (optional)</label><input id="ag" name="buchung" placeholder="FK-2027-0001"></div>
  <div style="align-self:end"><button>Ausgabe erfassen</button></div></div></form>` : ""}

<h2>Anschaffungen</h2>
<div class="scroll" tabindex="0" role="region" aria-label="Anschaffungen"><table><thead><tr><th>Bezeichnung</th><th>Gekauft</th><th class="zahl">Preis</th><th class="zahl">Jahre</th><th class="zahl">Abschreibung ${jahr}</th><th></th></tr></thead><tbody>
${anlagen.map((x) => { const ab = Math.floor(x.amount_rappen / x.life_years); return `<tr><td>${esc(x.name)}</td><td>${esc(datumCh(x.purchased_on))}</td><td class="zahl">${esc(chf(x.amount_rappen))}</td><td class="zahl">${x.life_years}</td><td class="zahl">${jahr >= Number(x.purchased_on.slice(0, 4)) && jahr < Number(x.purchased_on.slice(0, 4)) + x.life_years ? esc(chf(ab)) : "–"}</td><td>${loesch("anlage", x.id, `Anschaffung ${x.name}`)}</td></tr>`; }).join("") || '<tr><td colspan="6" class="klein">Keine Anschaffungen erfasst.</td></tr>'}
</tbody></table></div>
${schreiben ? `<form method="post" action="/admin/finanzen/anlage"><input type="hidden" name="jahr" value="${jahr}"><div class="felder">
  <div><label for="nn">Bezeichnung</label><input id="nn" name="name" required maxlength="80" placeholder="z. B. Drucker DNP DS620"></div>
  <div><label for="nd">Gekauft am</label><input id="nd" type="date" name="datum" required></div>
  <div><label for="nb">Kaufpreis CHF</label><input id="nb" name="betrag_chf" inputmode="decimal" required></div>
  <div><label for="nj">Nutzungsdauer (Jahre)</label><input id="nj" name="jahre" inputmode="numeric" required placeholder="z. B. 4"></div>
  <div style="align-self:end"><button>Anschaffung erfassen</button></div></div></form>` : ""}

<h2>Fixkosten</h2>
<div class="scroll" tabindex="0" role="region" aria-label="Fixkosten"><table><thead><tr><th>Bezeichnung</th><th>Gültig</th><th class="zahl">pro Jahr</th><th></th></tr></thead><tbody>
${fixkosten.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(datumCh(x.valid_from))} – ${x.valid_to ? esc(datumCh(x.valid_to)) : "laufend"}</td><td class="zahl">${esc(chf(x.amount_rappen_year))}</td><td>${loesch("fixkosten", x.id, `Fixkosten ${x.name}`)}</td></tr>`).join("") || '<tr><td colspan="4" class="klein">Keine Fixkosten erfasst.</td></tr>'}
</tbody></table></div>
${schreiben ? `<form method="post" action="/admin/finanzen/fixkosten"><input type="hidden" name="jahr" value="${jahr}"><div class="felder">
  <div><label for="fn">Bezeichnung</label><input id="fn" name="name" required maxlength="80" placeholder="z. B. Betriebshaftpflicht"></div>
  <div><label for="fb">Betrag pro Jahr CHF</label><input id="fb" name="betrag_chf" inputmode="decimal" required></div>
  <div><label for="fv">Gültig ab</label><input id="fv" type="date" name="von" required></div>
  <div><label for="fz">bis (leer = laufend)</label><input id="fz" type="date" name="bis"></div>
  <div style="align-self:end"><button>Fixkosten erfassen</button></div></div></form>` : ""}
<p class="klein">Ansätze (Material pro Abzug, Fahrzeug pro km, Stundenansatz) unter <a href="/admin/einstellungen">Einstellungen → Kosten-Ansätze</a>.</p>`;
  return rahmen(u, "Finanzen", "/admin/finanzen", inhalt, url);
}

export async function csvExport(env: Env, url: URL): Promise<Response> {
  const jahr = Number(url.searchParams.get("jahr")) || Number(heuteZurich().slice(0, 4));
  const von = `${jahr}-01-01`, bis = `${jahr}-12-31`;
  const ein = await env.DB.prepare("SELECT z.paid_on, z.amount_rappen, z.method, z.note, b.number, b.contact_name FROM payments z JOIN bookings b ON b.id = z.booking_id WHERE z.paid_on BETWEEN ?1 AND ?2 ORDER BY z.paid_on").bind(von, bis)
    .all<{ paid_on: string; amount_rappen: number; method: string; note: string | null; number: string; contact_name: string }>();
  const aus = await env.DB.prepare("SELECT x.spent_on, x.amount_rappen, x.category, x.description, x.receipt_ref, b.number FROM expenses x LEFT JOIN bookings b ON b.id = x.booking_id WHERE x.spent_on BETWEEN ?1 AND ?2 ORDER BY x.spent_on").bind(von, bis)
    .all<{ spent_on: string; amount_rappen: number; category: string; description: string; receipt_ref: string | null; number: string | null }>();
  const z: (string | number | null)[][] = [["Datum", "Art", "Betrag CHF", "Zahlungsart/Kategorie", "Beschreibung", "Buchung", "Beleg"]];
  for (const e of ein.results) z.push([e.paid_on, "Einnahme", (e.amount_rappen / 100).toFixed(2), ARTEN[e.method] ?? e.method, `${e.contact_name}${e.note ? ` – ${e.note}` : ""}`, e.number, null]);
  for (const x of aus.results) z.push([x.spent_on, "Ausgabe", (-x.amount_rappen / 100).toFixed(2), KATEGORIEN[x.category] ?? x.category, x.description, x.number, x.receipt_ref]);
  z.splice(1, z.length - 1, ...z.slice(1).sort((p, q) => String(p[0]).localeCompare(String(q[0]))));
  return withSecurityHeaders(new Response(csv(z), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="einnahmen-ausgaben-${jahr}.csv"` } }));
}
