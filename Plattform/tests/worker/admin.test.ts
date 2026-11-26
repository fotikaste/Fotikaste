import { afterAll, describe, expect, it } from "vitest";
import { handle } from "../../worker/index";
import { anfrage, jwt, makeEnv, schliesse, db } from "./helpers";

afterAll(schliesse);
const als = (email: string) => jwt({ email });

describe("Zugriffsrechte Admin-API", () => {
  it("ohne Anmeldung: 401", async () => {
    const r = await handle(anfrage("/api/admin/me"), await makeEnv());
    expect(r.status).toBe(401);
    expect(r.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });
  it("Eigentümer: 200 mit allen Rechten", async () => {
    const r = await handle(anfrage("/api/admin/me", { token: await als("inhaber@example.ch") }), await makeEnv());
    expect(r.status).toBe(200);
    const d = (await r.json()) as { role: string; permissions: string[] };
    expect(d.role).toBe("owner");
    expect(d.permissions).toContain("settings:write");
  });
  it("unbekanntes und inaktives Konto: 403 und Protokolleintrag", async () => {
    const env = await makeEnv();
    expect((await handle(anfrage("/api/admin/me", { token: await als("fremd@example.ch") }), env)).status).toBe(403);
    expect((await handle(anfrage("/api/admin/me", { token: await als("ehemalig@example.ch") }), env)).status).toBe(403);
    const r = await (await db()).prepare("SELECT actor, action FROM audit_log WHERE actor IN ('fremd@example.ch','ehemalig@example.ch')").all();
    expect(r.results.length).toBe(2);
  });
  it("Mitarbeiter sieht keinen Verbrauch, kein Protokoll, ändert keine Einstellungen", async () => {
    const env = await makeEnv();
    const t = await als("mitarbeiter@example.ch");
    expect((await handle(anfrage("/api/admin/me", { token: t }), env)).status).toBe(200);
    expect((await handle(anfrage("/api/admin/usage", { token: t }), env)).status).toBe(403);
    expect((await handle(anfrage("/api/admin/audit", { token: t }), env)).status).toBe(403);
    expect((await handle(anfrage("/api/admin/einstellungen/print_cost_rappen", { token: t, method: "PUT", body: { value: 20 } }), env)).status).toBe(403);
  });
  it("Administrator sieht Verbrauch, aber kein Protokoll und keine Systemeinstellungen", async () => {
    const env = await makeEnv();
    const t = await als("admin@example.ch");
    expect((await handle(anfrage("/api/admin/usage", { token: t }), env)).status).toBe(200);
    expect((await handle(anfrage("/api/admin/audit", { token: t }), env)).status).toBe(403);
    expect((await handle(anfrage("/api/admin/einstellungen/storage_limit_bytes", { token: t, method: "PUT", body: { value: 9_000_000_000 } }), env)).status).toBe(403);
  });
  it("Admin-Seite liefert HTML mit escaped Inhalten", async () => {
    const r = await handle(anfrage("/admin", { token: await als("inhaber@example.ch") }), await makeEnv());
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).toContain("inhaber@example.ch");
    expect(text).toContain("Fotospeicher");
    expect(r.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });
});

describe("Einstellungen (nur Eigentümer)", () => {
  it("prüft Werte, protokolliert Änderungen, lehnt Unbekanntes ab", async () => {
    const env = await makeEnv();
    const t = await als("inhaber@example.ch");
    const ok = await handle(anfrage("/api/admin/einstellungen/print_cost_rappen", { token: t, method: "PUT", body: { value: 18 } }), env);
    expect(ok.status).toBe(200);
    expect((await handle(anfrage("/api/admin/einstellungen/print_cost_rappen", { token: t, method: "PUT", body: { value: -1 } }), env)).status).toBe(400);
    expect((await handle(anfrage("/api/admin/einstellungen/storage_limit_bytes", { token: t, method: "PUT", body: { value: 50_000_000_000 } }), env)).status).toBe(400);
    expect((await handle(anfrage("/api/admin/einstellungen/geheim", { token: t, method: "PUT", body: { value: 1 } }), env)).status).toBe(404);
    const audit = (await (await handle(anfrage("/api/admin/audit", { token: t }), env)).json()) as { eintraege: { action: string; target: string; details: string }[] };
    const e = audit.eintraege.find((x) => x.action === "einstellung.geaendert" && x.target === "print_cost_rappen")!;
    expect(JSON.parse(e.details)).toEqual({ alt: 15, neu: 18 });
    // zurücksetzen
    await handle(anfrage("/api/admin/einstellungen/print_cost_rappen", { token: t, method: "PUT", body: { value: 15 } }), env);
  });
  it("lehnt schreibende Anfragen von fremder Herkunft ab (CSRF)", async () => {
    const r = await handle(anfrage("/api/admin/einstellungen/print_cost_rappen", { token: await als("inhaber@example.ch"), method: "PUT", body: { value: 20 }, origin: "https://boese.example" }), await makeEnv());
    expect(r.status).toBe(403);
  });
});

describe("Protokoll und Routen", () => {
  it("Protokolleinträge können nicht geändert oder gelöscht werden", async () => {
    const d = await db();
    await expect(d.prepare("UPDATE audit_log SET actor = 'x'").run()).rejects.toThrow(/unveraenderlich/);
    await expect(d.prepare("DELETE FROM audit_log").run()).rejects.toThrow(/unveraenderlich/);
  });
  it("unbekannte API-Adressen: 404; Gesundheitsprüfung: 200", async () => {
    const env = await makeEnv();
    expect((await handle(anfrage("/api/gibts-nicht"), env)).status).toBe(404);
    expect((await handle(anfrage("/admin/geheim"), env)).status).toBe(404);
    expect((await handle(anfrage("/api/health"), env)).status).toBe(200);
  });
});
