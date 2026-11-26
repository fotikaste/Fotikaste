/** Kalendertage als 'YYYY-MM-DD' in Europe/Zurich. Rechnen über UTC-Mitternacht (keine Sommerzeit-Fehler). */
const TAG_MS = 86_400_000;
const MUSTER = /^\d{4}-\d{2}-\d{2}$/;

export function istTag(s: unknown): s is string {
  if (typeof s !== "string" || !MUSTER.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Heutiges Datum in der Schweiz. */
export function heuteZurich(jetzt = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(jetzt);
}

export function plusTage(tag: string, n: number): string {
  return new Date(Date.parse(`${tag}T00:00:00Z`) + n * TAG_MS).toISOString().slice(0, 10);
}

/** Anzahl Tage von a bis b (b − a). */
export function tageZwischen(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / TAG_MS);
}

/** Alle Tage von a bis b, beide eingeschlossen. */
export function tageVonBis(a: string, b: string): string[] {
  const n = tageZwischen(a, b);
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => plusTage(a, i));
}
