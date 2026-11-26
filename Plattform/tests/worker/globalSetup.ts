/**
 * Vor allen Worker-Tests: eigene, frische lokale D1-Datenbank (getrennt von der Entwicklungsdatenbank),
 * Migrationen anwenden, Testkonten anlegen.
 */
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

export const TEST_STATE = ".wrangler/test-state";

export default function setup() {
  rmSync(TEST_STATE, { recursive: true, force: true }); // nur der eigene Testordner
  const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" };
  execSync(`npx wrangler d1 migrations apply DB --local --persist-to ${TEST_STATE}`, { stdio: "pipe", env });
  const sql = [
    "INSERT INTO admin_users (email, role) VALUES ('inhaber@example.ch', 'owner'), ('admin@example.ch', 'admin'), ('mitarbeiter@example.ch', 'staff')",
    "INSERT INTO admin_users (email, role, active) VALUES ('ehemalig@example.ch', 'admin', 0)",
  ].join("; ");
  execSync(`npx wrangler d1 execute DB --local --persist-to ${TEST_STATE} --command "${sql}"`, { stdio: "pipe", env });
}
