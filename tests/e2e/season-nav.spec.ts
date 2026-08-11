import { test, expect } from "./_helpers/test";

// TASK-M71b — the header nav carries the viewed season in the PATH (the
// transitional `?season=` behavior is gone). From `/seasons/<year>/<section>`
// or the season dashboard, section links stay within that season's namespace;
// on the current season they are bare. Managers/Leaderboards/Map live in the
// "More" dropdown (Phase 15 segmented-pill nav, TASK-1502).
test.describe("Season carried across nav (path model)", () => {
  test("a season dashboard carries the season across primary pill links", async ({ page }) => {
    await page.goto("/seasons/2003");

    // Scope to the header "Primary" nav — the footer also links Teams/Players.
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Teams", exact: true }).click();
    await expect(page).toHaveURL(/\/seasons\/2003\/teams$/);

    // …and it keeps carrying across a second hop (Players is also a pill link).
    await nav.getByRole("link", { name: "Players", exact: true }).click();
    await expect(page).toHaveURL(/\/seasons\/2003\/players$/);
  });

  test("the 'More' dropdown links also carry the season in the path", async ({ page }) => {
    await page.goto("/seasons/2003/teams");
    await page.getByRole("button", { name: /more sections/i }).click();
    await page.getByRole("menuitem", { name: "Managers" }).click();
    await expect(page).toHaveURL(/\/seasons\/2003\/managers$/);
  });

  test("the current season keeps clean, bare section URLs", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Teams", exact: true }).click();
    await expect(page).toHaveURL(/\/teams$/);
  });
});
