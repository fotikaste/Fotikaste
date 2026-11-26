/** Vor den Browsertests: Anfragebegrenzung der lokalen Entwicklungsdatenbank zurücksetzen und PLZ-Testdaten sicherstellen
 *  (sonst schlagen wiederholte Testläufe innerhalb einer Stunde wegen 429 fehl). */
import { execSync } from "node:child_process";

export default function vorbereitung() {
  const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" };
  execSync("npx wrangler d1 migrations apply DB --local", { stdio: "pipe", env });
  execSync("npx wrangler d1 execute DB --local --file tools/dev-plz.sql", { stdio: "pipe", env });
  execSync('npx wrangler d1 execute DB --local --command "DELETE FROM rate_limits"', { stdio: "pipe", env });
}
