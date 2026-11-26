// Liest die Inhalte der Webseite (Pakete, Preise, FAQ, technische Angaben) aus der D1-Datenbank
// und schreibt src/data/inhalte.json. Danach erzeugt «astro build» die statischen Seiten damit.
// Aufruf: node tools/inhalte-export.mjs [--remote] [--optional] [--zeitstempel]
//   --remote    echte Cloudflare-Datenbank (ab Phase 7, braucht Anmeldung bei Cloudflare)
//   --optional  wenn die Datenbank nicht erreichbar ist: bestehende inhalte.json behalten (nur Warnung)
//   --zeitstempel  NACH erfolgreichem Bauen: «Webseite erzeugt» auf den Zeitpunkt des letzten Exports setzen
//                  (so meldet der Admin nie «aktuell», wenn das Bauen fehlgeschlagen ist oder danach etwas geändert wurde)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ABFRAGEN, formeInhalte } from "../worker/lib/inhalte.ts";
import { brand } from "../src/config/brand.ts";

const remote = process.argv.includes("--remote");
const optional = process.argv.includes("--optional");
const ZIEL = "src/data/inhalte.json";
const STAND = ".wrangler/inhalte-stand.txt"; // Zeitpunkt des letzten Exports (nicht in Git)
const wrangler = (sql) => {
  // Wrangler direkt mit Node starten (ohne Shell → SQL-Text wird nicht zerlegt)
  const out = execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", remote ? "--remote" : "--local", "--json", "--command", sql], {
    encoding: "utf8", env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out);
};

if (process.argv.includes("--zeitstempel")) {
  try {
    const stand = readFileSync(STAND, "utf8").trim();
    if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(stand)) throw new Error("ungültiger Stand");
    wrangler(`UPDATE settings SET value = json_quote('${stand}'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key = 'site_built_at'`);
    console.log(`Webseite erzeugt mit Inhalten vom ${stand}.`);
  } catch (e) {
    console.warn(`Warnung: Zeitpunkt «Webseite erzeugt» nicht gesetzt (${String(e?.message ?? e).split("\n")[0]}).`);
  }
  process.exit(0);
}

try {
  const stand = new Date().toISOString();
  const schluessel = Object.keys(ABFRAGEN);
  const ergebnisse = wrangler(schluessel.map((k) => ABFRAGEN[k]).join("; "));
  const zeilen = Object.fromEntries(schluessel.map((k, i) => [k, ergebnisse[i].results]));
  const inhalte = formeInhalte(zeilen, brand.name);
  if (inhalte.packages.length === 0) throw new Error("keine Pakete in der Datenbank");
  const neu = JSON.stringify(inhalte, null, 2) + "\n";
  let alt = "";
  try { alt = readFileSync(ZIEL, "utf8").replace(/\r\n/g, "\n"); } catch {}
  if (alt !== neu) writeFileSync(ZIEL, neu);
  mkdirSync(".wrangler", { recursive: true });
  writeFileSync(STAND, stand);
  console.log(`Inhalte aus der Datenbank übernommen (${inhalte.packages.length} Pakete, ${inhalte.faqs.length} Fragen)${alt === neu ? ", unverändert" : ""}.`);
} catch (e) {
  const text = String(e?.stderr || e?.message || e).split("\n").slice(0, 3).join(" ");
  if (!optional) {
    console.error(`Inhalte konnten nicht gelesen werden: ${text}`);
    process.exit(1);
  }
  console.warn(`Warnung: Datenbank nicht erreichbar – bestehende ${ZIEL} wird verwendet. (${text})`);
}
