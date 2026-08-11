import { test, expect } from "./_helpers/test";

test("leaderboards page renders boards and reflects the season", async ({ page }) => {
  await page.goto("/leaderboards?season=2024");
  await expect(page.getByRole("heading", { name: "Leaderboards", level: 1 })).toBeVisible();
  // Core board + a keeper board both present on a modern season. `exact` so
  // "Goals" doesn't also match the "Expected Goals (xG)" board.
  await expect(page.getByRole("list", { name: "Goals", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Saves", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Appearances", exact: true })).toBeVisible();
});

test("nav link reaches the leaderboards page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation").getByRole("link", { name: "Leaderboards" }).first().click();
  await expect(page).toHaveURL(/\/leaderboards/);
});
