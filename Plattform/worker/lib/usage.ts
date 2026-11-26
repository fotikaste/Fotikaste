/**
 * Kostenkontrolle (docs/COST_CONTROL.md): Zähler, Gratisgrenzen, Warnstufen 50/75/90 %, Sperre ab 90 %,
 * und die serverseitige Reservierung von Fotospeicher (gegen gleichzeitige Uploads).
 */
import type { Env } from "../env";

export type Quelle = "app" | "cloudflare" | "estimate";
export type Zeitraum = "tag" | "monat";

interface Kontingent {
  bezeichnung: string;
  gratis: number;
  zeitraum: Zeitraum;
  /** Wo der Wert herkommt: von der App selbst gezählt oder nur bei Cloudflare messbar. */
  quelle: Quelle;
  /** Kostet bei Überschreitung Geld (true) oder sperrt Cloudflare nur (false)? */
  kostenpflichtig: boolean;
}

/** Gratisgrenzen laut Cloudflare/Resend, geprüft 2026-11-25 (docs/COSTS.md). */
export const KONTINGENTE: Record<string, Kontingent> = {
  r2_class_a: { bezeichnung: "R2 Schreibvorgänge (Klasse A)", gratis: 1_000_000, zeitraum: "monat", quelle: "app", kostenpflichtig: true },
  r2_class_b: { bezeichnung: "R2 Lesevorgänge (Klasse B)", gratis: 10_000_000, zeitraum: "monat", quelle: "app", kostenpflichtig: true },
  emails_tag: { bezeichnung: "E-Mails pro Tag (Resend)", gratis: 100, zeitraum: "tag", quelle: "app", kostenpflichtig: false },
  emails_monat: { bezeichnung: "E-Mails pro Monat (Resend)", gratis: 3_000, zeitraum: "monat", quelle: "app", kostenpflichtig: false },
  worker_requests: { bezeichnung: "Worker-Aufrufe pro Tag", gratis: 100_000, zeitraum: "tag", quelle: "cloudflare", kostenpflichtig: false },
  d1_rows_read: { bezeichnung: "D1 gelesene Zeilen pro Tag", gratis: 5_000_000, zeitraum: "tag", quelle: "cloudflare", kostenpflichtig: false },
  d1_rows_written: { bezeichnung: "D1 geschriebene Zeilen pro Tag", gratis: 100_000, zeitraum: "tag", quelle: "cloudflare", kostenpflichtig: false },
};

export function periode(zeitraum: Zeitraum, jetzt = new Date()): string {
  const iso = jetzt.toISOString();
  return zeitraum === "tag" ? iso.slice(0, 10) : iso.slice(0, 7);
}

async function einstellungZahl(env: Env, key: string, standard: number): Promise<number> {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(key).first<{ value: string }>();
  const n = r ? Number(JSON.parse(r.value)) : NaN;
  return Number.isFinite(n) ? n : standard;
}

async function warnstufen(env: Env): Promise<{ warn: number[]; sperre: number }> {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = 'usage_warn_percent'").first<{ value: string }>();
  const warn = r ? (JSON.parse(r.value) as number[]) : [50, 75, 90];
  return { warn, sperre: await einstellungZahl(env, "usage_block_percent", 90) };
}

/** Zähler erhöhen (nur von der App selbst gemessene Werte). */
export async function zaehle(env: Env, metric: keyof typeof KONTINGENTE, anzahl = 1, jetzt = new Date()) {
  const k = KONTINGENTE[metric]!;
  await env.DB.prepare(
    `INSERT INTO usage_counters (period, metric, value, source) VALUES (?1, ?2, ?3, 'app')
     ON CONFLICT (period, metric) DO UPDATE SET value = value + ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  ).bind(periode(k.zeitraum, jetzt), metric, anzahl).run();
}

export type Stufe = "ok" | "warnung" | "kritisch";
export interface Messwert {
  metric: string;
  bezeichnung: string;
  wert: number | null; // null = hier nicht messbar
  grenze: number;
  prozent: number | null;
  stufe: Stufe;
  warnschwelle: number | null; // höchste überschrittene Warnschwelle
  gesperrt: boolean;
  quelle: Quelle;
  kostenpflichtig: boolean;
}

function bewerte(prozent: number | null, warn: number[], sperre: number) {
  if (prozent === null) return { stufe: "ok" as Stufe, warnschwelle: null, gesperrt: false };
  const erreicht = warn.filter((w) => prozent >= w);
  const warnschwelle = erreicht.length ? Math.max(...erreicht) : null;
  const gesperrt = prozent >= sperre;
  return { stufe: (gesperrt ? "kritisch" : warnschwelle !== null ? "warnung" : "ok") as Stufe, warnschwelle, gesperrt };
}

/** Übersicht aller Kontingente + Fotospeicher. Nicht messbare Werte werden als null ausgewiesen, nie geschätzt. */
export async function verbrauch(env: Env, jetzt = new Date()): Promise<{ messwerte: Messwert[]; speicher: Speicherstand }> {
  const { warn, sperre } = await warnstufen(env);
  const perioden = [periode("tag", jetzt), periode("monat", jetzt)];
  const rows = await env.DB.prepare("SELECT period, metric, value, source FROM usage_counters WHERE period IN (?1, ?2)")
    .bind(...perioden).all<{ period: string; metric: string; value: number; source: Quelle }>();
  const messwerte: Messwert[] = Object.entries(KONTINGENTE).map(([metric, k]) => {
    const row = rows.results.find((r) => r.metric === metric && r.period === periode(k.zeitraum, jetzt));
    const wert = row ? row.value : k.quelle === "app" ? 0 : null;
    const prozent = wert === null ? null : Math.round((wert / k.gratis) * 1000) / 10;
    return { metric, bezeichnung: k.bezeichnung, wert, grenze: k.gratis, prozent, ...bewerte(prozent, warn, sperre), quelle: row?.source ?? k.quelle, kostenpflichtig: k.kostenpflichtig };
  });
  return { messwerte, speicher: await speicherstand(env) };
}

/** true, wenn ein Kontingent die Sperrschwelle erreicht hat → kostenrelevanten Vorgang ablehnen. */
export async function istGesperrt(env: Env, metric: keyof typeof KONTINGENTE, jetzt = new Date()): Promise<boolean> {
  const m = (await verbrauch(env, jetzt)).messwerte.find((x) => x.metric === metric);
  return m?.gesperrt ?? true; // im Zweifel sperren
}

// ---------------------------------------------------------------------------
// Fotospeicher
// ---------------------------------------------------------------------------
export interface Speicherstand {
  belegt: number;
  reserviert: number;
  grenze: number;
  sperrgrenze: number;
  prozent: number;
  stufe: Stufe;
  warnschwelle: number | null;
  gesperrt: boolean;
}

export async function speicherstand(env: Env): Promise<Speicherstand> {
  const b = await env.DB.prepare("SELECT used_bytes, reserved_bytes FROM storage_budget WHERE id = 1").first<{ used_bytes: number; reserved_bytes: number }>();
  const grenze = await einstellungZahl(env, "storage_limit_bytes", 8_000_000_000);
  const { warn, sperre } = await warnstufen(env);
  const belegt = b?.used_bytes ?? 0, reserviert = b?.reserved_bytes ?? 0;
  const prozent = Math.round(((belegt + reserviert) / grenze) * 1000) / 10;
  return { belegt, reserviert, grenze, sperrgrenze: Math.floor((grenze * sperre) / 100), prozent, ...bewerte(prozent, warn, sperre) };
}

const SPERRGRENZE_SQL = `(SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'storage_limit_bytes') * (SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'usage_block_percent') / 100`;

/**
 * Speicher für einen Upload reservieren. Atomar (ein D1-Batch = eine Transaktion, D1 schreibt nacheinander):
 * Zwei gleichzeitige Uploads können die Sperrgrenze nicht gemeinsam überschreiten.
 */
export async function reserviere(env: Env, id: string, bytes: number, gueltigSek = 600, jetzt = new Date()): Promise<boolean> {
  if (!Number.isInteger(bytes) || bytes <= 0) throw new Error("ungültige Grösse");
  const now = jetzt.toISOString();
  const ablauf = new Date(jetzt.getTime() + gueltigSek * 1000).toISOString();
  const res = await env.DB.batch([
    // abgelaufene Reservierungen freigeben
    env.DB.prepare("UPDATE storage_budget SET reserved_bytes = reserved_bytes - (SELECT COALESCE(SUM(bytes), 0) FROM storage_reservations WHERE expires_at < ?1) WHERE id = 1").bind(now),
    env.DB.prepare("DELETE FROM storage_reservations WHERE expires_at < ?1").bind(now),
    // nur einfügen, wenn danach noch unter der Sperrgrenze
    env.DB.prepare(`INSERT INTO storage_reservations (id, bytes, expires_at) SELECT ?1, ?2, ?3
      WHERE (SELECT used_bytes + reserved_bytes FROM storage_budget WHERE id = 1) + ?2 <= ${SPERRGRENZE_SQL}`).bind(id, bytes, ablauf),
    env.DB.prepare("UPDATE storage_budget SET reserved_bytes = reserved_bytes + ?2 WHERE id = 1 AND EXISTS (SELECT 1 FROM storage_reservations WHERE id = ?1)").bind(id, bytes),
  ]);
  return res[2]!.meta.changes === 1;
}

/**
 * Upload abschliessen: tatsächliche Grösse (aus R2 gelesen) darf die Reservierung nicht überschreiten.
 * Sonst false → Aufrufer löscht das Objekt und gibt die Reservierung frei.
 */
export async function bestaetige(env: Env, id: string, tatsaechlich: number, jetzt = new Date()): Promise<boolean> {
  const now = jetzt.toISOString();
  const res = await env.DB.batch([
    env.DB.prepare(`UPDATE storage_budget SET used_bytes = used_bytes + ?2,
        reserved_bytes = reserved_bytes - (SELECT bytes FROM storage_reservations WHERE id = ?1)
      WHERE id = 1 AND EXISTS (SELECT 1 FROM storage_reservations WHERE id = ?1 AND bytes >= ?2 AND expires_at >= ?3)`).bind(id, tatsaechlich, now),
    env.DB.prepare("DELETE FROM storage_reservations WHERE id = ?1 AND bytes >= ?2 AND expires_at >= ?3").bind(id, tatsaechlich, now),
  ]);
  return res[0]!.meta.changes === 1;
}

/** Reservierung ohne Upload freigeben. */
export async function gibFrei(env: Env, id: string) {
  await env.DB.batch([
    env.DB.prepare("UPDATE storage_budget SET reserved_bytes = reserved_bytes - (SELECT bytes FROM storage_reservations WHERE id = ?1) WHERE id = 1 AND EXISTS (SELECT 1 FROM storage_reservations WHERE id = ?1)").bind(id),
    env.DB.prepare("DELETE FROM storage_reservations WHERE id = ?1").bind(id),
  ]);
}

/** Gelöschte Fotos: belegten Speicher verringern. */
export async function speicherFrei(env: Env, bytes: number) {
  await env.DB.prepare("UPDATE storage_budget SET used_bytes = MAX(used_bytes - ?1, 0) WHERE id = 1").bind(bytes).run();
}
