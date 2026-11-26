/**
 * Gemeinsamer Rahmen aller Admin-Seiten (serverseitig erzeugtes HTML, ohne JavaScript).
 * Formulare senden per POST, danach Weiterleitung zurück (303) mit kurzer Meldung (Code → fester Text, nie Text aus der Adresse).
 */
import type { AdminUser } from "../lib/auth";
import type { Permission } from "../lib/permissions";
import { brand } from "../../src/config/brand";
import { esc, withSecurityHeaders } from "../lib/http";

const ROLLE: Record<string, string> = { owner: "Eigentümer", admin: "Administrator", staff: "Mitarbeiter" };

const NAV: { href: string; text: string; recht: Permission }[] = [
  { href: "/admin", text: "Übersicht", recht: "admin:view" },
  { href: "/admin/buchungen", text: "Buchungen", recht: "bookings:read" },
  { href: "/admin/kalender", text: "Kalender", recht: "bookings:read" },
  { href: "/admin/kunden", text: "Kunden", recht: "bookings:read" },
  { href: "/admin/events", text: "Events", recht: "devices:manage" },
  { href: "/admin/geraete", text: "Geräte", recht: "devices:manage" },
  { href: "/admin/finanzen", text: "Finanzen", recht: "finance:read" },
  { href: "/admin/preise", text: "Preise", recht: "settings:write" },
  { href: "/admin/inhalte", text: "Inhalte", recht: "content:write" },
  { href: "/admin/einstellungen", text: "Einstellungen", recht: "settings:write" },
];

/** Feste Meldungen nach Aktionen (Adresse enthält nur den Code). */
export const MELDUNGEN: Record<string, string> = {
  gespeichert: "Gespeichert.",
  bestaetigt: "Buchung bestätigt.",
  abgelehnt: "Anfrage abgelehnt, die Tage sind wieder frei.",
  storniert: "Buchung storniert, die Tage sind wieder frei.",
  abgeschlossen: "Buchung abgeschlossen.",
  verschoben: "Termin geändert. Bitte die Positionen prüfen (Zusatztage werden nicht automatisch angepasst).",
  gesperrt: "Tage gesperrt.",
  freigegeben: "Sperre aufgehoben.",
  geloescht: "Gelöscht.",
  notiz: "Notiz gespeichert.",
  zahlung: "Zahlung festgehalten.",
  aktualisierung: "Die Webseite wird neu erzeugt. Das dauert etwa 1–2 Minuten.",
};

export function rahmen(u: AdminUser, titel: string, aktiv: string, inhalt: string, url?: URL): string {
  const ok = url?.searchParams.get("ok");
  const meldung = ok && MELDUNGEN[ok] ? `<p class="meldung ok" role="status">${esc(MELDUNGEN[ok])}</p>` : "";
  const nav = NAV.filter((n) => u.permissions.includes(n.recht))
    .map((n) => `<a href="${n.href}"${n.href === aktiv ? ' aria-current="page"' : ""}>${esc(n.text)}</a>`).join("");
  return `<!doctype html><html lang="de-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(titel)} | Administration ${esc(brand.name)}</title>
<style>${CSS}</style></head><body>
<header><div class="wrap kopf"><span class="logo">${esc(brand.name)}</span><span class="wer">Angemeldet: ${esc(u.email)} · ${esc(ROLLE[u.role])}${u.via === "dev" ? " · <strong>Entwicklungsmodus</strong>" : ""}</span></div>
<nav class="wrap nav" aria-label="Administration">${nav}</nav></header>
<main class="wrap"><h1>${esc(titel)}</h1>${meldung}${inhalt}
<footer>Zugriff geschützt durch Cloudflare Access · jede Änderung wird protokolliert</footer></main></body></html>`;
}

/** Weiterleitung nach einer Aktion (Post/Redirect/Get). */
export function zurueck(pfad: string, code: keyof typeof MELDUNGEN | null = "gespeichert"): Response {
  const ziel = code ? `${pfad}${pfad.includes("?") ? "&" : "?"}ok=${code}` : pfad;
  return withSecurityHeaders(new Response(null, { status: 303, headers: { Location: ziel } }));
}

/** Fehlerseite für Formulare: Text kommt immer aus dem Code, wird escaped. */
export function formFehler(u: AdminUser, text: string, zurueckZu: string, status = 400): Response {
  const body = rahmen(u, "Nicht gespeichert", "", `<p class="meldung fehler" role="alert">${esc(text)}</p><p><a href="${esc(zurueckZu)}">Zurück</a></p>`);
  return withSecurityHeaders(new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } }));
}

/** Formularfelder lesen. */
export async function formular(request: Request): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return m; // leerer oder kein Formular-Inhalt
  }
  for (const [k, v] of fd.entries()) if (typeof v === "string") m.set(k, v.trim());
  return m;
}

/** «12.50» oder «12,50» → 1250 Rappen; ungültig → null. */
export function rappenAus(text: string | undefined, erlaubeNegativ = false): number | null {
  if (text === undefined) return null;
  const t = text.replace(/['\s]/g, "").replace(",", ".");
  if (!(erlaubeNegativ ? /^-?\d{1,6}(\.\d{1,2})?$/ : /^\d{1,6}(\.\d{1,2})?$/).test(t)) return null;
  return Math.round(Number(t) * 100);
}

export const chfFeld = (rappen: number) => (rappen / 100).toFixed(2);
export const zeit = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("de-CH", { timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "short" }) : "–");

export const STATUS: Record<string, string> = { request: "Anfrage", confirmed: "bestätigt", completed: "abgeschlossen", cancelled: "storniert", declined: "abgelehnt" };

const CSS = `:root{--ivory:#F8F6F0;--ink:#222;--muted:#625E57;--line:#E4DCCD;--gold:#7A6440}
*{box-sizing:border-box}body{margin:0;background:var(--ivory);color:var(--ink);font:16px/1.55 "Segoe UI",system-ui,sans-serif}
a{color:inherit}header{background:#fff;border-bottom:1px solid var(--line)}.wrap{max-width:76rem;margin:0 auto;padding:0 max(1.25rem,env(safe-area-inset-left))}
.kopf{display:flex;justify-content:space-between;align-items:center;gap:1rem;min-height:4rem;flex-wrap:wrap}
.nav{display:flex;gap:.25rem 1.25rem;flex-wrap:wrap;padding-bottom:.75rem}.nav a{text-decoration:none;padding:.3rem 0;border-bottom:2px solid transparent;font-weight:600;font-size:.95rem}
.nav a[aria-current]{border-color:var(--ink)}.nav a:hover{border-color:var(--line)}
.logo{font:italic 500 1.8rem Georgia,serif}.wer{color:var(--muted);font-size:.9rem}
h1{font:500 2.2rem Georgia,serif;margin:2rem 0 .75rem}h2{font:500 1.5rem Georgia,serif;margin:2.25rem 0 .85rem}h3{font-size:1rem;margin:1.25rem 0 .5rem}
.karten{display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:1rem}
.karte{background:#fff;border:1px solid var(--line);padding:1.1rem 1.25rem}.karte b{display:block;font:500 1.8rem Georgia,serif}
.scroll{overflow-x:auto;background:#fff;border:1px solid var(--line)}table{border-collapse:collapse;width:100%;min-width:40rem;font-size:.92rem}
th,td{text-align:left;padding:.6rem .85rem;border-bottom:1px solid var(--line);vertical-align:top}th{background:#F4EEE3;font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.zahl{text-align:right;font-variant-numeric:tabular-nums}.klein{font-size:.82rem;color:var(--muted)}
.pill{font-size:.75rem;font-weight:600;padding:.1rem .5rem;border:1px solid;white-space:nowrap}.gruen{color:#2F5E3A}.gelb{color:#7A4E12}.rot{color:#8A1F1F}
.hinweis,.meldung{border-left:3px solid #7A4E12;background:#fff;padding:.8rem 1rem;margin:1rem 0}.meldung.ok{border-color:#2F5E3A}.meldung.fehler{border-color:#8A1F1F;color:#6E1818}
.balken{height:.6rem;background:var(--line);margin-top:.6rem}.balken i{display:block;height:100%;background:var(--gold)}
form.zeile,.aktion{display:inline-flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin:.15rem .3rem .15rem 0}
button,.knopf{font:inherit;font-weight:600;padding:.45rem .95rem;border:1px solid var(--ink);background:#fff;color:var(--ink);cursor:pointer;text-decoration:none;display:inline-block}
button.haupt{background:var(--ink);color:#fff}button.gefahr{border-color:#8A1F1F;color:#8A1F1F}
input,select,textarea{font:inherit;padding:.45rem .6rem;border:1px solid #CBBBA3;background:#fff;color:var(--ink);max-width:100%}
textarea{width:100%;min-height:5rem}label{display:block;font-size:.85rem;font-weight:600;margin-bottom:.2rem}
.felder{display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:.85rem 1rem;background:#fff;border:1px solid var(--line);padding:1rem 1.1rem;margin:.5rem 0 1rem}
.felder .breit{grid-column:1/-1}.felder input:not([type=checkbox]),.felder select{width:100%}.check{display:flex;gap:.5rem;align-items:center;font-weight:400}
.filter{display:flex;gap:.6rem;flex-wrap:wrap;align-items:end;margin-bottom:1rem}
.kal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px;background:var(--line);border:1px solid var(--line)}
.kal div{background:#fff;min-height:6rem;padding:.35rem;font-size:.8rem;overflow-wrap:anywhere}.kal .kopfz{min-height:auto;background:#F4EEE3;font-weight:600;text-align:center}
.kal .leer{background:#FAF7F1}.kal .tag{font-weight:600}.kal .heute{outline:2px solid var(--ink);outline-offset:-2px}
.kal .e{display:block;margin-top:.2rem;padding:.1rem .3rem;background:#EFE6D6}.kal .e.block{background:#F4D9D9}.kal .e.hold{background:#E6EEF4}.kal .e.req{background:#FBEFD5}
.verlauf li{margin:.25rem 0}footer{margin:3rem 0;color:var(--muted);font-size:.85rem}
@media (max-width:640px){h1{font-size:1.8rem}.kal div{min-height:4.5rem;font-size:.7rem;padding:.2rem}}`;
