import { test, expect } from "./_helpers/test";

// TASK-907: the global command palette. /api/search reads the committed JSON via
// loaders (no outbound fetch), so this runs against real data with no MSW need.
test.describe("Global search (TASK-907)", () => {
  test("⌘K / Ctrl-K opens search; typing a team navigates to its page", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("ControlOrMeta+k");

    const input = page.getByPlaceholder(/search teams, players & managers/i);
    await expect(input).toBeVisible();

    await input.fill("Arsenal");

    // The team row's accessible name is exactly the club name (the player rows
    // are "Name TeamName"), so an exact match targets the Teams section.
    const teamOption = page.getByRole("option", { name: "Arsenal", exact: true });
    await teamOption.click();

    // TASK-M08: results link to /teams/[id]?season=<latestSeason> so historical
    // entities land on a populated page.
    await expect(page).toHaveURL(/\/teams\/\d+\?season=\d+$/);
  });

  // TASK-M30: nickname/alias + auto-initials search. Neither query is a
  // substring of the player's formal name, so this proves the alias map +
  // query-time acronym matching surface the right player.
  test("alias + acronym queries surface the right player", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByPlaceholder(/search teams, players & managers/i);
    await expect(input).toBeVisible();

    // Curated nickname: "cr7" → Cristiano Ronaldo.
    await input.fill("cr7");
    await expect(page.getByRole("option", { name: /Cristiano Ronaldo/ })).toBeVisible();

    // Auto-derived initials: "kdb" → Kevin De Bruyne.
    await input.fill("kdb");
    await expect(page.getByRole("option", { name: /Kevin De Bruyne/ })).toBeVisible();
  });

  // Managers are now in the cross-season palette (TASK-M51 follow-up): a manager
  // is findable from any page and the result links to /managers/[id]?season=.
  test("a manager is searchable cross-season and navigates to the manager page", async ({
    page,
  }) => {
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByPlaceholder(/search teams, players & managers/i);
    await expect(input).toBeVisible();

    await input.fill("Ferguson");
    const option = page.getByRole("option", { name: /Alex Ferguson/ });
    await option.click();
    await expect(page).toHaveURL(/\/managers\/[^/?]+\?season=\d+$/);
  });
});
