import { test, expect } from "./_helpers/test";

// M21 — fixture-page player links. Man Utd v Fulham (2024-08-16 opening day) has
// committed lineups whose names all resolve to the 2024-25 squad.
test("a fixture page links a lineup player to their profile", async ({ page }) => {
  await page.goto("/fixtures/2024-08-16-MUN-FUL");

  // The Lineups tab is default when lineups exist; at least one player resolves
  // to a /players/<id> link (pitch surname or bench chip).
  const playerLink = page.locator('a[href^="/players/"]').first();
  await expect(playerLink).toBeVisible();
  await playerLink.click();
  await expect(page).toHaveURL(/\/players\/\d+/);
});
