import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { pages } from "../../src/config/pages";

for (const page of pages) {
  test(`${page.path}: lädt, SEO-Grundlagen, kein horizontales Scrollen`, async ({ page: p }) => {
    const res = await p.goto(page.path);
    expect(res?.status()).toBe(200);
    await expect(p.locator("h1")).toHaveCount(1);
    expect(await p.title()).toContain("Fotikaste");
    const desc = await p.locator('meta[name="description"]').getAttribute("content");
    expect(desc && desc.length).toBeGreaterThan(50);
    const canonical = await p.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toMatch(page.path === "/" ? /\/$/ : new RegExp(`${page.path}$`));
    const robots = await p.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toContain(page.indexable ? "index" : "noindex");
    for (const s of await p.locator('script[type="application/ld+json"]').allTextContents()) expect(() => JSON.parse(s)).not.toThrow();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("Barrierefreiheit Startseite und Preise (axe, WCAG 2.2 AA): keine schweren Verstösse", async ({ page }) => {
  for (const path of ["/", "/preise", "/faq"]) {
    await page.goto(path);
    await page.waitForTimeout(1200); // Einblend-Animation abwarten
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const schwer = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(schwer.map((v) => `${path}: ${v.id} (${v.nodes.length})`)).toEqual([]);
  }
});

test("Unbekannte Adresse liefert 404", async ({ page }) => {
  const res = await page.goto("/gibt-es-nicht");
  expect(res?.status()).toBe(404);
  await expect(page.locator("h1")).toContainText("gibt es nicht");
});

test("Private Bereiche sind nicht als Seiten vorhanden", async ({ request }) => {
  for (const p of ["/admin", "/konto", "/api/device/v1/config"]) {
    const res = await request.get(p);
    expect(res.status()).toBe(404);
  }
});

test("Sicherheits-Header gesetzt", async ({ request }) => {
  const h = (await request.get("/")).headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["strict-transport-security"]).toContain("max-age");
});

test("Startseite: keine erfundenen Bewertungen, Preise als Platzhalter", async ({ page }) => {
  await page.goto("/");
  const html = await page.content();
  expect(html).not.toMatch(/aggregateRating|ratingValue/);
  await expect(page.getByText("Preis folgt").first()).toBeVisible();
});

test("Bildschirmfotos für den Phasenbericht", async ({ page }, info) => {
  for (const path of ["/", "/preise", "/fotobox"]) {
    await page.goto(path);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `test-results/ansicht-${info.project.name}${path === "/" ? "-start" : path.replace("/", "-")}.png`, fullPage: true });
  }
});
