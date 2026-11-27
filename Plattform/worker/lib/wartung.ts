/** Tägliche Wartung (Cron): Fotos abgelaufener Galerien löschen, liegengebliebene Uploads entfernen, Zähler aufräumen, Mails nachsenden. */
import type { Env } from "../env";
import { heuteZurich } from "./datum";
import { loescheFotos } from "./fotos";
import { versendeAusstehende } from "./mail";
import { raeumeAuf } from "./ratelimit";

export async function wartung(env: Env, jetzt = new Date()): Promise<{ abgelaufen: number; liegengeblieben: number }> {
  const heute = heuteZurich(jetzt);
  // 1. Galerie abgelaufen oder Event archiviert → Fotos löschen (in Paketen, Rest am nächsten Tag)
  const abgelaufen = await loescheFotos(env, "event_id IN (SELECT id FROM events WHERE retention_until < ?1 OR status = 'archived')", [heute], "system", "Aufbewahrungsfrist abgelaufen");
  // 2. Uploads, die seit 7 Tagen nicht abgeschlossen wurden
  const grenze = new Date(jetzt.getTime() - 7 * 86_400_000).toISOString();
  const liegengeblieben = await loescheFotos(env, "status = 'pending' AND created_at < ?1", [grenze], "system", "Upload nicht abgeschlossen");
  await raeumeAuf(env, 86_400, jetzt.getTime());
  // 3. Datensparsamkeit: abgelaufene Anmeldelinks und Sitzungen, alte E-Mails (Inhalt enthält Personendaten)
  const tag = (n: number) => new Date(jetzt.getTime() - n * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM magic_links WHERE expires_at < ?1").bind(tag(1)),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?1 OR (revoked_at IS NOT NULL AND revoked_at < ?2)").bind(jetzt.toISOString(), tag(7)),
    env.DB.prepare("DELETE FROM outbox WHERE created_at < ?1 AND status != 'pending'").bind(tag(180)),
  ]);
  await versendeAusstehende(env, 20);
  return { abgelaufen, liegengeblieben };
}
