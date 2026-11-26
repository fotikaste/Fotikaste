/** Admin: Buchungen auflisten, Anfragen bestätigen oder ablehnen (Phase 3; voller Admin folgt in Phase 4). */
import type { Env } from "../env";
import type { AdminUser } from "../lib/auth";
import { brand } from "../../src/config/brand";
import { protokolliere } from "../lib/audit";
import { datumCh, einstellungen, zahlungsplan, type Fehler } from "../lib/buchung";
import { mailEinreihen } from "../lib/mail";
import { chf } from "../lib/preis";

export interface BuchungZeile {
  id: string; number: string; status: string; contact_name: string; contact_email: string; event_day: string; start_day: string; end_day: string;
  delivery: number; plz: string | null; city: string | null; km_estimated: number | null; total_rappen: number; price_final: number; reason: string | null; created_at: string;
}

export async function listeBuchungen(env: Env, limit = 50): Promise<BuchungZeile[]> {
  const r = await env.DB.prepare(
    `SELECT id, number, status, contact_name, contact_email, event_day, start_day, end_day, delivery, plz, city, km_estimated, total_rappen, price_final, reason, created_at
     FROM bookings ORDER BY CASE status WHEN 'request' THEN 0 ELSE 1 END, event_day LIMIT ?1`,
  ).bind(limit).all<BuchungZeile>();
  return r.results;
}

export async function listeOutbox(env: Env, limit = 20) {
  const r = await env.DB.prepare("SELECT id, to_email, subject, status, test_mode, created_at FROM outbox ORDER BY id DESC LIMIT ?1").bind(limit).all();
  return r.results;
}

const NICHT_ANFRAGE: Fehler = { status: 409, code: "status", text: "Diese Buchung ist keine offene Anfrage (mehr)." };

/** Anfrage bestätigen. Ist der Preis offen (Fahrtkosten), muss der Betrag angegeben werden. */
export async function bestaetige(env: Env, u: AdminUser, id: string, fahrtRappen: unknown, origin: string): Promise<{ status: string } | Fehler> {
  const b = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?1").bind(id).first<BuchungZeile & { event_day: string }>();
  if (!b || b.status !== "request") return NICHT_ANFRAGE;
  let total = b.total_rappen;
  const stmts: D1PreparedStatement[] = [];
  const NOCH_ANFRAGE = "EXISTS (SELECT 1 FROM bookings WHERE id = ?99 AND status = 'request')";
  const mit = (sql: string, p: unknown[]) => env.DB.prepare(`${sql} WHERE ${NOCH_ANFRAGE}`).bind(...p, ...Array(98 - p.length).fill(null), id);
  if (!b.price_final) {
    if (!(Number.isInteger(fahrtRappen) && (fahrtRappen as number) >= 0 && (fahrtRappen as number) <= 100_000)) return { status: 400, code: "fahrt", text: "Bitte die Fahrtkosten in Rappen angeben (0 bis 100000)." };
    total += fahrtRappen as number;
    stmts.push(mit("INSERT INTO booking_items (booking_id, pos, code, text, qty, unit_rappen, total_rappen) SELECT ?99, (SELECT COALESCE(MAX(pos), 0) + 1 FROM booking_items WHERE booking_id = ?99), 'fahrt', ?1, 1, ?2, ?2",
      [`Lieferung und Abholung (bestätigt)`, fahrtRappen]));
  }
  const plan = zahlungsplan(total, await einstellungen(env), b.event_day);
  stmts.push(
    ...plan.map((p) => mit("INSERT INTO payment_schedule (booking_id, kind, amount_rappen, due_on) SELECT ?99, ?1, ?2, ?3", [p.kind, p.amount_rappen, p.due_on])),
    mit("INSERT INTO booking_history (booking_id, actor, field, old_value, new_value) SELECT ?99, ?1, 'status', 'request', 'confirmed'", [u.email]),
    mailEinreihen(env, {
      dedupeKey: `buchung:${id}:bestaetigt`, to: b.contact_email, subject: `Buchungsbestätigung ${b.number} – ${brand.name}`,
      text: `Guten Tag ${b.contact_name}\n\nIhre Anfrage ${b.number} für den ${datumCh(b.event_day)} ist bestätigt.\nTotal: ${chf(total)}\n\nOnline wird nichts bezahlt – die Zahlung vereinbaren wir mit Ihnen per E-Mail oder persönlich.\nDetails im Kundenkonto: ${origin}/konto\n\nFreundliche Grüsse\n${brand.name}`,
    }, "EXISTS (SELECT 1 FROM bookings WHERE id = ?6 AND status = 'request')", id),
    env.DB.prepare("UPDATE bookings SET status = 'confirmed', total_rappen = ?2, price_final = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1 AND status = 'request'").bind(id, total),
  );
  const r = await env.DB.batch(stmts);
  if ((r.at(-1)?.meta.changes ?? 0) !== 1) return NICHT_ANFRAGE;
  await protokolliere(env, u.email, "buchung.bestaetigt", b.number, { total_rappen: total });
  return { status: "confirmed" };
}

/** Anfrage ablehnen: Tage werden wieder frei. */
export async function lehneAb(env: Env, u: AdminUser, id: string): Promise<{ status: string } | Fehler> {
  const b = await env.DB.prepare("SELECT number, status, contact_name, contact_email, event_day FROM bookings WHERE id = ?1").bind(id).first<BuchungZeile>();
  if (!b || b.status !== "request") return NICHT_ANFRAGE;
  const NOCH = "EXISTS (SELECT 1 FROM bookings WHERE id = ?1 AND status = 'request')";
  const r = await env.DB.batch([
    env.DB.prepare(`INSERT INTO booking_history (booking_id, actor, field, old_value, new_value) SELECT ?1, ?2, 'status', 'request', 'declined' WHERE ${NOCH}`).bind(id, u.email),
    mailEinreihen(env, {
      dedupeKey: `buchung:${id}:abgelehnt`, to: b.contact_email, subject: `Ihre Anfrage ${b.number} – ${brand.name}`,
      text: `Guten Tag ${b.contact_name}\n\nLeider können wir Ihre Anfrage ${b.number} für den ${datumCh(b.event_day)} nicht bestätigen. Es entstehen Ihnen keine Kosten.\n\nFreundliche Grüsse\n${brand.name}`,
    }, "EXISTS (SELECT 1 FROM bookings WHERE id = ?6 AND status = 'request')", id),
    env.DB.prepare(`DELETE FROM allocations WHERE booking_id = ?1 AND ${NOCH}`).bind(id),
    env.DB.prepare("UPDATE bookings SET status = 'declined', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1 AND status = 'request'").bind(id),
  ]);
  if ((r.at(-1)?.meta.changes ?? 0) !== 1) return NICHT_ANFRAGE;
  await protokolliere(env, u.email, "buchung.abgelehnt", b.number);
  return { status: "declined" };
}
