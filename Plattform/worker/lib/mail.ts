/**
 * E-Mails nur über die Outbox (Tabelle `outbox`): erst speichern, dann versenden.
 * `dedupe_key` UNIQUE verhindert doppelte Mails, auch bei Wiederholungen.
 * Testmodus (Standard): Mails werden nie an Kunden verschickt – höchstens an MAIL_TEST_RECIPIENT, sonst nur zurückgehalten.
 */
import type { Env } from "../env";
import { istGesperrt, periode, zaehle } from "./usage";

export interface Mail {
  dedupeKey: string;
  to: string;
  subject: string;
  text: string;
}

export const testModus = (env: Env) => env.MAIL_TEST_MODE !== "false";

/** Anweisung für einen batch(): Mail einreihen, optional nur wenn `bedingung` (SQL, z. B. EXISTS …) zutrifft. */
export function mailEinreihen(env: Env, m: Mail, bedingung = "1", ...bedingungParams: unknown[]): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO outbox (dedupe_key, to_email, subject, body_text, test_mode) SELECT ?1, ?2, ?3, ?4, ?5 WHERE ${bedingung}`,
  ).bind(m.dedupeKey, m.to, m.subject, m.text, testModus(env) ? 1 : 0, ...bedingungParams);
}

/** Ausstehende Mails verarbeiten (nach Buchung und später per Cron). Gibt die Anzahl verarbeiteter Mails zurück. */
export async function versendeAusstehende(env: Env, max = 5, fetcher: typeof fetch = fetch, jetzt = new Date()): Promise<number> {
  const r = await env.DB.prepare("SELECT id, to_email, subject, body_text, test_mode FROM outbox WHERE status = 'pending' ORDER BY id LIMIT ?1")
    .bind(max).all<{ id: number; to_email: string; subject: string; body_text: string; test_mode: number }>();
  const tag = periode("tag", jetzt);
  const limitRow = await env.DB.prepare("SELECT value FROM settings WHERE key = 'mail_daily_limit'").first<{ value: string }>();
  const tagesLimit = limitRow ? Number(JSON.parse(limitRow.value)) : 80;
  let n = 0;
  for (const m of r.results) {
    // trim(): Secrets aus der Kommandozeile können unsichtbare Zeilenumbrüche enthalten (Lehre 2026-11-27: Resend 422).
    const ziel = (m.test_mode ? env.MAIL_TEST_RECIPIENT : m.to_email)?.trim();
    if (!ziel || !env.RESEND_API_KEY || !env.MAIL_FROM) {
      await env.DB.prepare("UPDATE outbox SET status = 'held', last_error = ?2 WHERE id = ?1").bind(m.id, m.test_mode ? "Testmodus: nicht versendet" : "Mailversand nicht eingerichtet").run();
      n++;
      continue;
    }
    const heute = await env.DB.prepare("SELECT COUNT(*) AS n FROM outbox WHERE status = 'sent' AND sent_day = ?1").bind(tag).first<{ n: number }>();
    if ((heute?.n ?? 0) >= tagesLimit || (await istGesperrt(env, "emails_tag", jetzt)) || (await istGesperrt(env, "emails_monat", jetzt))) break; // morgen weiter
    try {
      const res = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        // Schlüssel enthält das Ziel: Ändert sich der Empfänger, lehnt Resend den neuen Versuch nicht als «gleicher Schlüssel, andere Daten» ab.
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`, "Content-Type": "application/json", "Idempotency-Key": `outbox-${m.id}-${ziel}` },
        body: JSON.stringify({ from: env.MAIL_FROM.trim(), to: [ziel], subject: m.test_mode ? `[TEST an ${m.to_email}] ${m.subject}` : m.subject, text: m.body_text }),
      });
      // Grund von Resend mitspeichern (enthält keine Geheimnisse), damit Fehler verständlich sind.
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 150)}`);
      await env.DB.prepare("UPDATE outbox SET status = 'sent', sent_day = ?2, attempts = attempts + 1, last_error = NULL WHERE id = ?1").bind(m.id, tag).run();
      await zaehle(env, "emails_tag", 1, jetzt);
      await zaehle(env, "emails_monat", 1, jetzt);
    } catch (e) {
      await env.DB.prepare("UPDATE outbox SET attempts = attempts + 1, last_error = ?2, status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END WHERE id = ?1")
        .bind(m.id, String(e).slice(0, 200)).run();
    }
    n++;
  }
  // Anmeldelinks nach dem Versand aus dem Mail-Ausgang entfernen (der Link ist ein Zugang). Zurückgehaltene Testmails bleiben lesbar (nur lokal).
  await env.DB.prepare("UPDATE outbox SET body_text = '(Anmeldelink nach Versand entfernt)' WHERE dedupe_key LIKE 'magic:%' AND status IN ('sent', 'failed') AND body_text != '(Anmeldelink nach Versand entfernt)'").run();
  return n;
}
