import { expect, test } from "./_helpers/test";

import { expectCssColorInRange } from "./_helpers/visual-assertions";

// TASK-1516 closeout: computed-style locks for the two surfaces added by the
// Phase-15 map + boundaries redesign (the shared palette + standings colours are
// already locked on the dashboard by TASK-911). Playwright renders the LIGHT
// theme; the default season is modern (2025-26), so `--primary` is #a3179a =
// rgb(163, 23, 154). Tolerance in the helper absorbs oklch→sRGB rounding.
const PRIMARY_LIGHT_MODERN: [number, number, number] = [163, 23, 154];

test("map: the letterbox lines are sticky + full-bleed and the slider uses the accent", async ({
  page,
}) => {
  // Optimized badge images need not finish loading before checking the map layout.
  await page.goto("/map", { waitUntil: "domcontentloaded" });

  // The caption is a sticky <h1> letterbox line.
  const caption = page.getByRole("heading", {
    level: 1,
    name: /a journey through 34 seasons/i,
  });
  await expect(caption).toBeVisible();
  await expect(caption).toHaveCSS("position", "sticky");

  // Both letterbox bars bleed to (near) the full viewport width.
  const vw = page.viewportSize()!.width;
  const capBox = await caption.boundingBox();
  expect(capBox!.width).toBeGreaterThan(vw - 2);

  const range = page.getByRole("slider", { name: "Season timeline" });
  const sliderBar = page.locator(".bg-muted").filter({ has: range });
  const barBox = await sliderBar.boundingBox();
  expect(barBox!.width).toBeGreaterThan(vw - 2);

  // The range is painted with the era accent (accent-primary).
  await expectCssColorInRange(range, "accent-color", PRIMARY_LIGHT_MODERN);
});

test("404: the VAR review panel carries the primary left-accent + badge", async ({ page }) => {
  await page.goto("/definitely-not-a-real-page");

  await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();

  // The "VAR · No decision" badge is tinted with the era accent.
  const badge = page.getByText(/no decision/i);
  await expect(badge).toBeVisible();
  await expectCssColorInRange(badge, "color", PRIMARY_LIGHT_MODERN);
});
