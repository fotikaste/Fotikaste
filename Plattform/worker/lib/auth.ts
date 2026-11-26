import type { Env } from "../env";
import { identitaet } from "./access";
import { darf, rechteVon, type Permission, type Role } from "./permissions";
import { protokolliere } from "./audit";
import { fehler } from "./http";

export interface AdminUser {
  email: string;
  role: Role;
  via: "access" | "dev";
  permissions: readonly Permission[];
}

/**
 * Prüft Anmeldung (Access), Konto (admin_users, aktiv) und Recht.
 * Gibt den Benutzer zurück oder eine fertige Fehlerantwort (401/403).
 */
export async function verlangeRecht(request: Request, env: Env, permission: Permission): Promise<AdminUser | Response> {
  const id = await identitaet(request, env);
  if (!id) return fehler(401, "nicht_angemeldet", "Anmeldung über Cloudflare Access erforderlich.");
  const row = await env.DB.prepare("SELECT email, role, active FROM admin_users WHERE email = ?1").bind(id.email).first<{ email: string; role: Role; active: number }>();
  if (!row || row.active !== 1) {
    await protokolliere(env, id.email, "zugriff.verweigert", new URL(request.url).pathname, { grund: row ? "inaktiv" : "unbekannt" });
    return fehler(403, "kein_zugang", "Dieses Konto hat keinen Zugang zur Administration.");
  }
  if (!darf(row.role, permission)) {
    await protokolliere(env, id.email, "zugriff.verweigert", new URL(request.url).pathname, { grund: "fehlendes_recht", recht: permission });
    return fehler(403, "kein_recht", "Für diese Aktion fehlt die Berechtigung.");
  }
  return { email: row.email, role: row.role, via: id.via, permissions: rechteVon(row.role) };
}
