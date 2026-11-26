/** Anzeige im Browser (Schweizer Schreibweise). Berechnet wird nichts – Beträge kommen immer vom Server. */
export const chf = (rappen: number) => `CHF ${(rappen / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;
export const datumCh = (tag: string) => `${tag.slice(8, 10)}.${tag.slice(5, 7)}.${tag.slice(0, 4)}`;
export const plusTage = (tag: string, n: number) => new Date(Date.parse(`${tag}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const heuteZurich = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const STATUS: Record<string, string> = { request: "Anfrage – wird geprüft", confirmed: "Bestätigt", completed: "Abgeschlossen", cancelled: "Storniert", declined: "Abgelehnt" };
export const ZAHLUNG: Record<string, string> = { full: "Gesamtbetrag", deposit: "Anzahlung", balance: "Restbetrag", security_deposit: "Kaution" };

/** Turnstile-Widget (nur wenn ein öffentlicher Site-Key beim Build gesetzt ist). */
export function turnstileToken(form: HTMLElement): string | undefined {
  return (form.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value || undefined;
}

export async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { text?: string } }> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({}) as T) };
}
