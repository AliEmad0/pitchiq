import { expect, test } from "./_helpers/test";

// TASK-1606 (Plan A) — Arabic entity-name data on /ar.
// Positions + the seeded Manchester United club name are the deterministic,
// no-external-dependency proof that the data (not just the UI chrome) is Arabic.

test("/ar renders the seeded Arabic club name in the standings table", async ({ page }) => {
  await page.goto("/ar?season=2024");
  await expect(page.getByText("مانشستر يونايتد").first()).toBeVisible();
});

test("/ar renders an Arabic name + position on a player profile", async ({ page }) => {
  // Mohamed Salah (id 1001119) → محمد صلاح, a Forward → مهاجم.
  await page.goto("/ar/players/1001119?season=2024");
  await expect(page.getByText("محمد صلاح").first()).toBeVisible();
  await expect(page.getByText("مهاجم").first()).toBeVisible();
});

test("/en keeps the Latin club name (data untranslated)", async ({ page }) => {
  await page.goto("/?season=2024");
  await expect(page.getByText("Manchester United").first()).toBeVisible();
  await expect(page.getByText("مانشستر يونايتد")).toHaveCount(0);
});
