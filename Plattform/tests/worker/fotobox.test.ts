/** Phase 5: Geräte-API, Uploads in den privaten Speicher, Gäste-Links, Veranstalter-Galerie, Löschung. */
import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handle } from "../../worker/index";
import { wartung } from "../../worker/lib/wartung";
import { db, fotos, jwt, makeEnv, schliesse } from "./helpers";

afterAll(schliesse);
const BASE = "https://fotikaste.example";
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
/** Kleines «JPEG» (gültiger Dateianfang, Inhalt egal – der Server prüft Grösse, Prüfsumme und JPEG-Kennung). */
const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...randomBytes(n)]);

const admin = async (pfad: string, felder?: Record<string, string>, email = "inhaber@example.ch") =>
  handle(new Request(BASE + pfad, felder
    ? { method: "POST", body: new URLSearchParams(felder).toString(), headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: BASE, "Cf-Access-Jwt-Assertion": await jwt({ email }) } }
    : { headers: { "Cf-Access-Jwt-Assertion": await jwt({ email }) } }), await makeEnv());

/** Geräte-Anfrage: bewusst OHNE Origin-Kopfzeile (wie die Fotobox). */
const geraet = async (token: string, pfad: string, opts: { method?: string; json?: unknown; body?: Uint8Array } = {}) =>
  handle(new Request(`${BASE}/api/device/v1${pfad}`, {
    method: opts.method ?? (opts.json || opts.body ? "POST" : "GET"),
    headers: { Authorization: `Bearer ${token}`, ...(opts.json ? { "Content-Type": "application/json" } : {}), ...(opts.body ? { "Content-Type": "image/jpeg", "Content-Length": String(opts.body.byteLength) } : {}) },
    body: opts.json ? JSON.stringify(opts.json) : opts.body,
  }), await makeEnv());

async function neuesGeraet(name: string): Promise<{ token: string; id: string }> {
  const r = await admin("/admin/geraete", { name });
  expect(r.status).toBe(200);
  const token = (await r.text()).match(/user-select:all">([0-9a-f]{64})</)![1]!;
  const id = (await (await db()).prepare("SELECT id FROM devices WHERE name = ?1").bind(name).first<{ id: string }>())!.id;
  return { token, id };
}
async function neuesEvent(name: string, geraetId: string, tag = "2027-02-06", buchung = ""): Promise<string> {
  const r = await admin("/admin/events", { name, tag, geraet: geraetId, buchung });
  expect(r.status).toBe(303);
  return r.headers.get("Location")!.split("/")[3]!.split("?")[0]!;
}
/** Ganzes Foto hochladen → Gäste-Token. */
async function ladeFoto(token: string, eventId: string | null = null) {
  const gast = randomBytes(18).toString("base64url");
  const web = jpeg(3000), thumb = jpeg(400);
  const a = await geraet(token, "/uploads", { json: { event_id: eventId, client_photo_id: randomBytes(9).toString("base64url"), token_hash: sha(gast), taken_at: new Date().toISOString(), web: { bytes: web.byteLength, sha256: sha(web) }, thumb: { bytes: thumb.byteLength, sha256: sha(thumb) } } });
  expect(a.status).toBe(201);
  const { photo_id } = (await a.json()) as { photo_id: string };
  expect((await geraet(token, `/uploads/${photo_id}/web`, { method: "PUT", body: web })).status).toBe(200);
  const fertig = (await (await geraet(token, `/uploads/${photo_id}/thumb`, { method: "PUT", body: thumb })).json()) as { fertig: boolean };
  expect(fertig.fertig).toBe(true);
  return { gast, photo_id, web, thumb };
}

let box: { token: string; id: string };
let eventId: string;
beforeAll(async () => {
  box = await neuesGeraet("Testbox Phase 5");
});

describe("Geräte und Rechte", () => {
  it("Token wird nur als Hash gespeichert; ohne/falsches Token 401; Mitarbeiter sieht keine Geräte", async () => {
    const n = await (await db()).prepare("SELECT COUNT(*) AS n FROM device_tokens WHERE token_hash = ?1").bind(sha(box.token)).first<{ n: number }>();
    expect(n?.n).toBe(1);
    expect((await handle(new Request(`${BASE}/api/device/v1/config`), await makeEnv())).status).toBe(401);
    expect((await geraet("f".repeat(64), "/config")).status).toBe(401);
    expect((await admin("/admin/geraete", undefined, "mitarbeiter@example.ch")).status).toBe(403);
    expect((await admin("/admin/events", undefined, "mitarbeiter@example.ch")).status).toBe(403);
  });
  it("Konfiguration ohne aktives Event; Upload wird abgelehnt", async () => {
    const c = (await (await geraet(box.token, "/config")).json()) as { event: unknown; bild: { lange_seite_px: number } };
    expect(c.event).toBeNull();
    expect(c.bild.lange_seite_px).toBe(2400);
    const r = await geraet(box.token, "/uploads", { json: { client_photo_id: "abcdefgh1", token_hash: sha("x"), web: { bytes: 10, sha256: sha("a") }, thumb: { bytes: 10, sha256: sha("b") } } });
    expect(r.status).toBe(409);
  });
  it("Event aktivieren; zweites aktives Event für dieselbe Fotobox abgelehnt", async () => {
    eventId = await neuesEvent("Testevent A", box.id);
    expect((await admin(`/admin/events/${eventId}/aktivieren`, {})).status).toBe(303);
    const zweites = await neuesEvent("Testevent B", box.id);
    const r = await admin(`/admin/events/${zweites}/aktivieren`, {});
    expect(r.status).toBe(409);
    expect(await r.text()).toContain("schon ein aktives Event");
    const c = (await (await geraet(box.token, "/config")).json()) as { event: { id: string } };
    expect(c.event.id).toBe(eventId);
  });
});

describe("Upload", () => {
  it("vollständiger Upload: Speicher belegt, Zähler, Gäste-Link zeigt das Foto", async () => {
    const vorher = await (await db()).prepare("SELECT used_bytes FROM storage_budget").first<{ used_bytes: number }>();
    const { gast, web, thumb, photo_id } = await ladeFoto(box.token);
    const nachher = await (await db()).prepare("SELECT used_bytes, reserved_bytes FROM storage_budget").first<{ used_bytes: number; reserved_bytes: number }>();
    expect(nachher!.used_bytes - vorher!.used_bytes).toBe(web.byteLength + thumb.byteLength);
    const obj = await (await fotos()).get(`events/${eventId}/${photo_id}-web.jpg`);
    expect(new Uint8Array(await obj!.arrayBuffer())).toEqual(web);
    const seite = await handle(new Request(`${BASE}/f/${gast}`), await makeEnv());
    expect(seite.status).toBe(200);
    expect(seite.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(await seite.text()).toContain(`/f/${gast}/bild`);
    const bild = await handle(new Request(`${BASE}/f/${gast}/bild?download`), await makeEnv());
    expect(bild.headers.get("Content-Disposition")).toContain("attachment");
    expect(new Uint8Array(await bild.arrayBuffer())).toEqual(web);
  });

  it("unbekannter oder noch nicht hochgeladener Link: «noch unterwegs», verrät nichts", async () => {
    for (const t of ["kurz", randomBytes(18).toString("base64url")]) {
      const r = await handle(new Request(`${BASE}/f/${t}`), await makeEnv());
      expect(r.status).toBe(200);
      expect(await r.text()).toContain("noch unterwegs");
    }
  });

  it("gleiche Anmeldung erneut → fertig, kein Doppel; anderer Inhalt → 409", async () => {
    const gast = randomBytes(18).toString("base64url");
    const web = jpeg(500), thumb = jpeg(100);
    const anm = { client_photo_id: "wiederholung-1", token_hash: sha(gast), web: { bytes: web.byteLength, sha256: sha(web) }, thumb: { bytes: thumb.byteLength, sha256: sha(thumb) } };
    const a = (await (await geraet(box.token, "/uploads", { json: anm })).json()) as { photo_id: string };
    await geraet(box.token, `/uploads/${a.photo_id}/web`, { method: "PUT", body: web });
    // Abbruch nach «web» → erneute Anmeldung nennt nur die fehlende Variante
    const b = (await (await geraet(box.token, "/uploads", { json: anm })).json()) as { photo_id: string; fehlend: string[] };
    expect(b).toMatchObject({ photo_id: a.photo_id, fehlend: ["thumb"] });
    await geraet(box.token, `/uploads/${a.photo_id}/thumb`, { method: "PUT", body: thumb });
    const c = await geraet(box.token, "/uploads", { json: anm });
    expect(c.status).toBe(200);
    expect(((await c.json()) as { fertig: boolean }).fertig).toBe(true);
    expect((await geraet(box.token, "/uploads", { json: { ...anm, web: { ...anm.web, sha256: sha("anders") } } })).status).toBe(409);
    const n = await (await db()).prepare("SELECT COUNT(*) AS n FROM photos WHERE client_photo_id = 'wiederholung-1'").first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("falsche Grösse, falsche Prüfsumme, kein JPEG → abgelehnt, nichts gespeichert", async () => {
    const web = jpeg(800), thumb = jpeg(100);
    const a = (await (await geraet(box.token, "/uploads", { json: { client_photo_id: "pruefung-0001", token_hash: sha(randomBytes(8)), web: { bytes: web.byteLength, sha256: sha(web) }, thumb: { bytes: thumb.byteLength, sha256: sha(thumb) } } })).json()) as { photo_id: string };
    expect((await geraet(box.token, `/uploads/${a.photo_id}/web`, { method: "PUT", body: jpeg(10) })).status).toBe(400);
    const gefaelscht = new Uint8Array(web); gefaelscht[100] ^= 1;
    expect((await geraet(box.token, `/uploads/${a.photo_id}/web`, { method: "PUT", body: gefaelscht })).status).toBe(400);
    const png = new Uint8Array(100).fill(1);
    const p = (await (await geraet(box.token, "/uploads", { json: { client_photo_id: "pruefung-0002", token_hash: sha(randomBytes(8)), web: { bytes: 100, sha256: sha(png) }, thumb: { bytes: thumb.byteLength, sha256: sha(thumb) } } })).json()) as { photo_id: string };
    expect((await geraet(box.token, `/uploads/${p.photo_id}/web`, { method: "PUT", body: png })).status).toBe(415);
    expect(await (await fotos()).head(`events/${eventId}/${a.photo_id}-web.jpg`)).toBeNull();
  });

  it("anderes Gerät kann weder hochladen noch fremde Fotos ändern", async () => {
    const fremd = await neuesGeraet("Fremde Box");
    const web = jpeg(300), thumb = jpeg(50);
    const a = (await (await geraet(box.token, "/uploads", { json: { client_photo_id: "fremd-0001", token_hash: sha(randomBytes(8)), web: { bytes: web.byteLength, sha256: sha(web) }, thumb: { bytes: thumb.byteLength, sha256: sha(thumb) } } })).json()) as { photo_id: string };
    expect((await geraet(fremd.token, `/uploads/${a.photo_id}/web`, { method: "PUT", body: web })).status).toBe(404);
    expect((await geraet(fremd.token, "/uploads", { json: { event_id: eventId, client_photo_id: "fremd-0002", token_hash: sha(randomBytes(8)), web: { bytes: 10, sha256: sha("a") }, thumb: { bytes: 10, sha256: sha("b") } } })).status).toBe(409);
  });

  it("Speichergrenze erreicht → 507, Fotobox behält das Foto", async () => {
    const d = await db();
    await d.prepare("UPDATE storage_budget SET used_bytes = 7200000000").run();
    const r = await geraet(box.token, "/uploads", { json: { client_photo_id: "voll-00001", token_hash: sha(randomBytes(8)), web: { bytes: 1000, sha256: sha("a") }, thumb: { bytes: 100, sha256: sha("b") } } });
    expect(r.status).toBe(507);
    await d.prepare("UPDATE storage_budget SET used_bytes = (SELECT COALESCE(SUM(web_bytes + thumb_bytes), 0) FROM photos WHERE status = 'ready')").run();
  });

  it("Heartbeat speichert Version und Warteschlange; Admin zeigt sie", async () => {
    expect((await geraet(box.token, "/heartbeat", { json: { version: "2026.11-test", warteschlange: 3, zaehler: { fotos: 12 } } })).status).toBe(200);
    const t = await (await admin("/admin/geraete")).text();
    expect(t).toContain("2026.11-test");
    expect(t).toContain("Warteschlange: 3");
  });
});

describe("Veranstalter, Archivieren, Aufbewahrung", () => {
  it("Veranstalter sieht Fotos seines Events im Kundenkonto, andere Kunden nicht", async () => {
    const d = await db();
    const ich = randomBytes(16).toString("hex"), andere = randomBytes(16).toString("hex"), buchung = randomBytes(16).toString("hex");
    await d.batch([
      d.prepare("INSERT INTO customers (id, email, name) VALUES (?1, ?2, 'Veranstalterin'), (?3, ?4, 'Andere')").bind(ich, `v.${ich}@example.ch`, andere, `a.${andere}@example.ch`),
      d.prepare(`INSERT INTO bookings (id, number, status, customer_id, contact_name, contact_phone, contact_email, package_slug, event_day, start_day, end_day, delivery, total_rappen, terms_version)
                 VALUES (?1, ?2, 'confirmed', ?3, 'Veranstalterin', '+41 79 000 00 00', 'v@example.ch', 'premium', '2027-03-20', '2027-03-20', '2027-03-20', 0, 45000, 'T')`).bind(buchung, `FK-T5-${ich.slice(0, 6)}`, ich),
    ]);
    const box2 = await neuesGeraet("Box Veranstalter");
    const ev = await neuesEvent("Hochzeit Test", box2.id, "2027-03-20", buchung);
    await admin(`/admin/events/${ev}/aktivieren`, {});
    const { photo_id, thumb } = await ladeFoto(box2.token);
    const sitzung = async (kunde: string) => { const t = randomBytes(32).toString("hex"); await d.prepare("INSERT INTO sessions (session_hash, customer_id, expires_at) VALUES (?1, ?2, '2099-01-01T00:00:00Z')").bind(sha(t), kunde).run(); return `fk_sitzung=${t}`; };
    const meine = await sitzung(ich), fremde = await sitzung(andere);
    const liste = (await (await handle(new Request(`${BASE}/api/konto/buchungen`, { headers: { Cookie: meine } }), await makeEnv())).json()) as { buchungen: { galerie: { fotos: string[] } | null }[] };
    expect(liste.buchungen[0]!.galerie!.fotos).toEqual([photo_id]);
    const bild = await handle(new Request(`${BASE}/api/konto/foto/${photo_id}/thumb`, { headers: { Cookie: meine } }), await makeEnv());
    expect(new Uint8Array(await bild.arrayBuffer())).toEqual(thumb);
    expect((await handle(new Request(`${BASE}/api/konto/foto/${photo_id}/thumb`, { headers: { Cookie: fremde } }), await makeEnv())).status).toBe(404);
    expect((await handle(new Request(`${BASE}/api/konto/foto/${photo_id}/thumb`), await makeEnv())).status).toBe(401);
  });

  it("Archivieren löscht alle Fotos (Speicher, Link → 410), widerrufenes Token → 401", async () => {
    const { gast, photo_id } = await ladeFoto(box.token);
    const belegt = (await (await db()).prepare("SELECT used_bytes FROM storage_budget").first<{ used_bytes: number }>())!.used_bytes;
    expect((await admin(`/admin/events/${eventId}/archivieren`, {})).status).toBe(303);
    expect(await (await fotos()).head(`events/${eventId}/${photo_id}-web.jpg`)).toBeNull();
    expect((await handle(new Request(`${BASE}/f/${gast}`), await makeEnv())).status).toBe(410);
    const danach = (await (await db()).prepare("SELECT used_bytes FROM storage_budget").first<{ used_bytes: number }>())!.used_bytes;
    expect(danach).toBeLessThan(belegt);
    expect((await admin(`/admin/geraete/${box.id}/widerrufen`, {})).status).toBe(303);
    expect((await geraet(box.token, "/config")).status).toBe(401);
  });

  it("täglicher Cron löscht Fotos nach Ablauf der Aufbewahrung", async () => {
    const box3 = await neuesGeraet("Box Aufbewahrung");
    const ev = await neuesEvent("Kurzes Event", box3.id, "2027-04-10");
    await admin(`/admin/events/${ev}/aktivieren`, {});
    const { gast, photo_id } = await ladeFoto(box3.token);
    const env = await makeEnv();
    await wartung(env, new Date("2027-04-20T04:00:00Z")); // noch innerhalb 30 Tage → dieses Foto bleibt
    expect(await (await fotos()).head(`events/${ev}/${photo_id}-thumb.jpg`)).not.toBeNull();
    const r = await wartung(env, new Date("2027-05-11T04:00:00Z"));
    expect(r.abgelaufen).toBeGreaterThanOrEqual(1);
    expect(await (await fotos()).head(`events/${ev}/${photo_id}-thumb.jpg`)).toBeNull();
    expect((await handle(new Request(`${BASE}/f/${gast}`), await makeEnv())).status).toBe(410);
  });
});
