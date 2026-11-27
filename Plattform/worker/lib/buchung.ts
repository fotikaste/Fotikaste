/**
 * Buchungsablauf (Phase 3): Angebot prüfen → Termin halten (15 Min.) → verbindlich abschliessen.
 * Preise werden ausschliesslich hier berechnet. Doppelbuchungen verhindert die Datenbank selbst:
 * `allocation_days` hat UNIQUE(resource_id, day, slot), alle Schritte laufen als atomarer batch().
 */
import type { Env } from "../env";
import { brand } from "../../src/config/brand";
import { heuteZurich, istTag, plusTage, tageVonBis, tageZwischen } from "./datum";
import { zufallsId } from "./id";
import { mailEinreihen, type Mail } from "./mail";
import { chf, fahrtRappen, findeZone, geschaetzteKm, luftlinieKm, position, summe, zusatztage, type Position, type Zone } from "./preis";

export interface Wahl {
  paket: string;
  event: string;
  start: string;
  ende: string;
  lieferung: boolean;
  plz: string | null;
  stornierbar: boolean;
}

export interface Belegung {
  resource_id: string;
  day: string;
}

export interface Angebot {
  wahl: Wahl;
  paketName: string;
  positionen: Position[];
  total_rappen: number;
  preisFix: boolean;
  modus: "direkt" | "anfrage";
  grund: string | null;
  zoneId: number | null;
  km: number | null;
  ort: string | null;
  stornoBis: string | null;
  belegung: Belegung[];
  frei: boolean;
  belegteTage: string[];
}

export type Fehler = { status: number; code: string; text: string };
const f = (status: number, code: string, text: string): Fehler => ({ status, code, text });
export const istFehler = (x: unknown): x is Fehler => typeof x === "object" && x !== null && "code" in x && "status" in x;

const iso = (d: Date) => d.toISOString();
export const datumCh = (tag: string) => `${tag.slice(8, 10)}.${tag.slice(5, 7)}.${tag.slice(0, 4)}`;

/** Alle Einstellungen als Objekt (JSON-Werte). */
export async function einstellungen(env: Env): Promise<Record<string, unknown>> {
  const r = await env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  return Object.fromEntries(r.results.map((x) => [x.key, JSON.parse(x.value)]));
}
const zahl = (s: Record<string, unknown>, k: string, std: number) => (typeof s[k] === "number" ? (s[k] as number) : std);

async function zonen(env: Env): Promise<Zone[]> {
  const r = await env.DB.prepare("SELECT * FROM delivery_zones WHERE active = 1 ORDER BY sort, id").all<Zone & { cantons: string; plz_ranges: string }>();
  return r.results.map((z) => ({ ...z, cantons: JSON.parse(z.cantons as unknown as string), plz_ranges: JSON.parse(z.plz_ranges as unknown as string) }));
}

async function ortVon(env: Env, plz: string) {
  return env.DB.prepare("SELECT plz, ort, kanton, lat, lon FROM postal_codes WHERE plz = ?1 ORDER BY ort LIMIT 1").bind(plz).first<{ plz: string; ort: string; kanton: string; lat: number; lon: number }>();
}

/** Eingabe prüfen und normalisieren. Unbekannte Felder werden ignoriert. */
export function leseWahl(x: unknown): Wahl | Fehler {
  const o = (x ?? {}) as Record<string, unknown>;
  if (typeof o.paket !== "string" || !/^[a-z]{2,20}$/.test(o.paket)) return f(400, "paket", "Bitte ein Paket wählen.");
  for (const k of ["event", "start", "ende"] as const) if (!istTag(o[k])) return f(400, "datum", "Bitte gültige Daten wählen.");
  const lieferung = o.lieferung === true;
  const plz = typeof o.plz === "string" ? o.plz.trim() : "";
  if (lieferung && !/^\d{4}$/.test(plz)) return f(400, "plz", "Bitte eine vierstellige Postleitzahl angeben.");
  return { paket: o.paket, event: o.event as string, start: o.start as string, ende: o.ende as string, lieferung, plz: lieferung ? plz : null, stornierbar: o.stornierbar === true };
}

/** Angebot berechnen und Verfügbarkeit prüfen (schreibt nichts). */
export async function berechneAngebot(env: Env, wahl: Wahl, jetzt = new Date()): Promise<Angebot | Fehler> {
  const s = await einstellungen(env);
  const heute = heuteZurich(jetzt);
  const { event, start, ende } = wahl;
  if (!(start <= event && event <= ende)) return f(400, "datum", "Der Eventtag muss innerhalb der Mietdauer liegen.");
  const mietTage = tageZwischen(start, ende) + 1;
  if (mietTage > zahl(s, "booking_max_days", 7)) return f(400, "dauer", `Online sind höchstens ${zahl(s, "booking_max_days", 7)} Miettage möglich. Für längere Mieten bitte Kontakt aufnehmen.`);
  const vorlauf = tageZwischen(heute, start);
  if (vorlauf < 1) return f(400, "kurzfristig", "Der Mietbeginn muss frühestens morgen sein.");
  if (tageZwischen(heute, ende) > zahl(s, "booking_horizon_days", 550)) return f(400, "zu_weit", "So weit im Voraus ist noch keine Buchung möglich.");

  const paket = await env.DB.prepare("SELECT slug, name, price_rappen, prints FROM packages WHERE slug = ?1 AND visible = 1").bind(wahl.paket).first<{ slug: string; name: string; price_rappen: number; prints: number | null }>();
  if (!paket) return f(400, "paket", "Dieses Paket gibt es nicht.");

  const positionen: Position[] = [position("paket", `Paket ${paket.name}${paket.prints ? ` (${paket.prints} Abzüge inbegriffen)` : " (ohne Drucker)"}`, 1, paket.price_rappen)];
  const inbegriffen = zahl(s, "booking_included_days", 2);
  const extra = zusatztage(mietTage, inbegriffen);
  if (extra > 0) positionen.push(position("zusatztag", `Zusätzlicher Miettag (über ${inbegriffen} Tage)`, extra, zahl(s, "booking_extra_day_rappen", 4500)));

  let modus: Angebot["modus"] = "direkt";
  let grund: string | null = null;
  let preisFix = true;
  let zone: Zone | null = null;
  let km: number | null = null;
  let ort: string | null = null;
  let minVorlauf = zahl(s, "booking_min_lead_days", 7);

  if (wahl.lieferung) {
    const ziel = await ortVon(env, wahl.plz!);
    const herkunft = await ortVon(env, String(s.delivery_origin_plz ?? ""));
    ort = ziel?.ort ?? null;
    zone = findeZone(await zonen(env), wahl.plz!, ziel?.kanton ?? null);
    if (ziel && herkunft) km = geschaetzteKm(luftlinieKm(herkunft, ziel), zahl(s, "delivery_detour_factor", 1.3));
    if (zone && zone.max_km !== null && km !== null && km > zone.max_km) zone = null;
    if (!zone || km === null) {
      modus = "anfrage";
      preisFix = false;
      grund = !ziel ? "Postleitzahl nicht im Verzeichnis – Fahrtkosten werden bestätigt" : "ausserhalb des Liefergebiets – Fahrtkosten werden bestätigt";
    } else {
      positionen.push(position("fahrt", `Lieferung und Abholung (${km} km ab ${herkunft!.plz} ${herkunft!.ort}, geschätzt)`, 1, fahrtRappen(km, zone)));
      minVorlauf = zone.min_lead_days;
      if (!zone.instant_booking) [modus, grund] = ["anfrage", "für dieses Liefergebiet nur auf Anfrage"];
    }
  }
  if (modus === "direkt" && vorlauf < minVorlauf) [modus, grund] = ["anfrage", `kurzfristig (weniger als ${minVorlauf} Tage im Voraus)`];

  let stornoBis: string | null = null;
  if (wahl.stornierbar) {
    const tage = zahl(s, "flex_cancel_days", 28);
    if (tageZwischen(heute, event) <= tage) return f(400, "storno", `Die Option «stornierbar» ist nur mehr als ${tage} Tage vor dem Event buchbar.`);
    stornoBis = plusTage(event, -tage);
    positionen.push(position("storno", `Option «stornierbar» (kostenlose Absage bis ${datumCh(stornoBis)})`, 1, zahl(s, "flex_cancel_rappen", 2000)));
  }

  // Belegung: Fotobox jeden Miettag (+ Puffer laut Zone), Lieferung am Liefer- und Abholtag.
  const vor = zone?.buffer_days_before ?? 0;
  const nach = zone?.buffer_days_after ?? 0;
  const belegung: Belegung[] = tageVonBis(plusTage(start, -vor), plusTage(ende, nach)).map((day) => ({ resource_id: "fotobox-1", day }));
  if (wahl.lieferung) for (const day of new Set([start, ende])) belegung.push({ resource_id: "lieferung", day });
  const belegteTage = await belegt(env, belegung, jetzt);

  return {
    wahl, paketName: paket.name, positionen, total_rappen: summe(positionen), preisFix, modus, grund,
    zoneId: zone?.id ?? null, km, ort, stornoBis, belegung, frei: belegteTage.length === 0, belegteTage,
  };
}

/** Welche der gewünschten Tage sind schon voll? (abgelaufene Holds zählen nicht) */
async function belegt(env: Env, belegung: Belegung[], jetzt: Date): Promise<string[]> {
  if (belegung.length === 0) return [];
  const r = await env.DB.prepare(
    `SELECT d.resource_id, d.day, COUNT(*) AS n, r.capacity FROM allocation_days d
     JOIN allocations a ON a.id = d.allocation_id JOIN resources r ON r.id = d.resource_id
     WHERE d.day >= ?1 AND d.day <= ?2 AND NOT (a.type = 'hold' AND a.expires_at <= ?3)
     GROUP BY d.resource_id, d.day`,
  ).bind(belegung.reduce((m, b) => (b.day < m ? b.day : m), "9999"), belegung.reduce((m, b) => (b.day > m ? b.day : m), "0000"), iso(jetzt))
    .all<{ resource_id: string; day: string; n: number; capacity: number }>();
  const voll = new Set(r.results.filter((x) => x.n >= x.capacity).map((x) => `${x.resource_id}|${x.day}`));
  return [...new Set(belegung.filter((b) => voll.has(`${b.resource_id}|${b.day}`)).map((b) => b.day))].sort();
}

/** Belegte Tage der Fotobox in einem Zeitraum (für den öffentlichen Kalender, ohne Personendaten). */
export async function kalender(env: Env, von: string, bis: string, jetzt = new Date()) {
  const r = await env.DB.prepare(
    `SELECT DISTINCT d.day FROM allocation_days d JOIN allocations a ON a.id = d.allocation_id JOIN resources r ON r.id = d.resource_id
     WHERE r.type = 'device' AND d.day >= ?1 AND d.day <= ?2 AND NOT (a.type = 'hold' AND a.expires_at <= ?3) ORDER BY d.day`,
  ).bind(von, bis, iso(jetzt)).all<{ day: string }>();
  const s = await einstellungen(env);
  return { belegt: r.results.map((x) => x.day), heute: heuteZurich(jetzt), vorlaufTage: zahl(s, "booking_min_lead_days", 7) };
}

/**
 * Termin halten: alle Tage in EINEM batch(). Ist irgendein Tag schon belegt, verletzt das UNIQUE
 * und der ganze batch wird zurückgerollt → kein halber Hold, keine Doppelbuchung.
 */
export async function halte(env: Env, angebot: Angebot, jetzt = new Date()): Promise<{ id: string; gueltigBis: string } | Fehler> {
  if (!angebot.frei) return f(409, "belegt", "Dieser Termin ist leider nicht mehr frei.");
  const s = await einstellungen(env);
  const id = zufallsId();
  const gueltigBis = iso(new Date(jetzt.getTime() + zahl(s, "booking_hold_minutes", 15) * 60_000));
  // Slot je Ressource und Tag: der kleinste freie (bei Kapazität 1 immer Slot 1). Kommt jemand zuvor, schlägt UNIQUE an.
  const res = await env.DB.prepare("SELECT id, capacity FROM resources WHERE active = 1").all<{ id: string; capacity: number }>();
  const kapazitaet = new Map(res.results.map((r) => [r.id, r.capacity]));
  const slots: number[] = [];
  for (const b of angebot.belegung) {
    const kap = kapazitaet.get(b.resource_id) ?? 1;
    if (kap === 1) {
      slots.push(1);
      continue;
    }
    const r = await env.DB.prepare("SELECT d.slot FROM allocation_days d JOIN allocations a ON a.id = d.allocation_id WHERE d.resource_id = ?1 AND d.day = ?2 AND NOT (a.type = 'hold' AND a.expires_at <= ?3)")
      .bind(b.resource_id, b.day, iso(jetzt)).all<{ slot: number }>();
    const besetzt = new Set(r.results.map((x) => x.slot));
    const frei = Array.from({ length: kap }, (_, i) => i + 1).find((x) => !besetzt.has(x));
    if (frei === undefined) return f(409, "belegt", "Dieser Termin ist leider nicht mehr frei.");
    slots.push(frei);
  }
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM allocations WHERE type = 'hold' AND expires_at <= ?1").bind(iso(jetzt)),
      env.DB.prepare("INSERT INTO allocations (id, type, request, expires_at) VALUES (?1, 'hold', ?2, ?3)").bind(id, JSON.stringify(angebot), gueltigBis),
      ...angebot.belegung.map((b, i) => env.DB.prepare("INSERT INTO allocation_days (allocation_id, resource_id, day, slot) VALUES (?1, ?2, ?3, ?4)").bind(id, b.resource_id, b.day, slots[i])),
    ]);
  } catch (e) {
    if (String(e).includes("UNIQUE")) return f(409, "belegt", "Dieser Termin wurde gerade von jemand anderem reserviert.");
    throw e;
  }
  return { id, gueltigBis };
}

export async function gibHoldFrei(env: Env, id: string) {
  await env.DB.prepare("DELETE FROM allocations WHERE id = ?1 AND type = 'hold'").bind(id).run();
}

export interface Kontakt {
  name: string;
  firma: string | null;
  email: string;
  telefon: string;
  strasse: string | null;
  gaeste: number | null;
  nachricht: string | null;
}

export function leseKontakt(x: unknown, lieferung: boolean): Kontakt | Fehler {
  const o = (x ?? {}) as Record<string, unknown>;
  const text = (k: string, max: number) => (typeof o[k] === "string" ? (o[k] as string).trim().slice(0, max) : "");
  const name = text("name", 100);
  const email = text("email", 254).toLowerCase();
  const telefon = text("telefon", 30);
  const strasse = text("strasse", 120);
  if (name.length < 2) return f(400, "name", "Bitte Vor- und Nachnamen angeben.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return f(400, "email", "Bitte eine gültige E-Mail-Adresse angeben.");
  if (!/^\+?[\d\s()/-]{6,30}$/.test(telefon)) return f(400, "telefon", "Bitte eine gültige Telefonnummer angeben.");
  if (lieferung && strasse.length < 3) return f(400, "strasse", "Bitte Strasse und Hausnummer des Eventorts angeben.");
  const g = o.gaeste === undefined || o.gaeste === null || o.gaeste === "" ? null : Number(o.gaeste);
  if (g !== null && !(Number.isInteger(g) && g >= 1 && g <= 5000)) return f(400, "gaeste", "Bitte eine gültige Gästezahl angeben.");
  if (o.agb !== true) return f(400, "agb", "Bitte die AGB akzeptieren.");
  return { name, firma: text("firma", 100) || null, email, telefon, strasse: lieferung ? strasse : null, gaeste: g, nachricht: text("nachricht", 2000) || null };
}

/** Zahlung: immer persönlich vereinbart (Entscheid Inhaber 2026-11-26) – keine Zahlungsfunktion, keine Bankdaten, keine Erinnerungen. */
export const ZAHLUNG_TEXT = "Online wird nichts bezahlt. Wir melden uns persönlich bei Ihnen, um die Zahlung zu vereinbaren.";

function mailtext(name: string, nummer: string, status: "confirmed" | "request", a: Angebot, k: Kontakt, origin: string): string {
  const w = a.wahl;
  const zeilen = a.positionen.map((p) => `- ${p.qty > 1 ? `${p.qty} × ` : ""}${p.text}: ${chf(p.total_rappen)}`).join("\n");
  return [
    `Guten Tag ${name}`,
    "",
    status === "confirmed"
      ? `Vielen Dank für Ihre Buchung ${nummer}. Sie ist verbindlich bestätigt.`
      : `Vielen Dank für Ihre Anfrage ${nummer}. Wir prüfen sie und melden uns so rasch wie möglich (Grund: ${a.grund}). Der Termin ist bis dahin für Sie reserviert.`,
    "",
    `Eventtag: ${datumCh(w.event)}`,
    `Miete: ${datumCh(w.start)} bis ${datumCh(w.ende)}`,
    w.lieferung ? `Lieferung an: ${k.strasse}, ${w.plz} ${a.ort ?? ""}`.trim() : `Selbstabholung (Ort und Zeit vereinbaren wir mit Ihnen)`,
    "",
    "Positionen:",
    zeilen,
    `Total: ${chf(a.total_rappen)}${a.preisFix ? "" : " (ohne Fahrtkosten – folgen mit der Bestätigung)"}`,
    "",
    ZAHLUNG_TEXT,
    `Storno: ${a.stornoBis ? `kostenlose Absage bis ${datumCh(a.stornoBis)}, danach ist der ganze Mietpreis geschuldet.` : "ohne Option «stornierbar» – eine Absage kostet bis 28 Tage vor dem Anlass 50 % des Mietpreises, danach den ganzen Mietpreis (siehe AGB)."}`,
    "",
    `Ihre Buchungen sehen Sie im Kundenkonto: ${origin}/konto`,
    "",
    "Freundliche Grüsse",
    brand.name,
  ].join("\n");
}

/**
 * Hold in Buchung umwandeln – atomar. Jede Anweisung prüft selbst, ob der Hold noch gültig ist (bzw. die Buchung entstand).
 * Läuft der Hold ab oder wird er doppelt abgeschlossen, passiert nichts.
 */
export async function schliesseAb(env: Env, holdId: string, rohKontakt: unknown, origin: string, jetzt = new Date()): Promise<{ id: string; nummer: string; status: string } | Fehler> {
  const hold = await env.DB.prepare("SELECT request FROM allocations WHERE id = ?1 AND type = 'hold' AND expires_at > ?2").bind(holdId, iso(jetzt)).first<{ request: string }>();
  if (!hold) return f(409, "abgelaufen", "Die Reservierung ist abgelaufen. Bitte den Termin erneut prüfen.");
  const a = JSON.parse(hold.request) as Angebot;
  const k = leseKontakt(rohKontakt, a.wahl.lieferung);
  if (istFehler(k)) return k;
  const s = await einstellungen(env);
  const status = a.modus === "direkt" ? "confirmed" : "request";
  const id = zufallsId();
  const jahr = heuteZurich(jetzt).slice(0, 4);
  const HOLD_OK = "EXISTS (SELECT 1 FROM allocations WHERE id = ?98 AND type = 'hold' AND expires_at > ?99)";
  const BUCHUNG_OK = "EXISTS (SELECT 1 FROM allocations WHERE id = ?98 AND booking_id = ?97) AND ?99 IS NOT NULL";
  // ?97/?98/?99 = feste Parameter am Ende jeder Anweisung (D1 verlangt, dass der höchste Index ?99 in jeder Anweisung vorkommt)
  const mit = (sql: string, params: unknown[], bed: string) => env.DB.prepare(`${sql} WHERE ${bed}`).bind(...params, ...Array(96 - params.length).fill(null), id, holdId, iso(jetzt));
  const w = a.wahl;

  const stmts: D1PreparedStatement[] = [
    mit("INSERT OR IGNORE INTO customers (id, email, name) SELECT ?1, ?2, ?3", [zufallsId(), k.email, k.name], HOLD_OK),
    mit(
      `INSERT INTO bookings (id, number, status, customer_id, contact_name, contact_company, contact_phone, contact_email, package_slug,
        event_day, start_day, end_day, delivery, street, plz, city, zone_id, km_estimated, guests, flex_cancel, flex_cancel_until, message,
        total_rappen, price_final, reason, terms_version)
       SELECT ?97, 'FK-' || ?1 || '-' || printf('%04d', (SELECT COUNT(*) FROM bookings WHERE number LIKE 'FK-' || ?1 || '-%') + 1), ?2,
        (SELECT id FROM customers WHERE email = ?3), ?4, ?5, ?6, ?3, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24`,
      [jahr, status, k.email, k.name, k.firma, k.telefon, w.paket, w.event, w.start, w.ende, w.lieferung ? 1 : 0, k.strasse, w.plz, a.ort,
        a.zoneId, a.km, k.gaeste, a.stornoBis ? 1 : 0, a.stornoBis, k.nachricht, a.total_rappen, a.preisFix ? 1 : 0, a.grund, String(s.terms_version ?? "")],
      HOLD_OK,
    ),
    env.DB.prepare("UPDATE allocations SET type = 'booking', booking_id = ?1, expires_at = NULL, request = NULL WHERE id = ?2 AND type = 'hold' AND expires_at > ?3 AND EXISTS (SELECT 1 FROM bookings WHERE id = ?1)")
      .bind(id, holdId, iso(jetzt)),
    ...a.positionen.map((p, i) => mit("INSERT INTO booking_items (booking_id, pos, code, text, qty, unit_rappen, total_rappen) SELECT ?97, ?1, ?2, ?3, ?4, ?5, ?6", [i + 1, p.code, p.text, p.qty, p.unit_rappen, p.total_rappen], BUCHUNG_OK)),
    mit("INSERT INTO booking_history (booking_id, actor, field, new_value) SELECT ?97, 'kunde', 'status', ?1", [status], BUCHUNG_OK),
  ];
  await env.DB.batch(stmts);
  const b = await env.DB.prepare("SELECT number, status FROM bookings WHERE id = ?1").bind(id).first<{ number: string; status: string }>();
  if (!b) return f(409, "abgelaufen", "Die Reservierung ist abgelaufen oder wurde bereits abgeschlossen.");

  // Mails über die Outbox (dedupe_key verhindert Duplikate)
  const mails: Mail[] = [
    { dedupeKey: `buchung:${id}:eingang`, to: k.email, subject: `${status === "confirmed" ? "Buchungsbestätigung" : "Ihre Anfrage"} ${b.number} – ${brand.name}`, text: mailtext(k.name, b.number, status, a, k, origin) },
  ];
  const inhaber = await env.DB.prepare("SELECT email FROM admin_users WHERE role = 'owner' AND active = 1").all<{ email: string }>();
  for (const o of inhaber.results) {
    mails.push({ dedupeKey: `buchung:${id}:inhaber:${o.email}`, to: o.email, subject: `${status === "confirmed" ? "Neue Buchung" : "Neue Anfrage"} ${b.number} (${datumCh(w.event)})`, text: `${status === "confirmed" ? "Neue Direktbuchung" : `Neue Anfrage (${a.grund})`}: ${b.number}\nKunde: ${k.name}${k.firma ? `, ${k.firma}` : ""}\nEvent: ${datumCh(w.event)}\nTotal: ${chf(a.total_rappen)}\n\nDetails: ${origin}/admin` });
  }
  await env.DB.batch(mails.map((m) => mailEinreihen(env, m)));
  return { id, nummer: b.number, status: b.status };
}
