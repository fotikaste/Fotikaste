/** Bindings und Variablen des Workers (siehe wrangler.jsonc, lokal .dev.vars). */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  PHOTOS: R2Bucket; // privater Fotospeicher (Phase 5)
  ENVIRONMENT: string; // "production" | "development" | "test"
  ACCESS_TEAM_DOMAIN: string; // z. B. "fotikaste.cloudflareaccess.com"
  ACCESS_AUD: string; // «Application Audience (AUD) Tag» der Access-Anwendung
  ACCESS_JWKS?: string; // nur Tests/Entwicklung: eigene Prüfschlüssel
  DEV_ADMIN_EMAIL?: string; // nur lokale Entwicklung
  TURNSTILE_SECRET_KEY?: string;
  // E-Mail (Phase 3). Ohne MAIL_TEST_MODE="false" geht nie eine Mail an Kunden.
  MAIL_TEST_MODE?: string;
  MAIL_TEST_RECIPIENT?: string;
  MAIL_FROM?: string;
  RESEND_API_KEY?: string;
  // «Webseite aktualisieren» (Phase 4): Adresse des Dienstes, der die statischen Seiten neu erzeugt, und gemeinsamer Schlüssel.
  REBUILD_HOOK_URL?: string;
  REBUILD_SECRET?: string;
}
