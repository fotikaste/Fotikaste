import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handle } from "../../worker/index";
import { berechneAngebot, halte, istFehler, leseWahl, type Wahl } from "../../worker/lib/buchung";
import { plusTage, heuteZurich } from "../../worker/lib/datum";
import { db, jwt, makeEnv, schliesse } from "./helpers";

afterAll(schliesse);

const BASE = "https://fotikaste.example";
let ipZaehler = 0;
/** Jede Anfrage mit eigener IP, damit sich die Anfragebegrenzung der Tests nicht gegenseitig stört. */
function req(pfad: string, body?: unknown, opts: { ip?: string; cookie?: string; origin?: string; token?: string } = {}) {
  const headers: Record<string, string> = { "CF-Connecting-IP": opts.ip ?? `10.0.${Math.floor(++ipZaehler / 250)}.${ipZaehler % 250}` };
  if (body !== undefined) Object.assign(headers, { "Content-Type": "application/json", Origin: opts.origin ?? BASE });
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.token) headers["Cf-Access-Jwt-Assertion"] = opts.token;
  return new Request(BASE + pfad, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const wahl = (start: string, ende: string, extra: Partial<Wahl> = {}): Wahl => ({ paket: "premium", event: start, start, ende, lieferung: true, plz: "8001", stornierbar: false, ...extra });
const kontakt = (email = "kunde.a@example.ch") => ({ name: "Anna Test", email, telefon: "+41 79 000 00 00", strasse: "Testweg 1", gaeste: 80, agb: true });

async function bucheKomplett(w: Wahl, email = "kunde.a@example.ch") {
  const env = await makeEnv();
  const h = await handle(req("/api/buchung/halten", { wahl: w }), env);
  expect(h.status).toBe(201);
  const { halteId } = (await h.json()) as { halteId: string };
  const r = await handle(req("/api/buchung/abschliessen", { halteId, kontakt: kontakt(email) }), env);
  return { r, halteId, env };
}

beforeAll(async () => {
  // TESTDATEN: Das echte Verzeichnis (Migration 0003) wird in der separaten Testdatenbank durch erfundene Koordinaten ersetzt,
  // damit die Distanzen exakt bekannt sind.
  await (await db()).batch([
    (await db()).prepare("DELETE FROM postal_codes"),
    (await db()).prepare("INSERT INTO postal_codes (plz, ort, kanton, lat, lon) VALUES ('8370', 'Startort (Test)', 'TG', 47.0, 9.0), ('8500', 'Nahort (Test)', 'TG', 47.1, 9.0), ('8001', 'Fernort (Test)', 'ZH', 47.2, 9.0), ('3000', 'Aussenort (Test)', 'BE', 47.3, 9.0)"),
  ]);
});

describe("Angebot (serverseitige Preise)", () => {
  it("Premium mit Lieferung 29 km: 450 + 50 + 9 × 1.20", async () => {
    const r = await handle(req("/api/buchung/angebot", wahl("2027-03-05", "2027-03-06")), await makeEnv());
    expect(r.status).toBe(200);
    const a = (await r.json()) as { total_rappen: number; modus: string; km: number; frei: boolean; positionen: { code: string; total_rappen: number }[]; belegung?: unknown };
    expect(a.km).toBe(29);
    expect(a.positionen.map((p) => [p.code, p.total_rappen])).toEqual([["paket", 45000], ["fahrt", 6080]]);
    expect(a.total_rappen).toBe(51080);
    expect(a.modus).toBe("direkt");
    expect(a.frei).toBe(true);
    expect(a.belegung).toBeUndefined(); // interne Details nicht an den Browser
  });
  it("Nahort 15 km: Pauschale; 4 Miettage = 2 Zusatztage; Option stornierbar", async () => {
    const r = await handle(req("/api/buchung/angebot", wahl("2027-03-10", "2027-03-13", { plz: "8500", stornierbar: true, paket: "essential" })), await makeEnv());
    const a = (await r.json()) as { total_rappen: number; stornoBis: string; positionen: { code: string; qty: number; total_rappen: number }[] };
    expect(a.positionen.map((p) => [p.code, p.qty, p.total_rappen])).toEqual([["paket", 1, 29000], ["zusatztag", 2, 9000], ["fahrt", 1, 5000], ["storno", 1, 2000]]);
    expect(a.total_rappen).toBe(45000);
    expect(a.stornoBis).toBe("2027-02-10");
  });
  it("Selbstabholung ohne Fahrt; Preise aus dem Browser werden ignoriert", async () => {
    const r = await handle(req("/api/buchung/angebot", { ...wahl("2027-03-15", "2027-03-16", { lieferung: false, paket: "signature" }), total_rappen: 1, preis: 1 }), await makeEnv());
    expect(((await r.json()) as { total_rappen: number }).total_rappen).toBe(59000);
  });
  it("ungültige Eingaben: 400", async () => {
    const env = await makeEnv();
    const fall = async (w: unknown) => (await handle(req("/api/buchung/angebot", w), env)).status;
    expect(await fall(wahl("2027-03-05", "2027-03-04"))).toBe(400); // Ende vor Beginn
    expect(await fall({ ...wahl("2027-03-05", "2027-03-06"), event: "2027-03-08" })).toBe(400); // Event ausserhalb
    expect(await fall(wahl("2027-03-01", "2027-03-20"))).toBe(400); // > 7 Tage
    expect(await fall(wahl("2027-03-05", "2027-03-06", { paket: "gold" }))).toBe(400);
    expect(await fall(wahl("2027-03-05", "2027-03-06", { plz: "80" }))).toBe(400);
    expect(await fall(wahl("2020-03-05", "2020-03-06"))).toBe(400); // Vergangenheit
    expect(await fall(wahl("2030-03-05", "2030-03-06"))).toBe(400); // zu weit
    const bald = plusTage(heuteZurich(), 20);
    expect(await fall(wahl(bald, bald, { stornierbar: true }))).toBe(400); // Storno-Option nur > 28 Tage vorher
  });
  it("kurzfristig, ausserhalb Gebiet oder unbekannte PLZ → Anfrage", async () => {
    const env = await makeEnv();
    const kurz = plusTage(heuteZurich(), 3);
    const a1 = (await (await handle(req("/api/buchung/angebot", wahl(kurz, kurz)), env)).json()) as { modus: string; grund: string };
    expect(a1.modus).toBe("anfrage");
    expect(a1.grund).toContain("kurzfristig");
    const a2 = (await (await handle(req("/api/buchung/angebot", wahl("2027-03-05", "2027-03-06", { plz: "3000" })), env)).json()) as { modus: string; preisFix: boolean; positionen: { code: string }[] };
    expect(a2.modus).toBe("anfrage");
    expect(a2.preisFix).toBe(false);
    expect(a2.positionen.map((p) => p.code)).toEqual(["paket"]);
    const a3 = (await (await handle(req("/api/buchung/angebot", wahl("2027-03-05", "2027-03-06", { plz: "9999" })), env)).json()) as { modus: string; grund: string };
    expect(a3.grund).toContain("nicht im Verzeichnis");
  });
});

describe("Buchung A–Z", () => {
  it("halten → abschliessen: bestätigt, Snapshot, keine Zahlungsdaten, Mails im Testmodus", async () => {
    const { r } = await bucheKomplett(wahl("2027-04-02", "2027-04-03"));
    expect(r.status).toBe(201);
    const b = (await r.json()) as { nummer: string; status: string };
    expect(b.status).toBe("confirmed");
    expect(b.nummer).toMatch(/^FK-\d{4}-\d{4}$/);
    const d = await db();
    const row = await d.prepare("SELECT id, total_rappen, contact_email, terms_version FROM bookings WHERE number = ?1").bind(b.nummer).first<{ id: string; total_rappen: number; contact_email: string; terms_version: string }>();
    expect(row?.total_rappen).toBe(51080);
    expect(row?.terms_version).toBe("ENTWURF-2026-11");
    const items = await d.prepare("SELECT code, total_rappen FROM booking_items WHERE booking_id = ?1 ORDER BY pos").bind(row!.id).all();
    expect(items.results).toEqual([{ code: "paket", total_rappen: 45000 }, { code: "fahrt", total_rappen: 6080 }]);
    const zahlungen = await d.prepare("SELECT COUNT(*) AS n FROM payments WHERE booking_id = ?1").bind(row!.id).first<{ n: number }>();
    expect(zahlungen?.n).toBe(0); // nichts automatisch, Zahlung wird persönlich vereinbart
    const tage = await d.prepare("SELECT d.resource_id, d.day FROM allocation_days d JOIN allocations a ON a.id = d.allocation_id WHERE a.booking_id = ?1 AND a.type = 'booking' ORDER BY 1, 2").bind(row!.id).all();
    expect(tage.results).toEqual([
      { resource_id: "fotobox-1", day: "2027-04-02" }, { resource_id: "fotobox-1", day: "2027-04-03" },
      { resource_id: "lieferung", day: "2027-04-02" }, { resource_id: "lieferung", day: "2027-04-03" },
    ]);
    const mails = await d.prepare("SELECT to_email, status, test_mode, body_text FROM outbox WHERE dedupe_key LIKE ?1 ORDER BY id").bind(`buchung:${row!.id}:%`).all<{ to_email: string; status: string; test_mode: number; body_text: string }>();
    expect(mails.results.map((m) => [m.to_email, m.status, m.test_mode])).toEqual([["kunde.a@example.ch", "held", 1], ["inhaber@example.ch", "held", 1]]);
    expect(mails.results[0]!.body_text).toContain("CHF 510.80");
    expect(mails.results[0]!.body_text).toContain("Online wird nichts bezahlt. Wir melden uns persönlich");
    expect(mails.results[0]!.body_text).not.toMatch(/IBAN|Anzahlung|Kaution|fällig/);
    // Danach ist der Termin belegt
    const a = (await (await handle(req("/api/buchung/angebot", wahl("2027-04-03", "2027-04-04")), await makeEnv())).json()) as { frei: boolean; belegteTage: string[] };
    expect(a.frei).toBe(false);
    expect(a.belegteTage).toEqual(["2027-04-03"]);
    expect((await handle(req("/api/buchung/halten", { wahl: wahl("2027-04-03", "2027-04-04") }), await makeEnv())).status).toBe(409);
  });

  it("öffentlicher Kalender zeigt nur belegte Tage, keine Personendaten", async () => {
    const r = await handle(req("/api/verfuegbarkeit?von=2027-04-01&bis=2027-04-30"), await makeEnv());
    const k = (await r.json()) as { belegt: string[] };
    expect(k.belegt).toEqual(["2027-04-02", "2027-04-03"]);
    expect(JSON.stringify(k)).not.toContain("kunde");
    expect((await handle(req("/api/verfuegbarkeit?von=2027-01-01&bis=2027-12-31"), await makeEnv())).status).toBe(400);
  });

  it("Gleichzeitigkeit: 50 Versuche auf denselben Tag → genau einer gewinnt", async () => {
    const env = await makeEnv();
    const antworten = await Promise.all(Array.from({ length: 50 }, () => handle(req("/api/buchung/halten", { wahl: wahl("2027-05-07", "2027-05-08") }), env)));
    const status = antworten.map((r) => r.status);
    expect(status.filter((s) => s === 201).length).toBe(1);
    expect(status.filter((s) => s === 409).length).toBe(49);
    const n = await (await db()).prepare("SELECT COUNT(*) AS n FROM allocation_days WHERE resource_id = 'fotobox-1' AND day = '2027-05-07'").first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("Gleichzeitigkeit: überlappende Zeiträume → genau einer gewinnt, kein halber Hold", async () => {
    const env = await makeEnv();
    const w = [wahl("2027-05-12", "2027-05-13"), wahl("2027-05-13", "2027-05-14"), wahl("2027-05-11", "2027-05-12", { lieferung: false })];
    const antworten = await Promise.all(Array.from({ length: 30 }, (_, i) => handle(req("/api/buchung/halten", { wahl: w[i % 3] }), env)));
    const gewinner = antworten.filter((r) => r.status === 201).length;
    expect(gewinner).toBeGreaterThanOrEqual(1);
    const tage = await (await db()).prepare("SELECT day, COUNT(*) AS n FROM allocation_days WHERE resource_id = 'fotobox-1' AND day BETWEEN '2027-05-11' AND '2027-05-14' GROUP BY day").all<{ day: string; n: number }>();
    expect(tage.results.every((t) => t.n === 1)).toBe(true);
    const holds = await (await db()).prepare("SELECT COUNT(*) AS n FROM allocations a WHERE type = 'hold' AND NOT EXISTS (SELECT 1 FROM allocation_days d WHERE d.allocation_id = a.id)").first<{ n: number }>();
    expect(holds?.n).toBe(0);
  });

  it("abgelaufener Hold gibt den Termin frei und kann nicht mehr abgeschlossen werden", async () => {
    const env = await makeEnv();
    const frueher = new Date(Date.now() - 60 * 60_000);
    const w = leseWahl(wahl("2027-05-20", "2027-05-21"));
    if (istFehler(w)) throw new Error(w.text);
    const a = await berechneAngebot(env, w, frueher);
    if (istFehler(a)) throw new Error(a.text);
    const alt = await halte(env, a, frueher);
    if (istFehler(alt)) throw new Error(alt.text);
    expect((await handle(req("/api/buchung/abschliessen", { halteId: alt.id, kontakt: kontakt() }), env)).status).toBe(409);
    const neu = await handle(req("/api/buchung/halten", { wahl: wahl("2027-05-20", "2027-05-21") }), env);
    expect(neu.status).toBe(201);
    const rest = await (await db()).prepare("SELECT COUNT(*) AS n FROM allocations WHERE id = ?1").bind(alt.id).first<{ n: number }>();
    expect(rest?.n).toBe(0); // aufgeräumt
  });

  it("doppelter Abschluss desselben Holds → nur eine Buchung", async () => {
    const env = await makeEnv();
    const h = (await (await handle(req("/api/buchung/halten", { wahl: wahl("2027-05-27", "2027-05-28") }), env)).json()) as { halteId: string };
    const [r1, r2] = await Promise.all([1, 2].map(() => handle(req("/api/buchung/abschliessen", { halteId: h.halteId, kontakt: kontakt() }), env)));
    expect([r1!.status, r2!.status].sort()).toEqual([201, 409]);
    const n = await (await db()).prepare("SELECT COUNT(*) AS n FROM bookings WHERE event_day = '2027-05-27'").first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("Kontaktangaben werden geprüft, AGB sind Pflicht", async () => {
    const env = await makeEnv();
    const h = (await (await handle(req("/api/buchung/halten", { wahl: wahl("2027-06-02", "2027-06-03") }), env)).json()) as { halteId: string };
    for (const k of [{ ...kontakt(), agb: false }, { ...kontakt(), email: "kein-mail" }, { ...kontakt(), strasse: "" }, { ...kontakt(), telefon: "abc" }]) {
      expect((await handle(req("/api/buchung/abschliessen", { halteId: h.halteId, kontakt: k }), env)).status).toBe(400);
    }
    expect((await handle(req("/api/buchung/abschliessen", { halteId: h.halteId, kontakt: kontakt() }), env)).status).toBe(201);
  });

  it("Schutz: fremde Herkunft 403, Anfragebegrenzung 429, Turnstile in Produktion ohne Schlüssel 403", async () => {
    const env = await makeEnv();
    expect((await handle(req("/api/buchung/halten", { wahl: wahl("2027-06-10", "2027-06-10") }, { origin: "https://boese.example" }), env)).status).toBe(403);
    const status: number[] = [];
    for (let i = 0; i < 11; i++) status.push((await handle(req("/api/buchung/halten", { wahl: wahl("2027-06-11", "2027-06-11", { paket: "x1" }) }, { ip: "192.0.2.77" }), env)).status);
    expect(status.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(status[10]).toBe(429);
    const prod = await makeEnv({ ENVIRONMENT: "production" });
    expect((await handle(req("/api/buchung/halten", { wahl: wahl("2027-06-12", "2027-06-12") }), prod)).status).toBe(403);
  });
});

describe("Anfrage-Weg und Administration", () => {
  const admin = (email = "inhaber@example.ch") => jwt({ email });
  async function anfrage(start: string) {
    const { r } = await bucheKomplett(wahl(start, start, { plz: "3000" }), "kunde.c@example.ch");
    expect(r.status).toBe(201);
    const b = (await r.json()) as { nummer: string; status: string };
    expect(b.status).toBe("request");
    return (await (await db()).prepare("SELECT id FROM bookings WHERE number = ?1").bind(b.nummer).first<{ id: string }>())!.id;
  }

  it("Anfrage ausserhalb Gebiet: Termin reserviert, Bestätigung verlangt Fahrtkosten, nur mit Recht", async () => {
    const id = await anfrage("2027-07-02");
    const env = await makeEnv();
    expect((await handle(req("/api/verfuegbarkeit?von=2027-07-01&bis=2027-07-03"), env).then((r) => r.json()) as { belegt: string[] }).belegt).toEqual(["2027-07-02"]);
    expect((await handle(req(`/api/admin/buchungen/${id}/bestaetigen`, { fahrtRappen: 9000 }, { token: await admin("mitarbeiter@example.ch") }), env)).status).toBe(403);
    expect((await handle(req(`/api/admin/buchungen/${id}/bestaetigen`, {}, { token: await admin() }), env)).status).toBe(400);
    const ok = await handle(req(`/api/admin/buchungen/${id}/bestaetigen`, { fahrtRappen: 9000 }, { token: await admin() }), env);
    expect(ok.status).toBe(200);
    const b = await (await db()).prepare("SELECT status, total_rappen, price_final FROM bookings WHERE id = ?1").bind(id).first();
    expect(b).toEqual({ status: "confirmed", total_rappen: 54000, price_final: 1 });
    expect((await handle(req(`/api/admin/buchungen/${id}/bestaetigen`, { fahrtRappen: 1 }, { token: await admin() }), env)).status).toBe(409); // nur einmal
    const log = await (await db()).prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'buchung.bestaetigt'").first<{ n: number }>();
    expect(log?.n).toBe(1);
  });

  it("Ablehnen gibt die Tage wieder frei", async () => {
    const id = await anfrage("2027-07-09");
    const env = await makeEnv();
    expect((await handle(req(`/api/admin/buchungen/${id}/ablehnen`, {}, { token: await admin("admin@example.ch") }), env)).status).toBe(200);
    expect((await handle(req("/api/verfuegbarkeit?von=2027-07-09&bis=2027-07-09"), env).then((r) => r.json()) as { belegt: string[] }).belegt).toEqual([]);
    expect((await (await db()).prepare("SELECT status FROM bookings WHERE id = ?1").bind(id).first<{ status: string }>())?.status).toBe("declined");
  });

  it("Admin-Seite listet Buchungen und Mails; Mitarbeiter ohne Aktionsknöpfe", async () => {
    const env = await makeEnv();
    const t = await (await handle(req("/admin", undefined, { token: await admin() }), env)).text();
    expect(t).toContain("Buchungen");
    expect(t).toContain("E-Mail-Ausgang");
    expect(t).toContain("Testmodus");
    await anfrage("2027-07-16");
    const m = await (await handle(req("/admin", undefined, { token: await admin("mitarbeiter@example.ch") }), env)).text();
    expect(m).toContain("Anfrage");
    expect(m).not.toContain("Bestätigen</button>");
  });
});

describe("Kundenportal (Magic Link)", () => {
  async function anmelden(email: string): Promise<string> {
    const env = await makeEnv();
    const r = await handle(req("/api/konto/link", { email }), env);
    expect(r.status).toBe(200);
    const m = await (await db()).prepare("SELECT body_text FROM outbox WHERE to_email = ?1 AND dedupe_key LIKE 'magic:%' ORDER BY id DESC LIMIT 1").bind(email).first<{ body_text: string }>();
    const token = m!.body_text.match(/#([0-9a-f]{64})/)![1]!;
    const a = await handle(req("/api/konto/anmelden", { token }), env);
    expect(a.status).toBe(200);
    const cookie = a.headers.get("Set-Cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    // ein zweites Mal geht nicht
    expect((await handle(req("/api/konto/anmelden", { token }), env)).status).toBe(400);
    return cookie.split(";")[0]!;
  }

  it("unbekannte Adresse: gleiche Antwort, keine Mail", async () => {
    const r = await handle(req("/api/konto/link", { email: "niemand@example.ch" }), await makeEnv());
    expect(r.status).toBe(200);
    const n = await (await db()).prepare("SELECT COUNT(*) AS n FROM outbox WHERE to_email = 'niemand@example.ch'").first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it("Kunde sieht nur eigene Buchungen; ohne Sitzung 401; Abmelden widerruft", async () => {
    await bucheKomplett(wahl("2027-08-06", "2027-08-07"), "kunde.b@example.ch");
    const env = await makeEnv();
    const a = await anmelden("kunde.a@example.ch");
    const b = await anmelden("kunde.b@example.ch");
    const ja = (await (await handle(req("/api/konto/buchungen", undefined, { cookie: a }), env)).json()) as { buchungen: { event_day: string; positionen: unknown[]; bezahlt: number }[] };
    const jb = (await (await handle(req("/api/konto/buchungen", undefined, { cookie: b }), env)).json()) as { buchungen: { event_day: string; contact_email?: string }[] };
    expect(ja.buchungen.length).toBeGreaterThanOrEqual(3);
    expect(ja.buchungen.some((x) => x.event_day === "2027-08-06")).toBe(false);
    expect(jb.buchungen.map((x) => x.event_day)).toEqual(["2027-08-06"]);
    expect(ja.buchungen[0]!.positionen.length).toBeGreaterThan(0);
    expect(JSON.stringify(ja)).not.toContain("kunde.b@");
    expect((await handle(req("/api/konto/buchungen"), env)).status).toBe(401);
    expect((await handle(req("/api/konto/buchungen", undefined, { cookie: "fk_sitzung=" + "0".repeat(64) }), env)).status).toBe(401);
    expect((await handle(req("/api/konto/abmelden", {}, { cookie: a }), env)).status).toBe(200);
    expect((await handle(req("/api/konto/buchungen", undefined, { cookie: a }), env)).status).toBe(401);
  });

  it("abgelaufener Link wird abgelehnt; höchstens 5 Links pro Adresse und Stunde", async () => {
    const env = await makeEnv();
    const d = await db();
    await handle(req("/api/konto/link", { email: "kunde.c@example.ch" }), env);
    const m = await d.prepare("SELECT body_text FROM outbox WHERE to_email = 'kunde.c@example.ch' AND dedupe_key LIKE 'magic:%'").first<{ body_text: string }>();
    await d.prepare("UPDATE magic_links SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    expect((await handle(req("/api/konto/anmelden", { token: m!.body_text.match(/#([0-9a-f]{64})/)![1] }), env)).status).toBe(400);
    for (let i = 0; i < 6; i++) await handle(req("/api/konto/link", { email: "kunde.c@example.ch" }), env);
    const n = await d.prepare("SELECT COUNT(*) AS n FROM magic_links l JOIN customers c ON c.id = l.customer_id WHERE c.email = 'kunde.c@example.ch'").first<{ n: number }>();
    expect(n!.n).toBe(5);
  });

  it("Produktions-Cookie mit __Host- und Secure", async () => {
    const { sitzungsCookie } = await import("../../worker/lib/kunde");
    const c = sitzungsCookie(await makeEnv({ ENVIRONMENT: "production" }), "abc", 10);
    expect(c.startsWith("__Host-fk_sitzung=abc")).toBe(true);
    expect(c).toContain("Secure");
  });
});
