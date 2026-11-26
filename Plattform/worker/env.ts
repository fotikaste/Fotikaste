/** Bindings und Variablen des Workers (siehe wrangler.jsonc, lokal .dev.vars). */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ENVIRONMENT: string; // "production" | "development" | "test"
  ACCESS_TEAM_DOMAIN: string; // z. B. "fotikaste.cloudflareaccess.com"
  ACCESS_AUD: string; // «Application Audience (AUD) Tag» der Access-Anwendung
  ACCESS_JWKS?: string; // nur Tests/Entwicklung: eigene Prüfschlüssel
  DEV_ADMIN_EMAIL?: string; // nur lokale Entwicklung
  TURNSTILE_SECRET_KEY?: string;
}
