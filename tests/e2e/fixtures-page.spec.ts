import { test, expect } from "@playwright/test";

// TASK-M12 — the all-fixtures page (`/fixtures?season=`) and the dashboard
// "See all" link that reaches it, against committed snapshot data.

test.describe("All-fixtures page", () => {
  test("dashboard 'See all' navigates to the grouped season fixtures list", async ({ page }) => {
    await page.goto("/");

    // TASK-M71b: on the current-season dashboard the "See all" link is the bare
    // /fixtures URL (the current season's canonical form). Scoped by its exact
    // /fixtures href since the dashboard also has a "See all" → /leaderboards on
    // the Top Scorers heading (TASK-M18).
    const seeAll = page.locator('a[href="/fixtures"]:has-text("See all")');
    await expect(seeAll).toBeVisible();
    await seeAll.click();

    await expect(page).toHaveURL(/\/fixtures$/);
    await expect(page.getByRole("heading", { level: 1, name: /^Fixtures/i })).toBeVisible();

    // Fixtures are grouped into matchday sections (each <section> is labelled
    // with its date heading). A full PL season spans many matchdays.
    const matchdaySections = page.locator("section[aria-label]");
    expect(await matchdaySections.count()).toBeGreaterThan(5);

    // Every match links to its detail page (ids start with the year, e.g.
    // `/fixtures/2025-08-16-MUN-ARS`). A full season has hundreds.
    const detailLinks = page.locator('a[href^="/fixtures/2"]');
    expect(await detailLinks.count()).toBeGreaterThan(50);

    // The list links round-trip to a real fixture detail page.
    await detailLinks.first().click();
    await expect(page).toHaveURL(/\/fixtures\/\d{4}-\d{2}-\d{2}-[A-Z]{3}-[A-Z]{3}$/);
    await expect(page.getByRole("tab", { name: "Statistics" })).toBeVisible();
  });

  test("the primary nav has a Fixtures link that opens the all-fixtures page (TASK-M35)", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: /primary/i });
    const fixturesLink = nav.getByRole("link", { name: "Fixtures" });
    await expect(fixturesLink).toBeVisible();
    await fixturesLink.click();
    await expect(page).toHaveURL(/\/fixtures(\?|$)/);
    await expect(page.getByRole("heading", { level: 1, name: /^Fixtures/i })).toBeVisible();
  });
});
