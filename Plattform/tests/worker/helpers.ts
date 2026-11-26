import { getPlatformProxy } from "wrangler";
import type { Env } from "../../worker/env";

export const TEAM = "fotikaste-test.cloudflareaccess.com";
export const AUD = "test-aud-123";

let proxy: Awaited<ReturnType<typeof getPlatformProxy>> | undefined;

/** Echte lokale D1 (Miniflare) aus der Testdatenbank. */
export async function db(): Promise<D1Database> {
  proxy ??= await getPlatformProxy({ configPath: "wrangler.jsonc", persist: { path: ".wrangler/test-state/v3" } });
  return (proxy.env as unknown as { DB: D1Database }).DB;
}

export async function schliesse() {
  await proxy?.dispose();
  proxy = undefined;
}

// ---- Testschlüssel für Access-JWTs (RS256) ----
let schluessel: { privat: CryptoKey; jwks: string } | undefined;
async function keys() {
  if (!schluessel) {
    const kp = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const pub = await crypto.subtle.exportKey("jwk", kp.publicKey);
    schluessel = { privat: kp.privateKey, jwks: JSON.stringify({ keys: [{ ...pub, kid: "test-kid", alg: "RS256" }] }) };
  }
  return schluessel;
}

export async function makeEnv(over: Partial<Env> = {}): Promise<Env> {
  const assets = { fetch: async () => new Response("statische Seite", { status: 200 }) } as unknown as Fetcher;
  return { DB: await db(), ASSETS: assets, ENVIRONMENT: "test", ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ACCESS_JWKS: (await keys()).jwks, ...over };
}

const b64url = (data: string | Uint8Array) =>
  Buffer.from(typeof data === "string" ? new TextEncoder().encode(data) : data).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export async function jwt(claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}): Promise<string> {
  const jetzt = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: "RS256", kid: "test-kid", typ: "JWT", ...header }));
  const p = b64url(JSON.stringify({ aud: [AUD], iss: `https://${TEAM}`, email: "inhaber@example.ch", iat: jetzt, nbf: jetzt, exp: jetzt + 3600, ...claims }));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", (await keys()).privat, new TextEncoder().encode(`${h}.${p}`)));
  return `${h}.${p}.${b64url(sig)}`;
}

export function anfrage(pfad: string, opts: { token?: string; method?: string; body?: unknown; origin?: string; host?: string } = {}): Request {
  const base = `https://${opts.host ?? "fotikaste.example"}`;
  const headers: Record<string, string> = {};
  if (opts.token) headers["Cf-Access-Jwt-Assertion"] = opts.token;
  if (opts.method && opts.method !== "GET") headers["Origin"] = opts.origin ?? base;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  return new Request(base + pfad, { method: opts.method ?? "GET", headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
}
