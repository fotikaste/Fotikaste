/**
 * Kundenportal mit Magic Link (Anmeldung ohne Passwort): Der Kunde erhält per E-Mail einen einmaligen Link (15 Min. gültig).
 * Gespeichert werden nur SHA-256-Hashes von Link und Sitzung. Jede Abfrage filtert über `verlangeKunde` auf die eigene customer_id.
 */
import type { Env } from "../env";
import { brand } from "../../src/config/brand";
import { fehler } from "./http";
import { sha256, zufallsId } from "./id";
import { mailEinreihen } from "./mail";

const LINK_MINUTEN = 15;
const SITZUNG_TAGE = 30;
const iso = (d: Date) => d.toISOString();

export const cookieName = (env: Env) => (env.ENVIRONMENT === "production" ? "__Host-fk_sitzung" : "fk_sitzung");

export function sitzungsCookie(env: Env, token: string, maxAgeSek: number): string {
  const sicher = env.ENVIRONMENT === "production" ? "; Secure" : "";
  return `${cookieName(env)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSek}${sicher}`;
}

/** Link anfordern. Antwortet nach aussen immer gleich (verrät nicht, ob die E-Mail bekannt ist). */
export async function fordereLink(env: Env, email: string, origin: string, jetzt = new Date()): Promise<void> {
  const k = await env.DB.prepare("SELECT id, name FROM customers WHERE email = ?1").bind(email).first<{ id: string; name: string }>();
  if (!k) return;
  const token = zufallsId(32);
  const hash = await sha256(token);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO magic_links (token_hash, customer_id, expires_at) VALUES (?1, ?2, ?3)").bind(hash, k.id, iso(new Date(jetzt.getTime() + LINK_MINUTEN * 60_000))),
    mailEinreihen(env, {
      dedupeKey: `magic:${hash}`,
      to: email,
      subject: `Ihr Anmeldelink – ${brand.name}`,
      // Token im #-Teil: wird nicht an den Server übertragen, landet nicht in Protokollen. Erst ein Klick auf «Anmelden» löst ihn ein
      // (so verbrauchen Link-Vorschauen von Mailprogrammen den Link nicht).
      text: `Guten Tag ${k.name}\n\nMit diesem Link melden Sie sich in Ihrem Kundenkonto an (gültig ${LINK_MINUTEN} Minuten, nur einmal verwendbar):\n${origin}/konto/anmelden#${token}\n\nHaben Sie den Link nicht angefordert? Dann können Sie diese E-Mail ignorieren.\n\nFreundliche Grüsse\n${brand.name}`,
    }),
  ]);
}

/** Link einlösen → neue Sitzung. Gleichzeitiges zweites Einlösen scheitert am Bedingungs-UPDATE. */
export async function loeseEin(env: Env, token: string, jetzt = new Date()): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const r = await env.DB.prepare("UPDATE magic_links SET used_at = ?2 WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2 RETURNING customer_id")
    .bind(await sha256(token), iso(jetzt)).first<{ customer_id: string }>();
  if (!r) return null;
  const sitzung = zufallsId(32);
  await env.DB.prepare("INSERT INTO sessions (session_hash, customer_id, expires_at) VALUES (?1, ?2, ?3)")
    .bind(await sha256(sitzung), r.customer_id, iso(new Date(jetzt.getTime() + SITZUNG_TAGE * 86_400_000))).run();
  return sitzung;
}

export const SITZUNG_SEK = SITZUNG_TAGE * 86_400;

function leseCookie(request: Request, name: string): string | null {
  for (const teil of (request.headers.get("Cookie") ?? "").split(";")) {
    const [k, ...v] = teil.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** Zentrale Prüfung: gültige Sitzung → customer_id, sonst 401. */
export async function verlangeKunde(request: Request, env: Env, jetzt = new Date()): Promise<{ customerId: string; sessionHash: string } | Response> {
  const token = leseCookie(request, cookieName(env));
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return fehler(401, "nicht_angemeldet", "Bitte melden Sie sich an.");
  const hash = await sha256(token);
  const s = await env.DB.prepare("SELECT customer_id FROM sessions WHERE session_hash = ?1 AND revoked_at IS NULL AND expires_at > ?2").bind(hash, iso(jetzt)).first<{ customer_id: string }>();
  if (!s) return fehler(401, "nicht_angemeldet", "Bitte melden Sie sich an.");
  return { customerId: s.customer_id, sessionHash: hash };
}

export async function meldeAb(env: Env, sessionHash: string, jetzt = new Date()) {
  await env.DB.prepare("UPDATE sessions SET revoked_at = ?2 WHERE session_hash = ?1").bind(sessionHash, iso(jetzt)).run();
}

/** Nur die Buchungen dieses Kunden – jede Abfrage mit customer_id. */
export async function buchungenVon(env: Env, customerId: string) {
  const kunde = await env.DB.prepare("SELECT name, email FROM customers WHERE id = ?1").bind(customerId).first<{ name: string; email: string }>();
  const b = await env.DB.prepare(
    `SELECT id, number, status, package_slug, event_day, start_day, end_day, delivery, street, plz, city, flex_cancel_until, total_rappen, price_final, created_at
     FROM bookings WHERE customer_id = ?1 ORDER BY event_day DESC`,
  ).bind(customerId).all<Record<string, unknown> & { id: string }>();
  const pos = await env.DB.prepare("SELECT i.booking_id, i.pos, i.text, i.qty, i.unit_rappen, i.total_rappen FROM booking_items i JOIN bookings b ON b.id = i.booking_id WHERE b.customer_id = ?1 ORDER BY i.pos")
    .bind(customerId).all<Record<string, unknown> & { booking_id: string }>();
  const plan = await env.DB.prepare("SELECT p.booking_id, p.kind, p.amount_rappen, p.due_on, p.status FROM payment_schedule p JOIN bookings b ON b.id = p.booking_id WHERE b.customer_id = ?1")
    .bind(customerId).all<Record<string, unknown> & { booking_id: string }>();
  return {
    kunde,
    buchungen: b.results.map(({ id, ...x }) => ({
      ...x,
      positionen: pos.results.filter((p) => p.booking_id === id).map(({ booking_id: _, ...p }) => p),
      zahlungsplan: plan.results.filter((p) => p.booking_id === id).map(({ booking_id: _, ...p }) => p),
    })),
  };
}
