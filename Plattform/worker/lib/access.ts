/**
 * Prüfung der Cloudflare-Access-Anmeldung (Admin).
 * Cloudflare Access setzt nach erfolgreichem Login (Google + 2FA) den Header «Cf-Access-Jwt-Assertion»
 * mit einem signierten Ticket (JWT, RS256). Wir prüfen Signatur, Aussteller, Zielgruppe und Ablauf selbst –
 * damit nützt ein Umgehen der Vorschaltung nichts. Ohne gültige Konfiguration: Zugriff verweigert («fail closed»).
 * Nur mit WebCrypto, ohne Zusatzpaket.
 */
import type { Env } from "../env";

export interface Identity {
  email: string;
  via: "access" | "dev";
}

interface Jwk extends JsonWebKey { kid?: string }

const jwksCache = new Map<string, { keys: Jwk[]; geholt: number }>();
const JWKS_TTL_MS = 10 * 60 * 1000;
const SPIELRAUM_S = 60;

function b64urlBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(s: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
}

async function schluessel(env: Env, team: string): Promise<Jwk[]> {
  // Nur ausserhalb der Produktion dürfen Testschlüssel direkt übergeben werden.
  if (env.ENVIRONMENT !== "production" && env.ACCESS_JWKS) return (JSON.parse(env.ACCESS_JWKS) as { keys: Jwk[] }).keys;
  const c = jwksCache.get(team);
  if (c && Date.now() - c.geholt < JWKS_TTL_MS) return c.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS nicht abrufbar: ${res.status}`);
  const keys = ((await res.json()) as { keys: Jwk[] }).keys;
  jwksCache.set(team, { keys, geholt: Date.now() });
  return keys;
}

/** Prüft ein Access-JWT. Gibt die E-Mail zurück oder null. */
export async function pruefeJwt(token: string, env: Env, jetzt = Math.floor(Date.now() / 1000)): Promise<string | null> {
  const team = env.ACCESS_TEAM_DOMAIN?.trim();
  const aud = env.ACCESS_AUD?.trim();
  if (!team || !aud) return null; // nicht konfiguriert → niemand kommt hinein
  const teile = token.split(".");
  if (teile.length !== 3) return null;
  const [h, p, s] = teile as [string, string, string];
  let header: Record<string, unknown>, claims: Record<string, unknown>;
  try {
    header = b64urlJson(h);
    claims = b64urlJson(p);
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
  const jwk = (await schluessel(env, team)).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const gueltig = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!gueltig) return null;
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(aud)) return null;
  if (claims.iss !== `https://${team}`) return null;
  if (typeof claims.exp !== "number" || claims.exp < jetzt - SPIELRAUM_S) return null;
  if (typeof claims.nbf === "number" && claims.nbf > jetzt + SPIELRAUM_S) return null;
  if (typeof claims.email !== "string" || !claims.email.includes("@")) return null;
  return claims.email.toLowerCase();
}

const LOKAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Ermittelt die angemeldete Person.
 * Entwicklungs-Abkürzung nur, wenn ALLE Bedingungen stimmen: ENVIRONMENT=development, Aufruf über localhost,
 * DEV_ADMIN_EMAIL gesetzt. In Produktion ist ENVIRONMENT in wrangler.jsonc fest «production».
 */
export async function identitaet(request: Request, env: Env): Promise<Identity | null> {
  const host = new URL(request.url).hostname;
  if (env.ENVIRONMENT === "development" && LOKAL.has(host) && env.DEV_ADMIN_EMAIL) {
    return { email: env.DEV_ADMIN_EMAIL.toLowerCase(), via: "dev" };
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  const email = await pruefeJwt(token, env).catch(() => null);
  return email ? { email, via: "access" } : null;
}
