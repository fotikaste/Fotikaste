/**
 * Änderungen an bestehenden Buchungen (Phase 4). Jede Änderung: Statusprüfung, atomarer batch(), Verlauf (booking_history), Protokoll (audit_log).
 * Termin verschieben: alte Tage löschen + neue einfügen im selben batch → ist ein neuer Tag belegt, bleibt alles wie vorher (UNIQUE).
 */
import type { Env } from "../env";
import type { AdminUser } from "../lib/auth";
import { brand } from "../../src/config/brand";
import { protokolliere } from "../lib/audit";
import { datumCh, type Fehler } from "../lib/buchung";
import { istTag, plusTage, tageVonBis, tageZwischen } from "../lib/datum";
import { mailEinreihen } from "../lib/mail";
import { chf } from "../lib/preis";

const f = (status: number, code: string, text: string): Fehler => ({ status, code, text });
type Ok = { ok: true };
const OK: Ok = { ok: true };

interface B {
  id: string; number: string; status: string; contact_name: string; contact_email: string; event_day: string; start_day: string; end_day: string;
  delivery: number; zone_id: number | null; total_rappen: number;
}
async function lade(env: Env, id: string): Promise<B | null> {
  return env.DB.prepare("SELECT id, number, status, contact_name, contact_email, event_day, start_day, end_day, delivery, zone_id, total_rappen FROM bookings WHERE id = ?1").bind(id).first<B>();
}
const verlauf = (env: Env, id: string, actor: string, feld: string, alt: unknown, neu: unknown) =>
  env.DB.prepare("INSERT INTO booking_history (booking_id, actor, field, old_value, new_value) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(id, actor, feld, alt === null || alt === undefined ? null : String(alt), neu === null || neu === undefined ? null : String(neu));
const aktualisiert = "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** Stornieren (bestätigt oder Anfrage) bzw. abschliessen (bestätigt). Storno gibt die Tage frei. */
export async function setzeStatus(env: Env, u: AdminUser, id: string, ziel: "cancelled" | "completed", kundeInformieren: boolean, origin: string): Promise<Ok | Fehler> {
  const b = await lade(env, id);
  if (!b) return f(404, "unbekannt", "Diese Buchung gibt es nicht.");
  const erlaubt = ziel === "cancelled" ? ["confirmed", "request"] : ["confirmed"];
  if (!erlaubt.includes(b.status)) return f(409, "status", `Eine Buchung mit Status «${b.status}» kann nicht ${ziel === "cancelled" ? "storniert" : "abgeschlossen"} werden.`);
  const stmts = [
    verlauf(env, id, u.email, "status", b.status, ziel),
    ...(ziel === "cancelled" ? [env.DB.prepare("DELETE FROM allocations WHERE booking_id = ?1").bind(id)] : []),
    ...(ziel === "cancelled" && kundeInformieren ? [mailEinreihen(env, {
      dedupeKey: `buchung:${id}:storniert`, to: b.contact_email, subject: `Stornierung ${b.number} – ${brand.name}`,
      text: `Guten Tag ${b.contact_name}\n\nIhre Buchung ${b.number} für den ${datumCh(b.event_day)} ist storniert.\nDetails im Kundenkonto: ${origin}/konto\n\nFreundliche Grüsse\n${brand.name}`,
    })] : []),
    env.DB.prepare(`UPDATE bookings SET status = ?2, ${aktualisiert} WHERE id = ?1 AND status = ?3`).bind(id, ziel, b.status),
  ];
  const r = await env.DB.batch(stmts);
  if ((r.at(-1)?.meta.changes ?? 0) !== 1) return f(409, "status", "Die Buchung wurde gerade anderweitig geändert. Bitte neu laden.");
  await protokolliere(env, u.email, ziel === "cancelled" ? "buchung.storniert" : "buchung.abgeschlossen", b.number, { vorher: b.status });
  return OK;
}

/** Termin ändern: Fotobox-Tage (+ Puffer der Zone) und Liefertage neu belegen, atomar. Preis wird NICHT automatisch angepasst. */
export async function verschiebe(env: Env, u: AdminUser, id: string, event: string, start: string, ende: string): Promise<Ok | Fehler> {
  if (![event, start, ende].every(istTag)) return f(400, "datum", "Bitte gültige Daten eingeben.");
  if (!(start <= event && event <= ende)) return f(400, "datum", "Der Eventtag muss zwischen Mietbeginn und Mietende liegen.");
  if (tageZwischen(start, ende) + 1 > 31) return f(400, "dauer", "Höchstens 31 Miettage.");
  const b = await lade(env, id);
  if (!b || !["request", "confirmed"].includes(b.status)) return f(409, "status", "Nur offene Anfragen und bestätigte Buchungen können verschoben werden.");
  const alloc = await env.DB.prepare("SELECT id FROM allocations WHERE booking_id = ?1 AND type = 'booking'").bind(id).first<{ id: string }>();
  if (!alloc) return f(409, "keine_belegung", "Zu dieser Buchung gibt es keine Belegung.");
  const zone = b.zone_id ? await env.DB.prepare("SELECT buffer_days_before, buffer_days_after FROM delivery_zones WHERE id = ?1").bind(b.zone_id).first<{ buffer_days_before: number; buffer_days_after: number }>() : null;
  const tage = tageVonBis(plusTage(start, -(zone?.buffer_days_before ?? 0)), plusTage(ende, zone?.buffer_days_after ?? 0)).map((day) => ["fotobox-1", day] as const);
  const liefer = b.delivery ? [...new Set([start, ende])].map((day) => ["lieferung", day] as const) : [];
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM allocation_days WHERE allocation_id = ?1").bind(alloc.id),
      ...[...tage, ...liefer].map(([res, day]) => env.DB.prepare("INSERT INTO allocation_days (allocation_id, resource_id, day, slot) VALUES (?1, ?2, ?3, 1)").bind(alloc.id, res, day)),
      env.DB.prepare(`UPDATE bookings SET event_day = ?2, start_day = ?3, end_day = ?4, ${aktualisiert} WHERE id = ?1`).bind(id, event, start, ende),
      verlauf(env, id, u.email, "termin", `${b.event_day} (${b.start_day}–${b.end_day})`, `${event} (${start}–${ende})`),
    ]);
  } catch (e) {
    if (String(e).includes("UNIQUE")) return f(409, "belegt", "Mindestens ein Tag im neuen Zeitraum ist schon belegt. Es wurde nichts geändert.");
    throw e;
  }
  await protokolliere(env, u.email, "buchung.verschoben", b.number, { alt: [b.event_day, b.start_day, b.end_day], neu: [event, start, ende] });
  return OK;
}

/** Positionen ändern (Rabatt = negativer Betrag). Total wird neu berechnet. */
async function positionenGeaendert(env: Env, b: B, aenderung: D1PreparedStatement[], neuesTotal: number, u: AdminUser, feld: string, alt: string | null, neu: string | null) {
  await env.DB.batch([
    ...aenderung,
    env.DB.prepare(`UPDATE bookings SET total_rappen = (SELECT COALESCE(SUM(total_rappen), 0) FROM booking_items WHERE booking_id = ?1), ${aktualisiert} WHERE id = ?1`).bind(b.id),
    verlauf(env, b.id, u.email, feld, alt, neu),
  ]);
  await protokolliere(env, u.email, "buchung.positionen", b.number, { feld, alt, neu, total_rappen: neuesTotal });
}

export async function positionHinzu(env: Env, u: AdminUser, id: string, text: string, qty: number, unit: number): Promise<Ok | Fehler> {
  if (text.length < 2 || text.length > 120) return f(400, "text", "Bitte eine Bezeichnung (2–120 Zeichen) eingeben.");
  if (!Number.isInteger(qty) || qty < 1 || qty > 999) return f(400, "menge", "Menge 1 bis 999.");
  if (!Number.isInteger(unit) || Math.abs(unit) > 10_000_000) return f(400, "betrag", "Ungültiger Betrag.");
  const b = await lade(env, id);
  if (!b || !["request", "confirmed"].includes(b.status)) return f(409, "status", "Positionen sind nur bei offenen oder bestätigten Buchungen änderbar.");
  const neu = b.total_rappen + qty * unit;
  if (neu < 0) return f(400, "negativ", "Das Total darf nicht negativ werden.");
  await positionenGeaendert(env, b, [
    env.DB.prepare("INSERT INTO booking_items (booking_id, pos, code, text, qty, unit_rappen, total_rappen) SELECT ?1, COALESCE(MAX(pos), 0) + 1, 'manuell', ?2, ?3, ?4, ?5 FROM booking_items WHERE booking_id = ?1")
      .bind(id, text, qty, unit, qty * unit),
  ], neu, u, "position+", null, `${qty} × ${text} à ${chf(unit)}`);
  return OK;
}

export async function positionWeg(env: Env, u: AdminUser, id: string, pos: number): Promise<Ok | Fehler> {
  const b = await lade(env, id);
  if (!b || !["request", "confirmed"].includes(b.status)) return f(409, "status", "Positionen sind nur bei offenen oder bestätigten Buchungen änderbar.");
  const p = await env.DB.prepare("SELECT text, total_rappen, (SELECT COUNT(*) FROM booking_items WHERE booking_id = ?1) AS anzahl FROM booking_items WHERE booking_id = ?1 AND pos = ?2").bind(id, pos).first<{ text: string; total_rappen: number; anzahl: number }>();
  if (!p) return f(404, "position", "Diese Position gibt es nicht.");
  if (p.anzahl <= 1) return f(400, "letzte", "Die letzte Position kann nicht entfernt werden.");
  const neu = b.total_rappen - p.total_rappen;
  if (neu < 0) return f(400, "negativ", "Das Total darf nicht negativ werden.");
  await positionenGeaendert(env, b, [env.DB.prepare("DELETE FROM booking_items WHERE booking_id = ?1 AND pos = ?2").bind(id, pos)], neu, u, "position−", `${p.text} (${chf(p.total_rappen)})`, null);
  return OK;
}

export interface KontaktAenderung { name: string; firma: string; email: string; telefon: string; strasse: string; plz: string; ort: string; gaeste: string }

/** Kontaktangaben der Buchung korrigieren (Snapshot der Buchung; das Kundenkonto bleibt unverändert). */
export async function kontakt(env: Env, u: AdminUser, id: string, k: KontaktAenderung): Promise<Ok | Fehler> {
  if (k.name.length < 2 || k.name.length > 100) return f(400, "name", "Bitte einen Namen eingeben.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(k.email) || k.email.length > 254) return f(400, "email", "Ungültige E-Mail-Adresse.");
  if (!/^\+?[\d\s()/-]{6,30}$/.test(k.telefon)) return f(400, "telefon", "Ungültige Telefonnummer.");
  if (k.plz && !/^\d{4}$/.test(k.plz)) return f(400, "plz", "Postleitzahl vierstellig.");
  const g = k.gaeste === "" ? null : Number(k.gaeste);
  if (g !== null && !(Number.isInteger(g) && g >= 1 && g <= 5000)) return f(400, "gaeste", "Ungültige Gästezahl.");
  const b = await env.DB.prepare("SELECT number, contact_name, contact_company, contact_email, contact_phone, street, plz, city, guests FROM bookings WHERE id = ?1").bind(id).first<Record<string, unknown>>();
  if (!b) return f(404, "unbekannt", "Diese Buchung gibt es nicht.");
  const neu: Record<string, unknown> = { contact_name: k.name, contact_company: k.firma || null, contact_email: k.email.toLowerCase(), contact_phone: k.telefon, street: k.strasse.slice(0, 120) || null, plz: k.plz || null, city: k.ort.slice(0, 80) || null, guests: g };
  const geaendert = Object.keys(neu).filter((x) => (b[x] ?? null) !== neu[x]);
  if (geaendert.length === 0) return OK;
  await env.DB.batch([
    env.DB.prepare(`UPDATE bookings SET ${geaendert.map((x, i) => `${x} = ?${i + 2}`).join(", ")}, ${aktualisiert} WHERE id = ?1`).bind(id, ...geaendert.map((x) => neu[x])),
    ...geaendert.map((x) => verlauf(env, id, u.email, x, b[x], neu[x])),
  ]);
  await protokolliere(env, u.email, "buchung.kontakt", String(b.number), { felder: geaendert });
  return OK;
}

export async function notiz(env: Env, u: AdminUser, id: string, text: string): Promise<Ok | Fehler> {
  if (text.length < 1 || text.length > 4000) return f(400, "notiz", "Bitte eine Notiz (bis 4000 Zeichen) eingeben.");
  if (!(await lade(env, id))) return f(404, "unbekannt", "Diese Buchung gibt es nicht.");
  await verlauf(env, id, u.email, "notiz", null, text).run();
  return OK;
}
