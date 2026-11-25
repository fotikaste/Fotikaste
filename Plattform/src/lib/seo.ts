import { brand } from "../config/brand";
import { crawlerPolicy, privatePaths, type PageEntry } from "../config/site";

export function absoluteUrl(path: string): string {
  const p = path === "/" ? "/" : path.replace(/\/+$/, "");
  return new URL(p, brand.siteUrl).href;
}

export function pageTitle(title?: string): string {
  return title ? `${title} | ${brand.name}` : `${brand.name} – Fotobox mieten in der Ostschweiz und in Zürich`;
}

/** robots.txt: Such-Crawler erlaubt, Trainings-Crawler gesperrt (wenn allowTraining=false), private Pfade gesperrt. */
export function buildRobotsTxt(): string {
  const lines: string[] = ["# robots.txt ist kein Zugriffsschutz – private Bereiche verlangen eine Anmeldung.", ""];
  for (const bot of crawlerPolicy.search) {
    lines.push(`User-agent: ${bot}`, "Allow: /", ...privatePaths.map((p) => `Disallow: ${p}`), "");
  }
  if (!crawlerPolicy.allowTraining) {
    lines.push("# KI-Training ist nicht erlaubt (Entscheid D7).");
    for (const bot of crawlerPolicy.training) lines.push(`User-agent: ${bot}`, "Disallow: /", "");
  }
  lines.push("User-agent: *", "Allow: /", ...privatePaths.map((p) => `Disallow: ${p}`), "");
  lines.push(`Sitemap: ${absoluteUrl("/sitemap.xml")}`, "");
  return lines.join("\n");
}

export function buildSitemapXml(pages: PageEntry[], lastmod: string): string {
  const urls = pages
    .filter((p) => p.indexable)
    .map((p) => `  <url><loc>${absoluteUrl(p.path)}</loc><lastmod>${lastmod}</lastmod></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

type Json = Record<string, unknown>;

/** Organisation + Webseite: nur überprüfbare Angaben aus brand.ts, nichts Erfundenes. */
export function organizationJsonLd(): Json {
  const org: Json = {
    "@type": "Organization",
    "@id": absoluteUrl("/#organisation"),
    name: brand.name,
    url: absoluteUrl("/"),
    description: brand.description,
    logo: absoluteUrl("/logo.svg"),
    areaServed: brand.areaServed.map((name) => ({ "@type": "AdministrativeArea", name })),
  };
  if (brand.contact.email) org.email = brand.contact.email;
  if (brand.contact.phone) org.telephone = brand.contact.phone;
  if (brand.sameAs.length) org.sameAs = brand.sameAs;
  return org;
}

export function websiteJsonLd(): Json {
  return { "@type": "WebSite", "@id": absoluteUrl("/#website"), url: absoluteUrl("/"), name: brand.name, inLanguage: brand.locale, publisher: { "@id": absoluteUrl("/#organisation") } };
}

export function serviceJsonLd(): Json {
  return {
    "@type": "Service",
    "@id": absoluteUrl("/#fotobox-vermietung"),
    serviceType: "Fotobox-Vermietung",
    name: "Fotobox mieten",
    provider: { "@id": absoluteUrl("/#organisation") },
    areaServed: brand.areaServed.map((name) => ({ "@type": "AdministrativeArea", name })),
    // Offer mit Preis erst, wenn echte Preise feststehen und sichtbar auf der Seite stehen.
  };
}

export function faqJsonLd(items: { question: string; answer: string }[]): Json {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.question, acceptedAnswer: { "@type": "Answer", text: i.answer } })),
  };
}

export function breadcrumbJsonLd(trail: { name: string; path: string }[]): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: absoluteUrl(t.path) })),
  };
}

export function graph(...nodes: Json[]): string {
  // "<" escapen, damit Inhalte das <script>-Element nicht beenden können.
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes }).replace(/</g, "\\u003c");
}
