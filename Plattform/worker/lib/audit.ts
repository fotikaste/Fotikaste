import type { Env } from "../env";

/** Eintrag ins unveränderliche Protokoll. Fehler beim Protokollieren dürfen die Aktion nicht stillschweigend erlauben. */
export async function protokolliere(env: Env, actor: string, action: string, target?: string | null, details?: Record<string, unknown>) {
  await env.DB.prepare("INSERT INTO audit_log (actor, action, target, details) VALUES (?1, ?2, ?3, ?4)")
    .bind(actor, action, target ?? null, details ? JSON.stringify(details) : null)
    .run();
}
