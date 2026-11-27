// Wiederherstellungsprobe: Datenbank exportieren, in eine LEERE Datenbank einspielen und vergleichen.
// Lokal: node tools/sicherung-test.mjs            (prüft die lokale Entwicklungsdatenbank)
// Mit Datei: node tools/sicherung-test.mjs sicherung-2027-01-04.sql   (prüft eine Sicherung aus GitHub, entpackt)
// Die echte Datenbank wird dabei NIE verändert: eingespielt wird in einen eigenen, temporären Ordner.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" };
const wrangler = (...a) => execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", ...a], { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
const ziel = mkdtempSync(join(tmpdir(), "fotikaste-wiederherstellung-"));
const datei = process.argv[2] ?? join(ziel, "export.sql");

try {
  if (!process.argv[2]) wrangler("d1", "export", "DB", "--local", "--output", datei);
  if (!existsSync(datei) || readFileSync(datei, "utf8").length < 100) throw new Error("Export leer");
  wrangler("d1", "execute", "DB", "--local", "--persist-to", ziel, "--file", datei);
  const tabellen = JSON.parse(wrangler("d1", "execute", "DB", "--local", "--persist-to", ziel, "--json", "--command",
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name"))[0].results.map((r) => r.name);
  const zaehle = (persist) => JSON.parse(wrangler("d1", "execute", "DB", "--local", ...(persist ? ["--persist-to", persist] : []), "--json", "--command",
    tabellen.map((t) => `SELECT '${t}' AS t, COUNT(*) AS n FROM "${t}"`).join("; "))).map((x) => x.results[0]);
  const neu = zaehle(ziel);
  let ok = true;
  if (!process.argv[2]) {
    const alt = Object.fromEntries(zaehle(null).map((r) => [r.t, r.n]));
    for (const r of neu) if (alt[r.t] !== r.n) { ok = false; console.error(`✕ ${r.t}: Original ${alt[r.t]}, wiederhergestellt ${r.n}`); }
  }
  for (const pflicht of ["bookings", "customers", "settings", "packages", "audit_log", "postal_codes"]) if (!tabellen.includes(pflicht)) { ok = false; console.error(`✕ Tabelle ${pflicht} fehlt`); }
  console.log(neu.map((r) => `${r.t}: ${r.n}`).join(" · "));
  console.log(ok ? `✓ Wiederherstellung erfolgreich (${tabellen.length} Tabellen)` : "✕ Wiederherstellung unvollständig");
  process.exitCode = ok ? 0 : 1;
} finally {
  rmSync(ziel, { recursive: true, force: true });
}
