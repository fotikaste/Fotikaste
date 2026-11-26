/** Phase 4: Administration – Rechte, Buchungen ändern, Kalender, Kunden, Preise, Inhalte, Webseite aktualisieren. */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handle } from "../../worker/index";
import { vorschau } from "../../worker/admin/inhalte";
import { db, jwt, makeEnv, schliesse } from "./helpers";

afterAll(schliesse);
const BASE = "https://fotikaste.example";
let ip = 0;
const als = (email = "inhaber@example.ch") => jwt({ email });

async function seite(pfad: string, email = "inhaber@example.ch") {
  return handle(new Request(BASE + pfad, { headers: { "Cf-Access-Jwt-Assertion": await als(email) } }), await makeEnv());
}
async function form(pfad: string, felder: Record<string, string>, email = "inhaber@example.ch", origin = BASE, env?: Awaited<ReturnType<typeof makeEnv>>) {
  return handle(new Request(BASE + pfad, {
    method: "POST", body: new URLSearchParams(felder).toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin, "Cf-Access-Jwt-Assertion": await als(email) },
  }), env ?? (await makeEnv()));
}
async function json(pfad: string, body: unknown) {
  return handle(new Request(BASE + pfad, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", Origin: BASE, "CF-Connecting-IP": `10.9.0.${++ip}` } }), await makeEnv());
}
/** Direktbuchung (Selbstabholung) anlegen → Buchungs-ID. */
async function buche(start: string, ende: string, name = "Vera Waltung", email = "verwaltung@example.ch") {
  const h = await json("/api/buchung/halten", { wahl: { paket: "premium", event: start, start, ende, lieferung: false, stornierbar: false } });
  expect(h.status).toBe(201);
  const { halteId } = (await h.json()) as { halteId: string };
  const r = await json("/api/buchung/abschliessen", { halteId, kontakt: { name, email, telefon: "+41 79 111 11 11", agb: true } });
  expect(r.status).toBe(201);
  const { nummer } = (await r.json()) as { nummer: string };
  return (await (await db()).prepare("SELECT id FROM bookings WHERE number = ?1").bind(nummer).first<{ id: string }>())!.id;
}
const belegt = async (von: string, bis: string) => ((await (await handle(new Request(`${BASE}/api/verfuegbarkeit?von=${von}&bis=${bis}`), await makeEnv())).json()) as { belegt: string[] }).belegt;
const buchung = async (id: string) => (await db()).prepare("SELECT * FROM bookings WHERE id = ?1").bind(id).first<Record<string, unknown>>();

describe("Inhalte der Webseite = Datenbank", () => {
  it("src/data/inhalte.json entspricht den Migrationen (vor Änderungen in diesem Test)", async () => {
    const datei = JSON.parse(readFileSync("src/data/inhalte.json", "utf8"));
    // Je nach Reihenfolge hat buchung.test.ts die Postleitzahlen durch Testorte ersetzt («Startort (Test)» statt Sirnach)
    const v = JSON.parse(JSON.stringify(await vorschau(await makeEnv())).replaceAll("Startort (Test)", "Sirnach"));
    expect(datei.terms.delivery.origin).toBe("8370 Sirnach");
    expect(v).toEqual(datei);
  });
});

describe("Rechte je Rolle", () => {
  it("Mitarbeiter: lesen ja, Preise/Inhalte/Einstellungen nein, keine Knöpfe", async () => {
    for (const p of ["/admin", "/admin/buchungen", "/admin/kalender", "/admin/kunden"]) expect((await seite(p, "mitarbeiter@example.ch")).status).toBe(200);
    for (const p of ["/admin/preise", "/admin/inhalte", "/admin/einstellungen"]) expect((await seite(p, "mitarbeiter@example.ch")).status).toBe(403);
    const t = await (await seite("/admin", "mitarbeiter@example.ch")).text();
    expect(t).not.toContain('href="/admin/preise"');
    expect((await form("/admin/kalender/sperren", { von: "2028-01-03", bis: "2028-01-04", art: "block", ressource: "fotobox-1" }, "mitarbeiter@example.ch")).status).toBe(403);
  });
  it("Administrator: Inhalte ja, Preise und Einstellungen nein; Eigentümer alles", async () => {
    expect((await seite("/admin/inhalte", "admin@example.ch")).status).toBe(200);
    expect((await seite("/admin/preise", "admin@example.ch")).status).toBe(403);
    expect((await form("/admin/preise/paket/premium", { name: "X", preis_chf: "1" }, "admin@example.ch")).status).toBe(403);
    for (const p of ["/admin/preise", "/admin/inhalte", "/admin/einstellungen"]) expect((await seite(p)).status).toBe(200);
  });
  it("ohne Anmeldung 401, fremde Herkunft 403", async () => {
    expect((await handle(new Request(`${BASE}/admin/kunden`), await makeEnv())).status).toBe(401);
    expect((await form("/admin/inhalte/fakten", {}, "inhaber@example.ch", "https://boese.example")).status).toBe(403);
  });
});

describe("Buchungen ändern", () => {
  it("Detail zeigt Daten escaped (kein HTML aus Kundeneingaben)", async () => {
    const id = await buche("2027-09-06", "2027-09-06", "<script>alert(1)</script>", "xss@example.ch");
    const t = await (await seite(`/admin/buchungen/${id}`)).text();
    expect(t).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(t).not.toContain("<script>alert(1)");
  });

  it("stornieren gibt Tage frei, informiert Kunde, nur einmal", async () => {
    const id = await buche("2027-09-13", "2027-09-14");
    expect(await belegt("2027-09-13", "2027-09-14")).toEqual(["2027-09-13", "2027-09-14"]);
    const r = await form(`/admin/buchungen/${id}/stornieren`, { mail: "on" });
    expect(r.status).toBe(303);
    expect(r.headers.get("Location")).toBe(`/admin/buchungen/${id}?ok=storniert`);
    expect(await belegt("2027-09-13", "2027-09-14")).toEqual([]);
    expect((await buchung(id))?.status).toBe("cancelled");
    const m = await (await db()).prepare("SELECT COUNT(*) AS n FROM outbox WHERE dedupe_key = ?1").bind(`buchung:${id}:storniert`).first<{ n: number }>();
    expect(m?.n).toBe(1);
    expect((await form(`/admin/buchungen/${id}/stornieren`, {})).status).toBe(409);
  });

  it("Termin verschieben: frei → verschoben; belegt → nichts geändert", async () => {
    const a = await buche("2027-09-20", "2027-09-21");
    await buche("2027-09-24", "2027-09-24");
    expect((await form(`/admin/buchungen/${a}/termin`, { event: "2027-09-22", start: "2027-09-22", ende: "2027-09-23" })).status).toBe(303);
    expect(await belegt("2027-09-20", "2027-09-24")).toEqual(["2027-09-22", "2027-09-23", "2027-09-24"]);
    const konflikt = await form(`/admin/buchungen/${a}/termin`, { event: "2027-09-23", start: "2027-09-23", ende: "2027-09-24" });
    expect(konflikt.status).toBe(409);
    expect(await konflikt.text()).toContain("schon belegt");
    expect(await belegt("2027-09-20", "2027-09-24")).toEqual(["2027-09-22", "2027-09-23", "2027-09-24"]);
    expect((await buchung(a))?.event_day).toBe("2027-09-22");
    expect((await form(`/admin/buchungen/${a}/termin`, { event: "2027-09-30", start: "2027-09-22", ende: "2027-09-23" })).status).toBe(400);
  });

  it("Positionen: Zusatz und Rabatt ändern Total und Zahlungsplan; nach Zahlung bleibt der Plan", async () => {
    const id = await buche("2027-10-04", "2027-10-04");
    expect((await form(`/admin/buchungen/${id}/position`, { text: "Zusätzlicher Miettag", menge: "2", preis_chf: "45.00" })).status).toBe(303);
    expect((await form(`/admin/buchungen/${id}/position`, { text: "Rabatt Stammkunde", menge: "1", preis_chf: "-50" })).status).toBe(303);
    expect((await buchung(id))?.total_rappen).toBe(45000 + 9000 - 5000);
    const plan = async () => (await (await db()).prepare("SELECT kind, amount_rappen, status FROM payment_schedule WHERE booking_id = ?1").bind(id).all()).results;
    expect(await plan()).toEqual([{ kind: "full", amount_rappen: 49000, status: "open" }]);
    expect((await form(`/admin/buchungen/${id}/position`, { text: "Zu viel Rabatt", menge: "1", preis_chf: "-9999" })).status).toBe(400);
    expect((await form(`/admin/buchungen/${id}/zahlung`, { kind: "full", status: "paid" })).status).toBe(303);
    expect((await form(`/admin/buchungen/${id}/position-weg`, { pos: "3" })).status).toBe(303);
    expect((await buchung(id))?.total_rappen).toBe(54000);
    expect(await plan()).toEqual([{ kind: "full", amount_rappen: 49000, status: "paid" }]); // bezahlt → nicht neu berechnet
    const hist = await (await db()).prepare("SELECT field FROM booking_history WHERE booking_id = ?1 ORDER BY id").bind(id).all<{ field: string }>();
    expect(hist.results.map((h) => h.field)).toEqual(["status", "position+", "position+", "zahlung:full", "position−"]);
  });

  it("Kontakt korrigieren und Notiz: Verlauf und Prüfung", async () => {
    const id = await buche("2027-10-11", "2027-10-11");
    expect((await form(`/admin/buchungen/${id}/kontakt`, { name: "Vera Neu", firma: "", email: "vera@example.ch", telefon: "+41 79 222 22 22", strasse: "", plz: "", ort: "", gaeste: "120" })).status).toBe(303);
    const b = await buchung(id);
    expect([b?.contact_name, b?.contact_email, b?.guests]).toEqual(["Vera Neu", "vera@example.ch", 120]);
    expect((await form(`/admin/buchungen/${id}/kontakt`, { name: "V", email: "x", telefon: "1" })).status).toBe(400);
    expect((await form(`/admin/buchungen/${id}/notiz`, { text: "Kunde ruft nochmals an" })).status).toBe(303);
    expect(await (await seite(`/admin/buchungen/${id}`)).text()).toContain("Kunde ruft nochmals an");
  });
});

describe("Kalender", () => {
  it("Sperre blockiert die Buchung, Konflikt sperrt nichts, Aufheben gibt frei", async () => {
    expect((await form("/admin/kalender/sperren", { von: "2027-11-01", bis: "2027-11-03", art: "block", ressource: "fotobox-1", notiz: "Ferien" })).status).toBe(303);
    expect(await belegt("2027-11-01", "2027-11-05")).toEqual(["2027-11-01", "2027-11-02", "2027-11-03"]);
    expect((await json("/api/buchung/halten", { wahl: { paket: "premium", event: "2027-11-02", start: "2027-11-02", ende: "2027-11-02", lieferung: false, stornierbar: false } })).status).toBe(409);
    await buche("2027-11-08", "2027-11-08");
    expect((await form("/admin/kalender/sperren", { von: "2027-11-07", bis: "2027-11-09", art: "maintenance", ressource: "fotobox-1" })).status).toBe(409);
    expect(await belegt("2027-11-07", "2027-11-09")).toEqual(["2027-11-08"]);
    const k = await (await seite("/admin/kalender?monat=2027-11")).text();
    expect(k).toContain("gesperrt: Ferien");
    const sperre = await (await db()).prepare("SELECT id FROM allocations WHERE type = 'block' AND note = 'Ferien'").first<{ id: string }>();
    expect((await form("/admin/kalender/aufheben", { id: sperre!.id, monat: "2027-11" })).status).toBe(303);
    expect(await belegt("2027-11-01", "2027-11-03")).toEqual([]);
  });
});

describe("Kunden", () => {
  it("Liste, Detail mit Buchungen, Notiz", async () => {
    const t = await (await seite("/admin/kunden?q=verwaltung")).text();
    expect(t).toContain("verwaltung@example.ch");
    const k = await (await db()).prepare("SELECT id FROM customers WHERE email = 'verwaltung@example.ch'").first<{ id: string }>();
    expect((await form(`/admin/kunden/${k!.id}/notiz`, { text: "Hochzeit 2028 angefragt" })).status).toBe(303);
    const d = await (await seite(`/admin/kunden/${k!.id}`)).text();
    expect(d).toContain("Hochzeit 2028 angefragt");
    expect(d).toMatch(/FK-\d{4}-\d{4}/);
  });
});

describe("Preise und Einstellungen", () => {
  it("Paketpreis gilt für neue Angebote, bestehende Buchungen bleiben; Webseite wird als veraltet gemeldet", async () => {
    const alt = await buche("2027-12-06", "2027-12-06");
    expect((await form("/admin/preise/paket/premium", { name: "Premium", preis_chf: "470.00", abzuege: "300", sort: "2", sichtbar: "on" })).status).toBe(303);
    const a = (await (await json("/api/buchung/angebot", { paket: "premium", event: "2027-12-13", start: "2027-12-13", ende: "2027-12-13", lieferung: false })).json()) as { total_rappen: number };
    expect(a.total_rappen).toBe(47000);
    expect((await buchung(alt))?.total_rappen).toBe(45000);
    expect((await vorschau(await makeEnv())).faqs[0]!.answer).toContain("Premium CHF 470.–");
    expect(await (await seite("/admin")).text()).toContain("Webseite zeigt noch den alten Stand");
    expect((await form("/admin/preise/paket/premium", { name: "Premium", preis_chf: "abc", sort: "2" })).status).toBe(400);
    expect((await form("/admin/preise/paket/premium", { name: "Premium", preis_chf: "450.00", abzuege: "300", sort: "2", sichtbar: "on" })).status).toBe(303);
    const log = await (await db()).prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'paket.geaendert'").first<{ n: number }>();
    expect(log?.n).toBe(2);
  });

  it("Konditionen und Einstellungen werden geprüft", async () => {
    const s = (await (await seite("/admin/preise")).text());
    expect(s).toContain('name="booking_extra_day_rappen" value="45.00"');
    const gueltig = { booking_included_days: "2", booking_extra_day_rappen: "45.00", flex_cancel_rappen: "20.00", flex_cancel_days: "28", booking_min_lead_days: "7", booking_max_days: "7", booking_horizon_days: "550", booking_hold_minutes: "15", delivery_origin_plz: "8370", delivery_detour_factor: "1.3" };
    expect((await form("/admin/preise/konditionen", { ...gueltig, booking_hold_minutes: "500" })).status).toBe(400);
    expect((await form("/admin/preise/konditionen", { ...gueltig, delivery_origin_plz: "0000" })).status).toBe(400);
    expect((await form("/admin/preise/konditionen", { ...gueltig, booking_hold_minutes: "20" })).status).toBe(303);
    expect((await (await db()).prepare("SELECT value FROM settings WHERE key = 'booking_hold_minutes'").first<{ value: string }>())?.value).toBe("20");
    expect((await form("/admin/preise/konditionen", gueltig)).status).toBe(303);
    expect((await form("/admin/einstellungen/zahlung", { deposit_percent: "30", security_deposit_rappen: "0", payment_due_days_before: "", terms_version: "ENTWURF-2026-11", payment_due_before_event: "on" })).status).toBe(303);
    expect((await (await db()).prepare("SELECT value FROM settings WHERE key = 'deposit_percent'").first<{ value: string }>())?.value).toBe("30");
    await form("/admin/einstellungen/zahlung", { deposit_percent: "0", security_deposit_rappen: "0", payment_due_days_before: "", terms_version: "ENTWURF-2026-11", payment_due_before_event: "on" });
  });

  it("neue Zone macht eine Region direkt buchbar; ungültige Kantone abgelehnt", async () => {
    // eigener Testort (erfundene PLZ/Koordinaten, nur Testdatenbank), damit andere Testdateien unberührt bleiben
    await (await db()).prepare("INSERT OR IGNORE INTO postal_codes (plz, ort, kanton, lat, lon) VALUES ('3999', 'Zonentest', 'BE', 46.9, 7.4)").run();
    const z = { name: "Testzone Bern", kantone: "", bereiche: "3999-3999", pauschale_chf: "80", inkl_km: "20", pro_km_chf: "1.50", max_km: "", vorlauf: "7", puffer_vor: "0", puffer_nach: "0", sort: "5", sofort: "on", abholung: "on", aktiv: "on" };
    expect((await form("/admin/preise/zone", { ...z, kantone: "XX", bereiche: "" })).status).toBe(400);
    expect((await form("/admin/preise/zone", z)).status).toBe(303);
    const a = (await (await json("/api/buchung/angebot", { paket: "essential", event: "2027-12-20", start: "2027-12-20", ende: "2027-12-20", lieferung: true, plz: "3999" })).json()) as { modus: string; positionen: { code: string }[] };
    expect(a.modus).toBe("direkt");
    expect(a.positionen.map((p) => p.code)).toContain("fahrt");
    const id = (await (await db()).prepare("SELECT id FROM delivery_zones WHERE name = 'Testzone Bern'").first<{ id: number }>())!.id;
    expect((await form(`/admin/preise/zone/${id}`, { ...z, aktiv: "" })).status).toBe(303); // wieder deaktivieren
  });
});

describe("Inhalte", () => {
  it("FAQ: Platzhalter geprüft, anlegen, ändern, löschen", async () => {
    expect((await form("/admin/inhalte/faq", { frage: "Kostet {preis:gold} etwas?", antwort: "Ja, sicher." })).status).toBe(400);
    expect((await form("/admin/inhalte/faq", { frage: "Gibt es Gutscheine?", antwort: "Ja, ab {preis:essential}.", sort: "90", sichtbar: "on" }, "admin@example.ch")).status).toBe(303);
    const v = await vorschau(await makeEnv());
    expect(v.faqs.at(-1)).toEqual({ question: "Gibt es Gutscheine?", answer: "Ja, ab CHF 290.–." });
    const id = (await (await db()).prepare("SELECT id FROM faqs WHERE question = 'Gibt es Gutscheine?'").first<{ id: number }>())!.id;
    expect((await form(`/admin/inhalte/faq/${id}`, { frage: "Gibt es Gutscheine?", antwort: "Nein.", sort: "90" })).status).toBe(303);
    expect((await vorschau(await makeEnv())).faqs.some((q) => q.question === "Gibt es Gutscheine?")).toBe(false); // unsichtbar
    expect((await form(`/admin/inhalte/faq/${id}/loeschen`, {})).status).toBe(303);
    expect((await form(`/admin/inhalte/faq/${id}/loeschen`, {})).status).toBe(404);
  });

  it("Leistungen und technische Angaben (leer = folgt)", async () => {
    expect((await form("/admin/inhalte/leistungen/essential", { leistungen: "" })).status).toBe(400);
    expect((await form("/admin/inhalte/leistungen/essential", { leistungen: "Fotobox mit Spiegelreflexkamera\nOnline-Galerie und QR-Download\nRahmen und Layouts inbegriffen\nohne Drucker" })).status).toBe(303);
    const fakt = await (await db()).prepare("SELECT id FROM product_facts WHERE label = 'Strom'").first<{ id: number }>();
    expect((await form("/admin/inhalte/fakten", { [`fakt_${fakt!.id}`]: "230 V, Testwert" })).status).toBe(303);
    expect((await vorschau(await makeEnv())).productFacts.find((x) => x.label === "Strom")?.value).toBe("230 V, Testwert");
    expect((await form("/admin/inhalte/fakten", { [`fakt_${fakt!.id}`]: "" })).status).toBe(303);
    expect((await vorschau(await makeEnv())).productFacts.find((x) => x.label === "Strom")?.value).toBeNull();
  });

  it("Webseite aktualisieren: ohne Einrichtung Hinweis, mit Dienst Aufruf mit Schlüssel", async () => {
    const ohne = await form("/admin/inhalte/aktualisieren", {});
    expect(ohne.status).toBe(503);
    const aufrufe: [string, RequestInit][] = [];
    const spion = vi.spyOn(globalThis, "fetch").mockImplementation(async (u, i) => { aufrufe.push([String(u), i ?? {}]); return new Response(null, { status: 202 }); });
    const env = await makeEnv({ REBUILD_HOOK_URL: "http://127.0.0.1:8790/neu-bauen", REBUILD_SECRET: "x".repeat(40) });
    const r = await form("/admin/inhalte/aktualisieren", {}, "admin@example.ch", BASE, env);
    spion.mockRestore();
    expect(r.status).toBe(303);
    expect(r.headers.get("Location")).toBe("/admin/inhalte?ok=aktualisierung");
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0]![0]).toBe("http://127.0.0.1:8790/neu-bauen");
    expect((aufrufe[0]![1].headers as Record<string, string>).Authorization).toBe(`Bearer ${"x".repeat(40)}`);
  });
});
