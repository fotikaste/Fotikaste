import { test, expect, type APIRequestContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Läuft gegen die lokale Entwicklungsdatenbank (wrangler dev). Datum zufällig wählen und vorher prüfen, damit Wiederholungen nicht kollidieren.
const plus = (tag: string, n: number) => new Date(Date.parse(`${tag}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
async function freierTag(request: APIRequestContext): Promise<string> {
  const heute = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 40; i++) {
    const tag = plus(heute, 60 + Math.floor(Math.random() * 420));
    const r = await request.get(`/api/verfuegbarkeit?von=${tag}&bis=${plus(tag, 1)}`);
    if ((await r.json()).belegt.length === 0) return tag;
  }
  throw new Error("kein freier Tag gefunden");
}
async function axe(page: import("@playwright/test").Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
}
const keinUeberlauf = async (page: import("@playwright/test").Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

test("Buchung A–Z: Datum, Preis vom Server, Reservierung, Kontakt, Bestätigung, Admin", async ({ page, request }, info) => {
  const tag = await freierTag(request);
  await page.goto(`/buchen?datum=${tag}`);
  await expect(page.locator("#event")).toHaveValue(tag);
  await page.locator("#plz").fill("8500");
  // Testdaten (tools/dev-plz.sql): Sirnach → Frauenfeld, Paket Premium
  await expect(page.locator("#zf")).toContainText("Frauenfeld");
  await expect(page.locator("#zf")).toContainText("CHF 450.00");
  await expect(page.locator("#zf")).toContainText("sofort verbindlich buchbar");
  await keinUeberlauf(page);
  await axe(page);
  await page.screenshot({ path: `test-results/ansicht-${info.project.name}-buchen.png`, fullPage: true });

  await page.getByRole("button", { name: "Termin reservieren" }).click();
  await expect(page.locator("#hold-info")).toContainText("Termin reserviert bis");
  await page.getByLabel("Vor- und Nachname").fill("Test Person");
  await page.getByLabel("E-Mail").fill(`e2e.${Date.now()}@example.ch`);
  await page.getByLabel("Telefon").fill("+41 79 000 00 00");
  await page.getByLabel("Strasse und Nr. des Eventorts").fill("Testweg 1");
  // ohne AGB: Fehlermeldung vom Server
  await page.getByRole("button", { name: "Verbindlich buchen" }).click();
  await expect(page.getByRole("alert")).toContainText("AGB");
  await page.getByRole("checkbox", { name: /AGB/ }).check();
  await axe(page);
  await page.getByRole("button", { name: "Verbindlich buchen" }).click();
  await expect(page.locator("#fertig-titel")).toContainText(/Buchung FK-\d{4}-\d{4} bestätigt/);
  const nummer = (await page.locator("#fertig-titel").textContent())!.match(/FK-\d{4}-\d{4}/)![0];
  await page.screenshot({ path: `test-results/ansicht-${info.project.name}-bestaetigt.png`, fullPage: true });

  // Termin ist jetzt belegt
  expect((await (await request.get(`/api/verfuegbarkeit?von=${tag}&bis=${tag}`)).json()).belegt).toEqual([tag]);
  // Admin sieht die Buchung und die zurückgehaltene Mail (Testmodus)
  await page.goto("/admin");
  await expect(page.getByText(nummer, { exact: true })).toBeVisible();
  await expect(page.getByText("zurückgehalten (Testmodus)").first()).toBeVisible();
  await page.screenshot({ path: `test-results/ansicht-${info.project.name}-admin.png`, fullPage: true });
});

test("Belegter Tag: Angebot meldet «belegt», Reservierung nicht möglich", async ({ page, request }) => {
  const tag = await freierTag(request);
  const h = await request.post("/api/buchung/halten", { data: { wahl: { paket: "essential", event: tag, start: tag, ende: tag, lieferung: false, stornierbar: false } }, headers: { Origin: "http://127.0.0.1:8788" } });
  expect(h.status()).toBe(201);
  await page.goto(`/buchen?datum=${tag}`);
  await page.getByText("Selbstabholung", { exact: true }).click();
  await expect(page.locator("#zf")).toContainText("Leider belegt");
  await expect(page.getByRole("button", { name: /reservieren/ })).toBeDisabled();
  await request.post("/api/buchung/freigeben", { data: { halteId: (await h.json()).halteId }, headers: { Origin: "http://127.0.0.1:8788" } });
});

test("Kalender und Kundenkonto: laden, barrierefrei, kein Überlauf", async ({ page }, info) => {
  await page.goto("/verfuegbarkeit");
  await expect(page.locator("#tage a").first()).toBeVisible();
  await page.getByRole("button", { name: "Nächster Monat" }).click();
  await expect(page.locator("#tage a").first()).toHaveAttribute("href", /\/buchen\?datum=/);
  await keinUeberlauf(page);
  await axe(page);
  await page.screenshot({ path: `test-results/ansicht-${info.project.name}-verfuegbarkeit.png`, fullPage: true });

  await page.goto("/konto");
  await page.getByLabel("E-Mail-Adresse Ihrer Buchung").fill("niemand@example.ch");
  await page.getByRole("button", { name: "Anmeldelink senden" }).click();
  await expect(page.getByRole("status")).toContainText("Falls zu dieser Adresse eine Buchung besteht");
  await keinUeberlauf(page);
  await axe(page);
  await page.screenshot({ path: `test-results/ansicht-${info.project.name}-konto.png`, fullPage: true });

  await page.goto("/konto/anmelden#" + "0".repeat(64));
  await page.getByRole("button", { name: "Jetzt anmelden" }).click();
  await expect(page.getByRole("alert")).toContainText("abgelaufen");
});
