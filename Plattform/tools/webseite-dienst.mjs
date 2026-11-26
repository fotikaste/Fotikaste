// Lokaler Dienst für «Webseite aktualisieren» (nur Entwicklung).
// Lauscht nur auf 127.0.0.1:8790. Auf POST /neu-bauen mit dem richtigen Schlüssel: Inhalte aus der lokalen D1 lesen
// und die statischen Seiten neu erzeugen (astro build). Wrangler dev liefert danach automatisch die neuen Seiten aus.
// Start: node tools/webseite-dienst.mjs   (Schlüssel aus .dev.vars: REBUILD_SECRET)
// Online übernimmt diese Aufgabe ab Phase 7 GitHub Actions (gratis).
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";

const vars = Object.fromEntries(readFileSync(".dev.vars", "utf8").split(/\r?\n/).filter((z) => /^[A-Z_]+=/.test(z)).map((z) => [z.slice(0, z.indexOf("=")), z.slice(z.indexOf("=") + 1)]));
const SCHLUESSEL = vars.REBUILD_SECRET;
if (!SCHLUESSEL || SCHLUESSEL.length < 32) {
  console.error("REBUILD_SECRET fehlt oder ist zu kurz (mind. 32 Zeichen) in .dev.vars.");
  process.exit(1);
}
let laeuft = false;
let nochmal = false;
let letzter = { status: "noch nie", zeit: null };

function baue() {
  if (laeuft) { nochmal = true; return; }
  laeuft = true;
  const start = Date.now();
  console.log("Erzeuge Webseite …");
  const p = spawn(process.execPath, ["tools/inhalte-export.mjs"], { stdio: "inherit" });
  p.on("exit", (code) => {
    if (code !== 0) return fertig(false, start);
    const b = spawn(process.execPath, ["node_modules/astro/bin/astro.mjs", "build"], { stdio: ["ignore", "ignore", "inherit"] });
    b.on("exit", (c) => {
      if (c !== 0) return fertig(false, start);
      spawn(process.execPath, ["tools/inhalte-export.mjs", "--zeitstempel"], { stdio: "inherit" }).on("exit", () => fertig(true, start));
    });
  });
}
function fertig(ok, start) {
  laeuft = false;
  letzter = { status: ok ? "ok" : "fehler", zeit: new Date().toISOString() };
  console.log(ok ? `Webseite erzeugt (${Math.round((Date.now() - start) / 1000)} s).` : "Fehler beim Erzeugen der Webseite.");
  if (nochmal) { nochmal = false; baue(); }
}

const gleich = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
createServer((req, res) => {
  const auth = req.headers.authorization ?? "";
  if (!gleich(auth, `Bearer ${SCHLUESSEL}`)) { res.writeHead(401).end(); return; }
  if (req.method === "POST" && req.url === "/neu-bauen") { baue(); res.writeHead(202, { "Content-Type": "application/json" }).end(JSON.stringify({ gestartet: true })); return; }
  if (req.method === "GET" && req.url === "/status") { res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ laeuft, ...letzter })); return; }
  res.writeHead(404).end();
}).listen(8790, "127.0.0.1", () => console.log("Webseiten-Dienst bereit auf http://127.0.0.1:8790"));
