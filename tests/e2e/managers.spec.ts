import { test, expect } from "./_helpers/test";

test("managers index → profile → club", async ({ page }) => {
  await page.goto("/managers");
  await expect(page.getByRole("heading", { name: "Premier League managers" })).toBeVisible();

  // First manager-row link → profile.
  const firstManager = page.locator('a[href^="/managers/"]').first();
  await expect(firstManager).toBeVisible();
  const name = (await firstManager.textContent())?.trim();
  await firstManager.click();
  await expect(page).toHaveURL(/\/managers\/\d+/);
  if (name) await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Career by club" })).toBeVisible();

  // Career table club link → team page.
  const club = page.locator('a[href^="/teams/"]').first();
  await club.click();
  await expect(page).toHaveURL(/\/teams\/\d+/);
});

test("nav exposes Managers", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Managers" }).first()).toBeVisible();
});

// TASK-M51 backfilled managers for 1992-2007, so a legacy season now populates
// the index instead of showing the "No manager data" empty-state.
test("a legacy season populates the managers index", async ({ page }) => {
  await page.goto("/managers?season=2000");
  await expect(page.getByRole("heading", { name: "Premier League managers" })).toBeVisible();
  await expect(page.getByRole("status", { name: /No manager data/i })).toHaveCount(0);
  await expect(page.locator('a[href^="/managers/"]').first()).toBeVisible();
});
