import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Phase 4: Admin-Seiten im echten wrangler dev (Entwicklungs-Anmeldung als Eigentümer).
async function pruefe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test("Admin-Seiten: laden, Navigation, barrierefrei, kein Überlauf", async ({ page }, info) => {
  for (const [pfad, titel] of [["/admin", "Übersicht"], ["/admin/buchungen", "Buchungen"], ["/admin/kalender", "Kalender"], ["/admin/kunden", "Kunden"], ["/admin/events", "Events"], ["/admin/geraete", "Geräte"], ["/admin/finanzen", "Finanzen"], ["/admin/preise", "Preise"], ["/admin/inhalte", "Inhalte"], ["/admin/einstellungen", "Einstellungen"]] as const) {
    const res = await page.goto(pfad);
    expect(res?.status()).toBe(200);
    expect(res?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(page.getByRole("heading", { level: 1, name: titel })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Administration" }).getByRole("link", { name: titel })).toHaveAttribute("aria-current", "page");
    await pruefe(page);
    await page.screenshot({ path: `test-results/admin-${info.project.name}${pfad.replace(/\//g, "-")}.png`, fullPage: true });
  }
});

test("Buchung im Admin: suchen, öffnen, Notiz speichern", async ({ page, request }, info) => {
  // Testbuchung über die API (zufälliger freier Tag, Selbstabholung)
  const heute = new Date().toISOString().slice(0, 10);
  let tag = "";
  for (let i = 0; i < 40 && !tag; i++) {
    const t = new Date(Date.parse(heute) + (60 + Math.floor(Math.random() * 420)) * 86_400_000).toISOString().slice(0, 10);
    if ((await (await request.get(`/api/verfuegbarkeit?von=${t}&bis=${t}`)).json()).belegt.length === 0) tag = t;
  }
  const o = { Origin: `http://127.0.0.1:${process.env.PW_PORT ?? "8788"}` };
  const h = await request.post("/api/buchung/halten", { headers: o, data: { wahl: { paket: "essential", event: tag, start: tag, ende: tag, lieferung: false, stornierbar: false } } });
  expect(h.status()).toBe(201);
  const b = await request.post("/api/buchung/abschliessen", { headers: o, data: { halteId: (await h.json()).halteId, kontakt: { name: "Admin Test", email: `admin.e2e.${Date.now()}@example.ch`, telefon: "+41 79 000 00 00", agb: true } } });
  const { nummer } = await b.json();

  await page.goto("/admin/buchungen?zeit=alle");
  await page.getByLabel("Suche").fill(nummer);
  await page.getByRole("button", { name: "Filtern" }).click();
  await page.getByRole("link", { name: nummer }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(nummer);
  await page.getByLabel("Interne Notiz").fill("E2E-Notiz: Aufbau ab 14 Uhr");
  await page.getByRole("button", { name: "Notiz speichern" }).click();
  await expect(page.getByRole("status")).toContainText("Notiz gespeichert");
  await expect(page.getByText("E2E-Notiz: Aufbau ab 14 Uhr")).toBeVisible();
  await pruefe(page);
  await page.screenshot({ path: `test-results/admin-${info.project.name}-buchungsdetail.png`, fullPage: true });
  // aufräumen: stornieren (gibt den Tag frei), ohne Mail
  await page.getByLabel("Kunde per E-Mail informieren").uncheck();
  await page.getByRole("button", { name: "Stornieren" }).click();
  await expect(page.getByRole("status")).toContainText("storniert");
});
