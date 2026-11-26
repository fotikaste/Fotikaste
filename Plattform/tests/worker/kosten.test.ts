import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bestaetige, gibFrei, istGesperrt, reserviere, speicherFrei, speicherstand, verbrauch, zaehle } from "../../worker/lib/usage";
import { begrenze } from "../../worker/lib/ratelimit";
import { pruefeTurnstile } from "../../worker/lib/turnstile";
import { db, makeEnv, schliesse } from "./helpers";

afterAll(async () => {
  const d = await db();
  await d.batch([
    d.prepare("UPDATE settings SET value = '8000000000' WHERE key = 'storage_limit_bytes'"),
    d.prepare("DELETE FROM storage_reservations"),
    d.prepare("UPDATE storage_budget SET used_bytes = 0, reserved_bytes = 0"),
  ]);
  await schliesse();
});

beforeEach(async () => {
  const d = await db();
  await d.batch([
    d.prepare("UPDATE settings SET value = '1000' WHERE key = 'storage_limit_bytes'"), // Sperre bei 90 % = 900 Bytes
    d.prepare("UPDATE settings SET value = '90' WHERE key = 'usage_block_percent'"),
    d.prepare("DELETE FROM storage_reservations"),
    d.prepare("UPDATE storage_budget SET used_bytes = 0, reserved_bytes = 0"),
    d.prepare("DELETE FROM usage_counters"),
  ]);
});

describe("Speicherreservierung", () => {
  it("20 gleichzeitige Uploads à 100 Bytes: genau 9 passen unter die Sperrgrenze (900)", async () => {
    const env = await makeEnv();
    const ergebnisse = await Promise.all(Array.from({ length: 20 }, (_, i) => reserviere(env, `r${i}`, 100)));
    expect(ergebnisse.filter(Boolean).length).toBe(9);
    const s = await speicherstand(env);
    expect(s.reserviert).toBe(900);
    expect(s.gesperrt).toBe(true);
  });
  it("Abschluss mit grösserer Datei als reserviert wird abgelehnt", async () => {
    const env = await makeEnv();
    expect(await reserviere(env, "a", 100)).toBe(true);
    expect(await bestaetige(env, "a", 150)).toBe(false);
    expect(await bestaetige(env, "a", 80)).toBe(true);
    const s = await speicherstand(env);
    expect([s.belegt, s.reserviert]).toEqual([80, 0]);
  });
  it("Freigabe, Ablauf und Löschen geben Speicher zurück", async () => {
    const env = await makeEnv();
    await reserviere(env, "b", 300);
    await gibFrei(env, "b");
    expect((await speicherstand(env)).reserviert).toBe(0);
    const vorher = new Date(Date.now() - 3_600_000);
    await reserviere(env, "alt", 800, 600, vorher); // vor einer Stunde, 10 min gültig → abgelaufen
    expect(await reserviere(env, "neu", 800)).toBe(true); // abgelaufene Reservierung wurde freigegeben
    await bestaetige(env, "neu", 800);
    await speicherFrei(env, 500);
    expect((await speicherstand(env)).belegt).toBe(300);
  });
  it("Warnstufen 50/75/90 %", async () => {
    const env = await makeEnv();
    const d = await db();
    for (const [belegt, stufe, schwelle] of [[400, "ok", null], [500, "warnung", 50], [750, "warnung", 75], [900, "kritisch", 90]] as const) {
      await d.prepare("UPDATE storage_budget SET used_bytes = ?1").bind(belegt).run();
      const s = await speicherstand(env);
      expect([s.stufe, s.warnschwelle]).toEqual([stufe, schwelle]);
    }
  });
});

describe("Verbrauchszähler", () => {
  it("zählt, bewertet und sperrt ab 90 %", async () => {
    const env = await makeEnv();
    await zaehle(env, "emails_tag", 74);
    let m = (await verbrauch(env)).messwerte.find((x) => x.metric === "emails_tag")!;
    expect([m.wert, m.prozent, m.stufe, m.warnschwelle]).toEqual([74, 74, "warnung", 50]);
    expect(await istGesperrt(env, "emails_tag")).toBe(false);
    await zaehle(env, "emails_tag", 16);
    expect(await istGesperrt(env, "emails_tag")).toBe(true);
  });
  it("nur bei Cloudflare messbare Werte werden nicht erfunden (null)", async () => {
    const m = (await verbrauch(await makeEnv())).messwerte.find((x) => x.metric === "worker_requests")!;
    expect(m.wert).toBeNull();
    expect(m.prozent).toBeNull();
  });
});

describe("Anfragebegrenzung und Turnstile", () => {
  it("erlaubt max. 3 Anfragen pro Fenster", async () => {
    const env = await makeEnv();
    const t = 1_800_000_000_000;
    const r = [];
    for (let i = 0; i < 5; i++) r.push((await begrenze(env, "test:ip", 3, 60, t)).erlaubt);
    expect(r).toEqual([true, true, true, false, false]);
    expect((await begrenze(env, "test:ip", 3, 60, t + 61_000)).erlaubt).toBe(true); // neues Fenster
  });
  it("Turnstile: nur bei Erfolg true, sonst immer false", async () => {
    const ok = (async () => new Response(JSON.stringify({ success: true }))) as unknown as typeof fetch;
    const nein = (async () => new Response(JSON.stringify({ success: false }))) as unknown as typeof fetch;
    const kaputt = (async () => { throw new Error("Netz"); }) as unknown as typeof fetch;
    expect(await pruefeTurnstile("t", "s", null, ok)).toBe(true);
    expect(await pruefeTurnstile("t", "s", null, nein)).toBe(false);
    expect(await pruefeTurnstile("t", "s", null, kaputt)).toBe(false);
    expect(await pruefeTurnstile(null, "s", null, ok)).toBe(false);
    expect(await pruefeTurnstile("t", undefined, null, ok)).toBe(false);
  });
});
