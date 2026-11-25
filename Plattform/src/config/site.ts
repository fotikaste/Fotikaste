/** Navigation, Seitenregister und Crawler-Regeln. */

export interface PageEntry {
  path: string;
  title: string;
  /** false = Entwurf/Platzhalter: noindex und nicht in der Sitemap. */
  indexable: boolean;
}

export const mainNav = [
  { href: "/fotobox", label: "Unsere Fotobox" },
  { href: "/preise", label: "Angebote" },
  { href: "/galerie", label: "Galerie" },
  { href: "/verfuegbarkeit", label: "Verfügbarkeit" },
  { href: "/faq", label: "FAQ" },
  { href: "/kontakt", label: "Kontakt" },
] as const;

export const occasionNav = [
  { href: "/hochzeit", label: "Hochzeit" },
  { href: "/geburtstag", label: "Geburtstag" },
  { href: "/firmenanlass", label: "Firmenanlass" },
] as const;

export const regionNav = [
  { href: "/fotobox-thurgau", label: "Fotobox Thurgau" },
  { href: "/fotobox-ostschweiz", label: "Fotobox Ostschweiz" },
  { href: "/fotobox-zuerich", label: "Fotobox Zürich" },
] as const;

export const legalNav = [
  { href: "/impressum", label: "Impressum" },
  { href: "/datenschutz", label: "Datenschutz" },
  { href: "/agb", label: "AGB" },
] as const;

/**
 * Bereiche, die nie öffentlich sind. robots.txt ist KEIN Schutz – diese Bereiche
 * werden zusätzlich durch echte Anmeldung geschützt (ab Phase 2).
 */
// Schrägstrich am Ende, wo der Präfix sonst öffentliche Seiten träfe: "/f" würde in robots.txt auch /fotobox und /faq sperren!
export const privatePaths = ["/admin", "/api/", "/konto", "/event/", "/f/", "/buchen"] as const;

/**
 * KI-Suche erlaubt (Entscheid D7), KI-Training gesperrt. Liste vor Go-Live gegen die
 * aktuelle Dokumentation der Anbieter prüfen (siehe docs/GEO.md).
 */
export const crawlerPolicy = {
  search: ["Googlebot", "Bingbot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "Applebot", "DuckDuckBot"],
  training: ["GPTBot", "Google-Extended", "ClaudeBot", "anthropic-ai", "CCBot", "Applebot-Extended", "Bytespider", "meta-externalagent"],
  allowTraining: false,
} as const;
