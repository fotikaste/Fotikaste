import type { AdminUser } from "../lib/auth";
import type { Messwert, Speicherstand } from "../lib/usage";
import { esc } from "../lib/http";

const ROLLE: Record<string, string> = { owner: "Eigentümer", admin: "Administrator", staff: "Mitarbeiter" };
const QUELLE: Record<string, string> = { app: "gemessen (App)", cloudflare: "gemessen (Cloudflare)", estimate: "geschätzt" };

const zahl = (n: number) => new Intl.NumberFormat("de-CH").format(n);
const gb = (b: number) => `${(b / 1e9).toLocaleString("de-CH", { maximumFractionDigits: 2 })} GB`;

function stufeHtml(stufe: string, gesperrt: boolean, warn: number | null) {
  if (gesperrt) return `<span class="pill rot">gesperrt</span>`;
  if (stufe === "warnung") return `<span class="pill gelb">Warnung ${warn} %</span>`;
  return `<span class="pill gruen">ok</span>`;
}

/** Admin-Startseite (Phase 2): Anmeldung, Rolle, Verbrauchsübersicht. Alle Werte serverseitig eingesetzt und escaped. */
export function adminSeite(user: AdminUser, messwerte: Messwert[], speicher: Speicherstand): string {
  const warnungen = [
    ...(speicher.stufe !== "ok" ? [`Fotospeicher bei ${speicher.prozent} % der App-Grenze`] : []),
    ...messwerte.filter((m) => m.stufe !== "ok").map((m) => `${m.bezeichnung}: ${m.prozent} %`),
  ];
  const zeilen = messwerte.map((m) => `<tr>
      <td>${esc(m.bezeichnung)}${m.kostenpflichtig ? ' <span class="klein">(kostenpflichtig über Gratisgrenze)</span>' : ""}</td>
      <td class="zahl">${m.wert === null ? '<span class="klein">nicht verfügbar (lokal)</span>' : zahl(m.wert)}</td>
      <td class="zahl">${zahl(m.grenze)}</td>
      <td class="zahl">${m.prozent === null ? "–" : `${m.prozent} %`}</td>
      <td>${m.wert === null ? '<span class="klein">–</span>' : stufeHtml(m.stufe, m.gesperrt, m.warnschwelle)}</td>
      <td class="klein">${esc(m.wert === null ? "nicht verfügbar" : QUELLE[m.quelle])}</td></tr>`).join("");

  return `<!doctype html><html lang="de-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Administration | Fotikaste</title>
<style>
:root{--ivory:#F8F6F0;--ink:#222;--muted:#625E57;--line:#E4DCCD;--gold:#7A6440}
*{box-sizing:border-box}body{margin:0;background:var(--ivory);color:var(--ink);font:16px/1.55 "Segoe UI",system-ui,sans-serif}
header{background:#fff;border-bottom:1px solid var(--line)}.wrap{max-width:72rem;margin:0 auto;padding:0 max(1.25rem,env(safe-area-inset-left))}
header .wrap{display:flex;justify-content:space-between;align-items:center;gap:1rem;min-height:4.5rem;flex-wrap:wrap}
.logo{font:italic 500 1.8rem Georgia,serif}.wer{color:var(--muted);font-size:.9rem}
h1{font:500 2.4rem Georgia,serif;margin:2.5rem 0 .5rem}h2{font:500 1.6rem Georgia,serif;margin:2.5rem 0 1rem}
.karten{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:1rem}
.karte{background:#fff;border:1px solid var(--line);padding:1.25rem}.karte b{display:block;font:500 1.8rem Georgia,serif}
.scroll{overflow-x:auto;background:#fff;border:1px solid var(--line)}table{border-collapse:collapse;width:100%;min-width:44rem;font-size:.92rem}
th,td{text-align:left;padding:.7rem .9rem;border-bottom:1px solid var(--line)}th{background:#F4EEE3;font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.zahl{text-align:right;font-variant-numeric:tabular-nums}.klein{font-size:.8rem;color:var(--muted)}
.pill{font-size:.75rem;font-weight:600;padding:.15rem .55rem;border:1px solid}.gruen{color:#2F5E3A}.gelb{color:#7A4E12}.rot{color:#8A1F1F}
.hinweis{border-left:3px solid #7A4E12;background:#fff;padding:.9rem 1rem;margin-top:1rem}
.balken{height:.6rem;background:var(--line);margin-top:.6rem}.balken i{display:block;height:100%;background:var(--gold)}
footer{margin:3rem 0;color:var(--muted);font-size:.85rem}
</style></head><body>
<header><div class="wrap"><span class="logo">Fotikaste</span><span class="wer">Angemeldet: ${esc(user.email)} · ${esc(ROLLE[user.role])}${user.via === "dev" ? " · <strong>Entwicklungsmodus</strong>" : ""}</span></div></header>
<main class="wrap">
<h1>Administration</h1>
<p class="klein">Phase 2: Grundgerüst. Buchungen, Kalender, Kunden und Inhalte folgen in Phase 3–4.</p>
${warnungen.length ? `<div class="hinweis"><strong>Warnungen:</strong> ${warnungen.map(esc).join(" · ")}</div>` : ""}
<h2>Fotospeicher</h2>
<div class="karten">
  <div class="karte"><span class="klein">Belegt</span><b>${gb(speicher.belegt)}</b><span class="klein">reserviert: ${gb(speicher.reserviert)}</span></div>
  <div class="karte"><span class="klein">App-Grenze</span><b>${gb(speicher.grenze)}</b><span class="klein">Sperre ab ${gb(speicher.sperrgrenze)}</span></div>
  <div class="karte"><span class="klein">Auslastung</span><b>${speicher.prozent} %</b>${stufeHtml(speicher.stufe, speicher.gesperrt, speicher.warnschwelle)}
    <div class="balken" role="img" aria-label="Auslastung ${speicher.prozent} Prozent"><i style="width:${Math.min(100, speicher.prozent)}%"></i></div></div>
  <div class="karte"><span class="klein">Geschätzte Kosten diesen Monat</span><b>CHF 0.00</b><span class="klein">solange alle Werte unter den Gratisgrenzen liegen</span></div>
</div>
<h2>Gratiskontingente</h2>
<div class="scroll" tabindex="0" role="region" aria-label="Verbrauch, seitlich scrollbar"><table>
<thead><tr><th>Kontingent</th><th class="zahl">Verbrauch</th><th class="zahl">Gratis</th><th class="zahl">Anteil</th><th>Status</th><th>Herkunft</th></tr></thead>
<tbody>${zeilen}</tbody></table></div>
<p class="klein">Werte «gemessen (Cloudflare)» werden ab der Veröffentlichung über die Cloudflare-Auswertung ergänzt. Fehlende Werte werden nie geschätzt angezeigt.</p>
<footer>Zugriff geschützt durch Cloudflare Access · jede Aktion wird protokolliert</footer>
</main></body></html>`;
}
