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
