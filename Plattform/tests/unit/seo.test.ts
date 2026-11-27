import { describe, expect, it } from "vitest";
import { buildRobotsTxt, buildSitemapXml, absoluteUrl, faqJsonLd, graph, organizationJsonLd } from "../../src/lib/seo";
import { pages } from "../../src/config/pages";
import { crawlerPolicy, privatePaths } from "../../src/config/site";
import { brand } from "../../src/config/brand";

describe("robots.txt", () => {
  const robots = buildRobotsTxt();
  it("erlaubt Such-Crawler und KI-Suche", () => {
    for (const bot of ["Googlebot", "Bingbot", "OAI-SearchBot", "PerplexityBot"]) expect(robots).toContain(`User-agent: ${bot}\nAllow: /`);
  });
  it("sperrt KI-Training komplett (D7)", () => {
    expect(crawlerPolicy.allowTraining).toBe(false);
    for (const bot of crawlerPolicy.training) expect(robots).toContain(`User-agent: ${bot}\nDisallow: /\n`);
  });
  it("sperrt private Bereiche für alle", () => {
    for (const p of privatePaths) expect(robots).toContain(`Disallow: ${p}`);
  });
  it("verweist auf die Sitemap", () => {
    expect(robots).toContain(`Sitemap: ${brand.siteUrl}/sitemap.xml`);
  });
});

describe("robots.txt sperrt keine öffentliche Seite", () => {
  // Einfacher Präfix-Abgleich wie bei Google: Disallow-Regel trifft, wenn der Pfad damit beginnt.
  const disallows = buildRobotsTxt().split("\n").filter((l) => l.startsWith("Disallow: ") && l !== "Disallow: /").map((l) => l.slice(10));
  for (const p of pages.filter((x) => x.indexable)) {
    it(`${p.path} ist für Such-Crawler erreichbar`, () => {
      expect(disallows.filter((d) => p.path.startsWith(d))).toEqual([]);
    });
  }
});

describe("Sitemap", () => {
  const xml = buildSitemapXml(pages, "2026-11-25");
  it("enthält nur indexierbare Seiten", () => {
    for (const p of pages) {
      const loc = `<loc>${absoluteUrl(p.path)}</loc>`;
      if (p.indexable) expect(xml).toContain(loc);
      else expect(xml).not.toContain(loc);
    }
  });
  it("enthält keine privaten Bereiche", () => {
    for (const p of privatePaths) {
      expect(xml).not.toContain(`${brand.siteUrl}${p}<`);
      expect(xml).not.toContain(`${brand.siteUrl}${p}/`);
    }
  });
});

describe("Strukturierte Daten", () => {
  it("erfindet keine Kontaktdaten, Bewertungen oder Preise", () => {
    const org = organizationJsonLd() as Record<string, unknown>;
    // Kontaktdaten nur aus brand.ts (vom Inhaber angegeben), sonst gar nicht
    if (brand.contact.phone) expect(org.telephone).toBe(brand.contact.phone);
    else expect(org).not.toHaveProperty("telephone");
    if (brand.contact.email) expect(org.email).toBe(brand.contact.email);
    else expect(org).not.toHaveProperty("email");
    expect(org).not.toHaveProperty("aggregateRating");
    expect(JSON.stringify(org)).not.toContain("price");
  });
  it("escaped < damit kein Script-Ausbruch möglich ist", () => {
    const s = graph(faqJsonLd([{ question: "</script><script>alert(1)</script>", answer: "x" }]));
    expect(s).not.toContain("</script>");
  });
  it("absolute URLs ohne Schrägstrich am Ende (ausser Startseite)", () => {
    expect(absoluteUrl("/fotobox/")).toBe(`${brand.siteUrl}/fotobox`);
    expect(absoluteUrl("/")).toBe(`${brand.siteUrl}/`);
  });
});
