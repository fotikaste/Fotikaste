/** Phase 6: keine Zahlungsfunktion – nur Zahlungseingang von Hand, Aufwand, Ausgaben, Anschaffungen, Fixkosten, Wirtschaftlichkeit. */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handle } from "../../worker/index";
import { lade } from "../../worker/admin/finanzen";
import { db, jwt, makeEnv, schliesse } from "./helpers";

afterAll(schliesse);
const BASE = "https://fotikaste.example";
const seite = async (pfad: string, email = "inhaber@example.ch") => handle(new Request(BASE + pfad, { headers: { "Cf-Access-Jwt-Assertion": await jwt({ email }) } }), await makeEnv());
const form = async (pfad: string, felder: Record<string, string>, email = "inhaber@example.ch") =>
  handle(new Request(BASE + pfad, { method: "POST", body: new URLSearchParams(felder).toString(), headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: BASE, "Cf-Access-Jwt-Assertion": await jwt({ email }) } }), await makeEnv());

const JAHR = 2031; // eigenes Jahr, damit andere Testdateien die Summen nicht beeinflussen
let id: string;
let nummer: string;

beforeAll(async () => {
  const d = await db();
  const kunde = randomBytes(16).toString("hex");
  id = randomBytes(16).toString("hex");
  nummer = `FK-FIN-${id.slice(0, 4)}`;
  await d.batch([
    d.prepare("INSERT INTO customers (id, email, name) VALUES (?1, ?2, 'Finanz Test')").bind(kunde, `f.${kunde}@example.ch`),
    d.prepare(`INSERT INTO bookings (id, number, status, customer_id, contact_name, contact_phone, contact_email, package_slug, event_day, start_day, end_day, delivery, km_estimated, total_rappen, terms_version)
               VALUES (?1, ?2, 'confirmed', ?3, 'Finanz Test', '+41 79 000 00 00', 'f@example.ch', 'premium', '${JAHR}-05-10', '${JAHR}-05-10', '${JAHR}-05-11', 1, 17, 50000, 'T')`).bind(id, nummer, kunde),
  ]);
});

describe("Rechte und alte Zahlungsfunktion", () => {
  it("Zahlungsplan-Tabelle und Einstellungen sind entfernt", async () => {
    const t = await (await db()).prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'payment_schedule'").first<{ n: number }>();
    expect(t?.n).toBe(0);
    const s = await (await db()).prepare("SELECT COUNT(*) AS n FROM settings WHERE key IN ('deposit_percent','security_deposit_rappen','payment_due_days_before','payment_due_before_event')").first<{ n: number }>();
    expect(s?.n).toBe(0);
  });
  it("nur der Eigentümer sieht Finanzen und Zahlungseingang", async () => {
    expect((await seite("/admin/finanzen")).status).toBe(200);
    expect((await seite("/admin/finanzen", "admin@example.ch")).status).toBe(403);
    expect((await seite("/admin/finanzen", "mitarbeiter@example.ch")).status).toBe(403);
    expect((await seite(`/admin/finanzen/export.csv?jahr=${JAHR}`, "admin@example.ch")).status).toBe(403);
    expect((await form(`/admin/buchungen/${id}/zahlung`, { datum: `${JAHR}-01-01`, betrag_chf: "1", art: "bar" }, "admin@example.ch")).status).toBe(403);
    expect(await (await seite(`/admin/buchungen/${id}`, "admin@example.ch")).text()).not.toContain("Zahlungseingang");
    expect(await (await seite(`/admin/buchungen/${id}`)).text()).toContain("Zahlungseingang");
  });
});

describe("Zahlungseingang und Aufwand", () => {
  it("Zahlung festhalten (Prüfungen), Kunde sieht «erhalten» erst bei vollem Betrag", async () => {
    expect((await form(`/admin/buchungen/${id}/zahlung`, { datum: "2099-01-01", betrag_chf: "100", art: "bar" })).status).toBe(400); // Zukunft
    expect((await form(`/admin/buchungen/${id}/zahlung`, { datum: "2026-11-20", betrag_chf: "0", art: "bar" })).status).toBe(400);
    expect((await form(`/admin/buchungen/${id}/zahlung`, { datum: "2026-11-20", betrag_chf: "100", art: "kreditkarte" })).status).toBe(400);
    const r = await form(`/admin/buchungen/${id}/zahlung`, { datum: "2026-11-20", betrag_chf: "200.00", art: "twint", notiz: "Anzahlung beim Treffen" });
    expect(r.status).toBe(303);
    expect(r.headers.get("Location")).toBe(`/admin/buchungen/${id}?ok=zahlung`);
    const t = await (await seite(`/admin/buchungen/${id}`)).text();
    expect(t).toContain("offen CHF 300.00");
    const z = await (await db()).prepare("SELECT id FROM payments WHERE booking_id = ?1").bind(id).first<{ id: number }>();
    expect((await form(`/admin/buchungen/${id}/zahlung-weg`, { id: String(z!.id) })).status).toBe(303);
    expect((await form(`/admin/buchungen/${id}/zahlung`, { datum: "2026-11-25", betrag_chf: "500", art: "ueberweisung" })).status).toBe(303);
    expect(await (await seite(`/admin/buchungen/${id}`)).text()).toContain("bezahlt</span>");
    const log = await (await db()).prepare("SELECT COUNT(*) AS n FROM audit_log WHERE target = ?1 AND action LIKE 'zahlung.%'").bind(nummer).first<{ n: number }>();
    expect(log?.n).toBe(2);
  });

  it("Aufwand: Prüfung, Speichern, km-Schätzung als Hinweis", async () => {
    expect(await (await seite(`/admin/buchungen/${id}`)).text()).toContain("4 × 17 km = 68 km");
    expect((await form(`/admin/buchungen/${id}/aufwand`, { abzuege: "abc", km: "", stunden: "" })).status).toBe(400);
    expect((await form(`/admin/buchungen/${id}/aufwand`, { abzuege: "240", km: "70", stunden: "6,5", notiz: "Aufbau im 2. Stock" })).status).toBe(303);
    const a = await (await db()).prepare("SELECT prints, km, minutes FROM booking_effort WHERE booking_id = ?1").bind(id).first();
    expect(a).toEqual({ prints: 240, km: 70, minutes: 390 });
  });
});

describe("Ausgaben, Anschaffungen, Fixkosten, Auswertung", () => {
  it("erfassen mit Prüfung; Zuordnung zur Buchung über die Nummer", async () => {
    expect((await form("/admin/finanzen/ausgabe", { datum: `${JAHR}-05-09`, betrag_chf: "45.50", kategorie: "material", beschreibung: "Farbband", buchung: "FK-0000-9999" })).status).toBe(400);
    expect((await form("/admin/finanzen/ausgabe", { datum: `${JAHR}-05-09`, betrag_chf: "45.50", kategorie: "unbekannt", beschreibung: "Farbband" })).status).toBe(400);
    expect((await form("/admin/finanzen/ausgabe", { datum: `${JAHR}-05-09`, betrag_chf: "45.50", kategorie: "material", beschreibung: "Requisiten für diesen Anlass", beleg: "Ordner 1 / Nr. 3", buchung: nummer, jahr: String(JAHR) })).status).toBe(303);
    expect((await form("/admin/finanzen/ausgabe", { datum: `${JAHR}-02-01`, betrag_chf: "120", kategorie: "werbung", beschreibung: "=Flyer;Druck", jahr: String(JAHR) })).status).toBe(303);
    expect((await form("/admin/finanzen/anlage", { name: "Drucker", datum: `${JAHR}-01-15`, betrag_chf: "1200", jahre: "0" })).status).toBe(400);
    expect((await form("/admin/finanzen/anlage", { name: "Drucker", datum: `${JAHR}-01-15`, betrag_chf: "1200", jahre: "4", jahr: String(JAHR) })).status).toBe(303);
    const r = await form("/admin/finanzen/fixkosten", { name: "Haftpflicht", betrag_chf: "365", von: `${JAHR}-07-02`, bis: "", jahr: String(JAHR) });
    expect(r.headers.get("Location")).toBe(`/admin/finanzen?jahr=${JAHR}&ok=gespeichert`);
  });

  it("Auswertung rechnet mit den erfassten Werten; offene Ansätze werden nicht geschätzt", async () => {
    const { auswertung: a } = await lade(await makeEnv(), JAHR);
    expect(a.anzahl).toBe(1);
    expect(a.gebucht).toBe(50000);
    expect(a.eingenommen).toBe(0); // Zahlungen wurden 2026 erfasst, nicht im Jahr des Events
    expect(a.material).toBe(240 * 15);
    expect(a.ausgaben).toBe(4550 + 12000);
    expect(a.abschreibung).toBe(30000);
    expect(a.fixkosten).toBe(18300);
    expect(a.fahrzeug).toBeNull();
    expect(a.offene_ansaetze).toContain("Fahrzeugkosten pro km");
    expect(a.buchungen[0]!.deckungsbeitrag).toBe(50000 - 3600 - 4550);
    const t = await (await seite(`/admin/finanzen?jahr=${JAHR}`)).text();
    expect(t).toContain("Noch offen: Fahrzeugkosten pro km, eigener Stundenansatz");
    expect(t).toContain(nummer);
  });

  it("CSV für Treuhand: Einnahmen und Ausgaben, ohne Formeln", async () => {
    const r = await seite(`/admin/finanzen/export.csv?jahr=${JAHR}`);
    expect(r.headers.get("Content-Type")).toContain("text/csv");
    expect(r.headers.get("Content-Disposition")).toContain(`einnahmen-ausgaben-${JAHR}.csv`);
    const t = await r.text();
    expect(t).toContain(`${JAHR}-05-09;Ausgabe;-45.50;Material (Papier, Farbband …);Requisiten für diesen Anlass;${nummer};Ordner 1 / Nr. 3`);
    expect(t).toContain(`"'=Flyer;Druck"`);
    const z2026 = await (await seite("/admin/finanzen/export.csv?jahr=2026")).text();
    expect(z2026).toContain(`2026-11-25;Einnahme;500.00;Überweisung;Finanz Test;${nummer}`);
  });

  it("Löschen von Einträgen", async () => {
    const x = await (await db()).prepare("SELECT id FROM expenses WHERE description = '=Flyer;Druck'").first<{ id: number }>();
    expect((await form(`/admin/finanzen/ausgabe/${x!.id}/loeschen`, { jahr: String(JAHR) })).status).toBe(303);
    expect((await form(`/admin/finanzen/ausgabe/${x!.id}/loeschen`, {})).status).toBe(404);
  });
});
