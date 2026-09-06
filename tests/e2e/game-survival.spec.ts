import { test, expect } from "./_helpers/test";
test("Survival Lifeline: sim, play, return results, resume and mobile crests", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/game/classic?objective=survival", { waitUntil: "domcontentloaded" });
  const hub = page.getByRole("region", { name: "The Lifeline", exact: true });
  await hub.getByRole("button", { name: "Start Survival" }).click();
  const before = await hub.getByRole("table").innerText();
  await hub.getByRole("button", { name: "Sim fixture", exact: true }).click();
  await expect(hub.getByRole("button", { name: "Play fixture" })).toBeEnabled();
  await expect(hub.getByRole("table")).not.toHaveText(before);
  const beforePlay = await hub.getByRole("table").innerText();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await hub.getByRole("button", { name: "Play fixture" }).click();
  await page.getByRole("button", { name: /Kick off/i }).click();
  const fullTime = page.getByRole("button", { name: "Full time", exact: true });
  for (let i = 0; i < 40 && !(await fullTime.isVisible()); i++)
    await page.clock.fastForward(21_000);
  await expect(fullTime).toBeVisible();
  await fullTime.click();
  await page.getByRole("button", { name: "Return to season" }).click();
  await expect(hub.getByRole("button", { name: "Play fixture" })).toBeEnabled();
  const after = await hub.getByRole("table").innerText();
  expect(after).not.toBe(beforePlay);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(hub.getByRole("button", { name: "Play fixture" })).toBeEnabled();
  expect(await hub.getByRole("table").innerText()).toBe(after);
  const crests = hub.getByRole("region", { name: "Season fixtures" }).locator("img");
  expect(await crests.count()).toBeGreaterThanOrEqual(7);
  await page.screenshot({ path: testInfo.outputPath("lifeline-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("lifeline-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Classic season", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start season", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Survival", exact: true }).click();
  await expect(hub.getByRole("button", { name: "Play fixture" })).toBeEnabled();
  expect(await hub.getByRole("table").innerText()).toBe(after);
});
