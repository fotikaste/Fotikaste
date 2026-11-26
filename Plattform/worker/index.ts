/**
 * Fotikaste-Worker. Läuft nur für /api/* und /admin (siehe run_worker_first in wrangler.jsonc).
 * Alle anderen Adressen liefert Cloudflare direkt als statische Dateien aus (kostenlos).
 */
import type { Env } from "./env";
import { verlangeRecht } from "./lib/auth";
import { fehler, html, json, sameOrigin, withSecurityHeaders } from "./lib/http";
import { protokolliere } from "./lib/audit";
import { verbrauch } from "./lib/usage";
import { adminSeite } from "./admin/seite";
import { EINSTELLUNGEN } from "./admin/einstellungen";

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pfad = url.pathname.replace(/\/+$/, "") || "/";

  if (!sameOrigin(request)) return fehler(403, "herkunft", "Anfrage von fremder Herkunft abgelehnt.");

  if (pfad === "/api/health" && request.method === "GET") return json({ ok: true });

  if (pfad === "/admin" && request.method === "GET") {
    const u = await verlangeRecht(request, env, "admin:view");
    if (u instanceof Response) return u;
    const { messwerte, speicher } = await verbrauch(env);
    // Ohne Recht «usage:read» (Mitarbeiter) keine Verbrauchszahlen anzeigen
    return html(u.permissions.includes("usage:read") ? adminSeite(u, messwerte, speicher) : adminSeite(u, [], { ...speicher, belegt: 0, reserviert: 0 }));
  }

  if (pfad === "/api/admin/me" && request.method === "GET") {
    const u = await verlangeRecht(request, env, "admin:view");
    if (u instanceof Response) return u;
    return json({ email: u.email, role: u.role, permissions: u.permissions, via: u.via });
  }

  if (pfad === "/api/admin/usage" && request.method === "GET") {
    const u = await verlangeRecht(request, env, "usage:read");
    if (u instanceof Response) return u;
    return json(await verbrauch(env));
  }

  if (pfad === "/api/admin/audit" && request.method === "GET") {
    const u = await verlangeRecht(request, env, "audit:read");
    if (u instanceof Response) return u;
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const r = await env.DB.prepare("SELECT id, at, actor, action, target, details FROM audit_log ORDER BY id DESC LIMIT ?1").bind(limit).all();
    return json({ eintraege: r.results });
  }

  const einstellung = pfad.match(/^\/api\/admin\/einstellungen\/([a-z_]+)$/);
  if (einstellung && request.method === "PUT") {
    const u = await verlangeRecht(request, env, "settings:write");
    if (u instanceof Response) return u;
    const key = einstellung[1]!;
    const pruefer = EINSTELLUNGEN[key];
    if (!pruefer) return fehler(404, "unbekannt", "Diese Einstellung gibt es nicht.");
    let body: { value?: unknown };
    try {
      body = await request.json();
    } catch {
      return fehler(400, "json", "Ungültige Anfrage.");
    }
    if (!pruefer(body.value)) return fehler(400, "wert", "Der Wert liegt ausserhalb des erlaubten Bereichs.");
    const alt = await env.DB.prepare("SELECT value FROM settings WHERE key = ?1").bind(key).first<{ value: string }>();
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
      .bind(key, JSON.stringify(body.value)).run();
    await protokolliere(env, u.email, "einstellung.geaendert", key, { alt: alt ? JSON.parse(alt.value) : null, neu: body.value });
    return json({ key, value: body.value });
  }

  if (pfad.startsWith("/api/") || pfad.startsWith("/admin")) return fehler(404, "nicht_gefunden", "Diese Adresse gibt es nicht.");
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (e) {
      console.error("Unerwarteter Fehler", e);
      return withSecurityHeaders(fehler(500, "intern", "Interner Fehler. Bitte später erneut versuchen."));
    }
  },
} satisfies ExportedHandler<Env>;
