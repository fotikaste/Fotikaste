import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

// Phase 5 im echten wrangler dev: Admin legt Gerät + Event an, ein «Geräte-Simulator» lädt wie die Fotobox hoch,
// der Gast öffnet seinen Link. Testbild: Visualisierung aus public/bilder (kein Gästefoto).
const O = { Origin: `http://127.0.0.1:${process.env.PW_PORT ?? "8788"}` };
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

async function pruefe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

/** Simuliert die Fotobox: anmelden, beide Varianten hochladen. */
async function simuliereUpload(request: APIRequestContext, token: string): Promise<string> {
  const gast = randomBytes(16).toString("base64url");
  const web = readFileSync("public/bilder/firmenanlass-gruppe.jpg");
  const thumb = readFileSync("public/bilder/firmenanlass-saal.jpg");
  const auth = { Authorization: `Bearer ${token}` };
  const a = await request.post("/api/device/v1/uploads", { headers: auth, data: { client_photo_id: randomBytes(9).toString("base64url"), token_hash: sha(gast), web: { bytes: web.length, sha256: sha(web) }, thumb: { bytes: thumb.length, sha256: sha(thumb) } } });
  expect(a.status()).toBe(201);
  const { photo_id } = await a.json();
  for (const [v, d] of [["web", web], ["thumb", thumb]] as const) expect((await request.put(`/api/device/v1/uploads/${photo_id}/${v}`, { headers: { ...auth, "Content-Type": "image/jpeg" }, data: d })).status()).toBe(200);
  return gast;
}

test("Fotobox → Plattform → Gast: Gerät, Event, Upload, Gäste-Link, Admin-Galerie", async ({ page, request }, info) => {
  // Gerät anlegen (Token wird einmal angezeigt)
  await page.goto("/admin/geraete");
  await pruefe(page);
  await page.getByLabel("Name").fill(`E2E-Box ${info.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Anlegen und Token erzeugen" }).click();
  const token = (await page.locator("code").textContent())!.trim();
  expect(token).toMatch(/^[0-9a-f]{64}$/);
  await page.screenshot({ path: `test-results/fotobox-${info.project.name}-geraet-token.png`, fullPage: true });
  await page.goto("/admin/geraete"); // Token erscheint danach nie mehr
  await expect(page.locator("code")).toHaveCount(0);

  // Event anlegen, Gerät zuweisen, aktivieren (vorheriges aktives Event dieses Geräts gibt es nicht)
  const geraet = (await (await request.get("/api/device/v1/config", { headers: { Authorization: `Bearer ${token}` } })).json()).geraet;
  await page.goto("/admin/events");
  await page.getByLabel("Name der Galerie").fill(`E2E-Galerie ${info.project.name}`);
  await page.getByLabel("Eventtag").fill("2027-08-14");
  await page.getByLabel("Fotobox").selectOption(geraet.id);
  await page.getByRole("button", { name: "Event anlegen" }).click();
  await page.getByRole("button", { name: "Aktivieren (Uploads an)" }).click();
  await expect(page.getByRole("status")).toContainText("Gespeichert");

  // Gast-Link vor dem Upload: «unterwegs»
  const vorher = randomBytes(16).toString("base64url");
  await page.goto(`/f/${vorher}`);
  await expect(page.getByRole("heading", { name: "Ihr Foto ist noch unterwegs" })).toBeVisible();

  const gast = await simuliereUpload(request, token);
  await page.goto(`/f/${gast}`);
  await expect(page.getByRole("heading", { name: "Ihr Foto" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Ihr Foto aus der Fotobox" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Foto speichern" })).toHaveAttribute("href", `/f/${gast}/bild?download`);
  expect(await page.evaluate(() => (document.querySelector("img") as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await pruefe(page);
  await page.screenshot({ path: `test-results/fotobox-${info.project.name}-gast.png`, fullPage: true });

  // Admin-Galerie zeigt das Foto, aufräumen: archivieren löscht alles
  await page.goto("/admin/events");
  await page.getByRole("link", { name: `E2E-Galerie ${info.project.name}` }).first().click();
  await expect(page.getByRole("heading", { name: /Fotos \(1/ })).toBeVisible();
  await pruefe(page);
  await page.screenshot({ path: `test-results/fotobox-${info.project.name}-event.png`, fullPage: true });
  await page.getByRole("button", { name: "Archivieren und alle Fotos löschen" }).click();
  await page.goto(`/f/${gast}`);
  await expect(page.getByRole("heading", { name: "Dieses Foto ist nicht mehr online" })).toBeVisible();
  await request.post(`/admin/geraete/${geraet.id}/widerrufen`, { headers: O });
});
