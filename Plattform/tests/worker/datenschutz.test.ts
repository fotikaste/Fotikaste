/** Phase 7: Datenschutz – Auskunft, Anonymisierung, Datensparsamkeit (Aufräumen, Anmeldelinks nicht aufbewahren). */
import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { handle } from "../../worker/index";
import { versendeAusstehende } from "../../worker/lib/mail";
import { wartung } from "../../worker/lib/wartung";
import { db, jwt, makeEnv, schliesse } from "./helpers";

afterAll(schliesse);
const BASE = "https://fotikaste.example";
const seite = async (pfad: string, email = "inhaber@example.ch") => handle(new Request(BASE + pfad, { headers: { "Cf-Access-Jwt-Assertion": await jwt({ email }) } }), await makeEnv());
const form = async (pfad: string, felder: Record<string, string>, email = "inhaber@example.ch") =>
  handle(new Request(BASE + pfad, { method: "POST", body: new URLSearchParams(felder).toString(), headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: BASE, "Cf-Access-Jwt-Assertion": await jwt({ email }) } }), await makeEnv());

async function kundeMitBuchung(tag: string) {
  const d = await db();
  const kunde = randomBytes(16).toString("hex"), buchung = randomBytes(16).toString("hex");
  const email = `ds.${kunde.slice(0, 8)}@example.ch`;
  await d.batch([
    d.prepare("INSERT INTO customers (id, email, name) VALUES (?1, ?2, 'Dora Daten')").bind(kunde, email),
    d.prepare(`INSERT INTO bookings (id, number, status, customer_id, contact_name, contact_phone, contact_email, package_slug, event_day, start_day, end_day, delivery, street, plz, city, message, total_rappen, terms_version)
               VALUES (?1, ?2, 'confirmed', ?3, 'Dora Daten', '+41 79 123 45 67', ?4, 'essential', ?5, ?5, ?5, 1, 'Datenweg 7', '8500', 'Frauenfeld', 'Bitte um 14 Uhr', 29000, 'T')`).bind(buchung, `FK-DS-${kunde.slice(0, 6)}`, kunde, email, tag),
    d.prepare("INSERT INTO customer_notes (customer_id, author, text) VALUES (?1, 'inhaber@example.ch', 'Telefon privat 079 …')").bind(kunde),
    d.prepare("INSERT INTO payments (booking_id, paid_on, amount_rappen, method, note, created_by) VALUES (?1, '2026-11-01', 29000, 'twint', 'von Dora', 'test')").bind(buchung),
    d.prepare("INSERT INTO sessions (session_hash, customer_id, expires_at) VALUES (?1, ?2, '2099-01-01T00:00:00Z')").bind(randomBytes(32).toString("hex"), kunde),
    d.prepare("INSERT INTO outbox (dedupe_key, to_email, subject, body_text) VALUES (?1, ?2, 'Bestätigung', 'Guten Tag Dora')").bind(`ds:${kunde}`, email),
  ]);
  return { kunde, buchung, email };
}

describe("Auskunft und Anonymisierung", () => {
  it("Auskunft als JSON-Datei, nur Eigentümer", async () => {
    const { kunde, email } = await kundeMitBuchung("2026-10-10");
    expect((await seite(`/admin/kunden/${kunde}/auskunft.json`, "admin@example.ch")).status).toBe(403);
    const r = await seite(`/admin/kunden/${kunde}/auskunft.json`);
    expect(r.headers.get("Content-Disposition")).toContain("attachment");
    const j = (await r.json()) as { kunde: { email: string }; buchungen: { street: string }[]; zahlungen: unknown[]; notizen: unknown[]; emails: unknown[] };
    expect(j.kunde.email).toBe(email);
    expect(j.buchungen[0]!.street).toBe("Datenweg 7");
    expect([j.zahlungen.length, j.notizen.length, j.emails.length]).toEqual([1, 1, 1]);
  });

  it("Anonymisieren: Bestätigung nötig, nicht bei kommender Buchung, entfernt Personendaten, behält Beträge", async () => {
    const zukunft = await kundeMitBuchung("2099-05-01");
    expect((await form(`/admin/kunden/${zukunft.kunde}/anonymisieren`, { bestaetigung: "ANONYMISIEREN" })).status).toBe(409);

    const { kunde, buchung, email } = await kundeMitBuchung("2026-09-09");
    expect((await form(`/admin/kunden/${kunde}/anonymisieren`, { bestaetigung: "ja" })).status).toBe(400);
    expect((await form(`/admin/kunden/${kunde}/anonymisieren`, { bestaetigung: "ANONYMISIEREN" }, "admin@example.ch")).status).toBe(403);
    expect((await form(`/admin/kunden/${kunde}/anonymisieren`, { bestaetigung: "ANONYMISIEREN" })).status).toBe(303);
    const d = await db();
    const b = await d.prepare("SELECT contact_name, contact_email, contact_phone, street, city, message, plz, total_rappen FROM bookings WHERE id = ?1").bind(buchung).first<Record<string, unknown>>();
    expect(b).toMatchObject({ contact_name: "anonymisiert", contact_phone: "-", street: null, city: null, message: null, plz: "8500", total_rappen: 29000 });
    expect(String(b!.contact_email)).toContain("anonymisiert.invalid");
    const reste = await d.prepare(`SELECT
      (SELECT COUNT(*) FROM customer_notes WHERE customer_id = ?1) AS notizen,
      (SELECT COUNT(*) FROM sessions WHERE customer_id = ?1) AS sitzungen,
      (SELECT COUNT(*) FROM outbox WHERE to_email = ?2) AS mails,
      (SELECT note FROM payments WHERE booking_id = ?3) AS notiz,
      (SELECT amount_rappen FROM payments WHERE booking_id = ?3) AS betrag,
      (SELECT name FROM customers WHERE id = ?1) AS name`).bind(kunde, email, buchung).first();
    expect(reste).toEqual({ notizen: 0, sitzungen: 0, mails: 0, notiz: null, betrag: 29000, name: "anonymisiert" });
    const auskunft = await (await seite(`/admin/kunden/${kunde}/auskunft.json`)).text();
    expect(auskunft).not.toContain("Dora");
    expect(auskunft).not.toContain("Datenweg");
  });
});

describe("Datensparsamkeit", () => {
  it("Anmeldelink verschwindet nach dem Versand aus dem Mail-Ausgang; Testmails bleiben lokal lesbar", async () => {
    const d = await db();
    await d.prepare("INSERT INTO outbox (dedupe_key, to_email, subject, body_text, status) VALUES ('magic:test-sent', 'x@example.ch', 'Link', 'https://x/konto/anmelden#abc', 'sent'), ('magic:test-held', 'y@example.ch', 'Link', 'https://x/konto/anmelden#def', 'held')").run();
    await versendeAusstehende(await makeEnv());
    const r = await d.prepare("SELECT dedupe_key, body_text FROM outbox WHERE dedupe_key IN ('magic:test-sent', 'magic:test-held') ORDER BY dedupe_key").all<{ dedupe_key: string; body_text: string }>();
    expect(r.results.map((x) => x.body_text)).toEqual(["https://x/konto/anmelden#def", "(Anmeldelink nach Versand entfernt)"]);
  });

  it("Versand: Testempfänger ohne unsichtbaren Zeilenumbruch, Fehlergrund von Resend wird gespeichert", async () => {
    const d = await db();
    await d.prepare("UPDATE outbox SET status = 'held' WHERE status = 'pending'").run();
    await d.prepare("INSERT INTO outbox (dedupe_key, to_email, subject, body_text, test_mode) VALUES ('versand:ok', 'kunde@example.ch', 'Hallo', 'Text', 1), ('versand:fehler', 'kunde2@example.ch', 'Hallo', 'Text', 1)").run();
    const gesendet: { to: string[]; key: string | null }[] = [];
    const fetcher = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { to: string[]; subject: string };
      gesendet.push({ to: body.to, key: new Headers(init.headers).get("Idempotency-Key") });
      return body.subject.includes("kunde2") ? new Response('{"message":"Invalid `to` field"}', { status: 422 }) : new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await versendeAusstehende(await makeEnv({ MAIL_TEST_RECIPIENT: "inhaber@example.ch\r\n", RESEND_API_KEY: "re_test\n", MAIL_FROM: "Fotikaste <buchung@example.ch>" }), 5, fetcher);
    expect(gesendet.map((g) => g.to[0])).toEqual(["inhaber@example.ch", "inhaber@example.ch"]);
    expect(gesendet[0]!.key).toMatch(/^outbox-\d+-inhaber@example\.ch$/);
    const r = await d.prepare("SELECT dedupe_key, status, last_error FROM outbox WHERE dedupe_key LIKE 'versand:%' ORDER BY dedupe_key").all<{ dedupe_key: string; status: string; last_error: string | null }>();
    expect(r.results[0]!.last_error).toContain("Invalid `to` field");
    expect(r.results[1]!.status).toBe("sent");
  });

  it("täglicher Cron löscht abgelaufene Links, Sitzungen und alte Mails", async () => {
    const d = await db();
    const k = await d.prepare("SELECT id FROM customers LIMIT 1").first<{ id: string }>();
    await d.batch([
      d.prepare("INSERT INTO magic_links (token_hash, customer_id, expires_at) VALUES (?1, ?2, '2020-01-01T00:00:00Z')").bind(randomBytes(32).toString("hex"), k!.id),
      d.prepare("INSERT INTO sessions (session_hash, customer_id, expires_at) VALUES (?1, ?2, '2020-01-01T00:00:00Z')").bind(randomBytes(32).toString("hex"), k!.id),
      d.prepare("INSERT INTO outbox (dedupe_key, to_email, subject, body_text, status, created_at) VALUES ('alt:1', 'a@example.ch', 'alt', 'alt', 'held', '2020-01-01T00:00:00Z')"),
    ]);
    await wartung(await makeEnv());
    const n = await d.prepare(`SELECT (SELECT COUNT(*) FROM magic_links WHERE expires_at < '2021-01-01') + (SELECT COUNT(*) FROM sessions WHERE expires_at < '2021-01-01') + (SELECT COUNT(*) FROM outbox WHERE dedupe_key = 'alt:1') AS n`).first<{ n: number }>();
    expect(n?.n).toBe(0);
  });
});
