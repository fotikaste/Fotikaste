// Lighthouse-Messung der lokal gebauten Seite (Labormessung, keine echten Nutzerdaten).
// Voraussetzung: `npx wrangler dev --port 8788` läuft. Aufruf: npm run lighthouse
import lighthouse from "lighthouse";
import { chromium } from "@playwright/test";

const urls = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/preise", "/fotobox", "/faq"];
// Chromium über Playwright starten (chrome-launcher scheitert unter Windows teils mit «spawn UNKNOWN»).
const port = 9333;
const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
const chrome = { port, kill: () => browser.close() };
try {
  for (const formFactor of ["mobile", "desktop"]) {
    for (const path of urls) {
      const config = formFactor === "desktop"
        ? { extends: "lighthouse:default", settings: { formFactor: "desktop", screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttlingMethod: "simulate" } }
        : undefined;
      const r = await lighthouse(`http://127.0.0.1:8788${path}`, { port: chrome.port, output: "json", logLevel: "error" }, config);
      const c = r.lhr.categories, a = r.lhr.audits;
      const s = (k) => Math.round(c[k].score * 100);
      console.log(`${formFactor.padEnd(7)} ${path.padEnd(10)} Perf ${s("performance")} · A11y ${s("accessibility")} · Best ${s("best-practices")} · SEO ${s("seo")} · LCP ${a["largest-contentful-paint"].displayValue} · CLS ${a["cumulative-layout-shift"].displayValue} · TBT ${a["total-blocking-time"].displayValue}`);
    }
  }
} finally {
  await chrome.kill();
}
