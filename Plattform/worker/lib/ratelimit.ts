import type { Env } from "../env";

/** Fester Zeitraum: max. `max` Anfragen pro `fensterSek` je Schlüssel (z. B. «magic:<email>» oder «ip:<adresse>»). */
export async function begrenze(env: Env, key: string, max: number, fensterSek: number, jetztMs = Date.now()): Promise<{ erlaubt: boolean; anzahl: number }> {
  const fenster = Math.floor(jetztMs / 1000 / fensterSek) * fensterSek;
  const r = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1 RETURNING count`,
  ).bind(key, fenster).first<{ count: number }>();
  const anzahl = r?.count ?? max + 1;
  return { erlaubt: anzahl <= max, anzahl };
}

/** Alte Zeitfenster löschen (Cron). */
export async function raeumeAuf(env: Env, aelterAlsSek = 86_400, jetztMs = Date.now()) {
  await env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?1").bind(Math.floor(jetztMs / 1000) - aelterAlsSek).run();
}
