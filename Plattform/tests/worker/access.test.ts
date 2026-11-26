import { afterAll, describe, expect, it } from "vitest";
import { identitaet, pruefeJwt } from "../../worker/lib/access";
import { AUD, TEAM, anfrage, jwt, makeEnv, schliesse } from "./helpers";

afterAll(schliesse);

describe("Access-JWT-Prüfung", () => {
  it("akzeptiert ein gültiges Ticket", async () => {
    expect(await pruefeJwt(await jwt(), await makeEnv())).toBe("inhaber@example.ch");
  });
  it("lehnt falsche Zielgruppe, falschen Aussteller und Ablauf ab", async () => {
    const env = await makeEnv();
    expect(await pruefeJwt(await jwt({ aud: ["andere-app"] }), env)).toBeNull();
    expect(await pruefeJwt(await jwt({ iss: "https://boese.cloudflareaccess.com" }), env)).toBeNull();
    expect(await pruefeJwt(await jwt({ exp: Math.floor(Date.now() / 1000) - 3600 }), env)).toBeNull();
    expect(await pruefeJwt(await jwt({ nbf: Math.floor(Date.now() / 1000) + 3600 }), env)).toBeNull();
    expect(await pruefeJwt(await jwt({ email: undefined }), env)).toBeNull();
  });
  it("lehnt manipulierte Tickets ab (Signatur, alg none, fremder Schlüssel)", async () => {
    const env = await makeEnv();
    const t = await jwt();
    const [h, , s] = t.split(".");
    const gefaelscht = Buffer.from(JSON.stringify({ aud: [AUD], iss: `https://${TEAM}`, email: "angreifer@example.ch", exp: 9999999999 })).toString("base64url");
    expect(await pruefeJwt(`${h}.${gefaelscht}.${s}`, env)).toBeNull();
    expect(await pruefeJwt(await jwt({}, { alg: "none" }), env)).toBeNull();
    expect(await pruefeJwt(await jwt({}, { kid: "unbekannt" }), env)).toBeNull();
    expect(await pruefeJwt("kein.jwt", env)).toBeNull();
  });
  it("verweigert alles, wenn Access nicht konfiguriert ist (fail closed)", async () => {
    expect(await pruefeJwt(await jwt(), await makeEnv({ ACCESS_AUD: "" }))).toBeNull();
    expect(await pruefeJwt(await jwt(), await makeEnv({ ACCESS_TEAM_DOMAIN: "" }))).toBeNull();
  });
  it("nimmt in Produktion keine mitgelieferten Testschlüssel an", async () => {
    // ACCESS_JWKS wird ignoriert → echte Cloudflare-Schlüssel nötig → Abruf scheitert/passt nicht → abgelehnt
    const env = await makeEnv({ ENVIRONMENT: "production", ACCESS_TEAM_DOMAIN: "127.0.0.1:1" });
    expect(await pruefeJwt(await jwt({ iss: "https://127.0.0.1:1" }), env).catch(() => null)).toBeNull();
  });
});

describe("Entwicklungs-Abkürzung", () => {
  it("wirkt nur mit ENVIRONMENT=development und Aufruf über localhost", async () => {
    const dev = await makeEnv({ ENVIRONMENT: "development", DEV_ADMIN_EMAIL: "inhaber@example.ch" });
    expect(await identitaet(anfrage("/admin", { host: "127.0.0.1:8788" }), dev)).toEqual({ email: "inhaber@example.ch", via: "dev" });
    expect(await identitaet(anfrage("/admin", { host: "fotikaste.example" }), dev)).toBeNull();
    const prod = await makeEnv({ ENVIRONMENT: "production", DEV_ADMIN_EMAIL: "inhaber@example.ch" });
    expect(await identitaet(anfrage("/admin", { host: "localhost" }), prod)).toBeNull();
  });
});
