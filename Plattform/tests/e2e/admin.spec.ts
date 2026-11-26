import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Lokal mit Entwicklungs-Abkürzung (nur localhost + ENVIRONMENT=development). In Produktion schützt Cloudflare Access.
test("Admin-Seite: angemeldet, Verbrauchsübersicht, barrierefrei", async ({ page }) => {
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(200);
  expect(res?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.getByText("inhaber@example.ch")).toBeVisible();
  await expect(page.getByText("Entwicklungsmodus")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fotospeicher" })).toBeVisible();
  await expect(page.getByText("nicht verfügbar (lokal)").first()).toBeVisible();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("Admin-API im echten Worker: Rolle und Verbrauch", async ({ request }) => {
  const me = await request.get("/api/admin/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).role).toBe("owner");
  const usage = await request.get("/api/admin/usage");
  expect(usage.status()).toBe(200);
  expect((await usage.json()).speicher.grenze).toBe(8_000_000_000);
});

test("Schreibende Anfrage von fremder Herkunft wird abgelehnt", async ({ request }) => {
  const r = await request.put("/api/admin/einstellungen/print_cost_rappen", { data: { value: 20 }, headers: { Origin: "https://boese.example" } });
  expect(r.status()).toBe(403);
});

test("Öffentliche Seiten weiterhin statisch erreichbar", async ({ request }) => {
  expect((await request.get("/")).status()).toBe(200);
  expect((await request.get("/api/health")).status()).toBe(200);
});
