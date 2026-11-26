/**
 * Cloudflare Turnstile (gratis): prüft serverseitig, ob ein Formular von einem Menschen kommt.
 * Wird ab Phase 3 bei Buchung und Magic-Link-Anfrage verwendet. Bei Fehlern: ablehnen («fail closed»).
 */
export async function pruefeTurnstile(token: string | null, secret: string | undefined, ip?: string | null, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!token || !secret) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const res = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

const LOKAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Turnstile für öffentliche Formulare. Ohne Geheimschlüssel nur in Tests bzw. lokaler Entwicklung (localhost) übersprungen;
 * in Produktion ohne Schlüssel immer abgelehnt.
 */
export async function menschGeprueft(request: Request, env: { ENVIRONMENT: string; TURNSTILE_SECRET_KEY?: string }, token: unknown): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) {
    if (env.ENVIRONMENT === "test") return true;
    return env.ENVIRONMENT === "development" && LOKAL.has(new URL(request.url).hostname);
  }
  return pruefeTurnstile(typeof token === "string" ? token : null, env.TURNSTILE_SECRET_KEY, request.headers.get("CF-Connecting-IP"));
}
