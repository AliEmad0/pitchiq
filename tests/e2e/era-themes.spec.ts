import { test, expect } from "./_helpers/test";

import { expectCssColorInRange } from "./_helpers/visual-assertions";

// Playwright renders the LIGHT theme by default (colorScheme: light), so body
// background-color is each era's LIGHT value. Locks the attribute wiring + the
// per-era palette (TASK-M25, mirroring the TASK-911 net).
test.describe("Time-Machine era themes (TASK-M25)", () => {
  test("a 90s season applies the retro era + cream newsprint background", async ({ page }) => {
    await page.goto("/?season=1996");
    await expect(page.locator("html")).toHaveAttribute("data-era", "retro90s");
    await expectCssColorInRange(page.locator("body"), "background-color", [233, 224, 203]);
  });

  test("a 2000s season applies the golden era + silver background", async ({ page }) => {
    await page.goto("/?season=2004");
    await expect(page.locator("html")).toHaveAttribute("data-era", "goldenMillennium");
    await expectCssColorInRange(page.locator("body"), "background-color", [233, 240, 247]);
  });

  test("a modern season has no era attribute + the baseline background", async ({ page }) => {
    await page.goto("/?season=2024");
    expect(await page.locator("html").getAttribute("data-era")).toBeNull();
    await expectCssColorInRange(page.locator("body"), "background-color", [250, 250, 250]);
  });
});
