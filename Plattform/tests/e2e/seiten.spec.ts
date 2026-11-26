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

test("Noch nicht gebaute private Bereiche liefern 404 (Admin: siehe admin.spec.ts)", async ({ request }) => {
  for (const p of ["/konto", "/api/device/v1/config", "/admin/gibts-nicht"]) {
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

test("Startseite: keine erfundenen Bewertungen, festgelegte Preise sichtbar", async ({ page }) => {
  await page.goto("/");
  const html = await page.content();
  expect(html).not.toMatch(/aggregateRating|ratingValue/);
  for (const preis of ["CHF 290.00", "CHF 450.00", "CHF 590.00"]) await expect(page.getByText(preis).first()).toBeVisible();
});

test("Preisseite: Preise in strukturierten Daten stimmen mit sichtbaren Preisen überein", async ({ page }) => {
  await page.goto("/preise");
  const ld = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((s) => JSON.parse(s));
  const offers = ld.flatMap((g) => g["@graph"]).filter((n) => n["@type"] === "OfferCatalog").flatMap((c) => c.itemListElement);
  expect(offers.map((o: { price: string }) => o.price)).toEqual(["290.00", "450.00", "590.00"]);
  await expect(page.getByText("Option «stornierbar»")).toBeVisible();
  await expect(page.getByText("CHF 68.00").first()).toBeVisible();
});

test("Bildschirmfotos für den Phasenbericht", async ({ page }, info) => {
  for (const path of ["/", "/preise", "/fotobox"]) {
    await page.goto(path);
    // Langsam scrollen, damit «lazy» geladene Bilder auch im Ganzseiten-Bildschirmfoto erscheinen
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `test-results/ansicht-${info.project.name}${path === "/" ? "-start" : path.replace("/", "-")}.png`, fullPage: true });
  }
});

test("KI-Bilder sind als Visualisierung gekennzeichnet und haben feste Masse", async ({ page }) => {
  for (const path of ["/", "/hochzeit", "/fotobox"]) {
    await page.goto(path);
    await expect(page.getByText(/Visualisierung(en)? \(KI-generiert\)/).first()).toBeVisible();
    const imgs = page.locator("picture img");
    expect(await imgs.count()).toBeGreaterThan(0);
    for (const img of await imgs.all()) {
      expect(await img.getAttribute("width")).toBeTruthy();
      expect(await img.getAttribute("height")).toBeTruthy();
      expect((await img.getAttribute("alt"))?.length).toBeGreaterThan(10);
    }
  }
});
