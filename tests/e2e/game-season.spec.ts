// ⚠️ `test`/`expect` come from the local helper, NEVER from @playwright/test. The helper
// waits for the App Router to mount; without it a click dispatched pre-hydration is
// silently swallowed — React suppresses the default action but no router exists to handle
// it, so no RSC request is ever issued and no timeout value can rescue it.
import { expect, test } from "./_helpers/test";

/** Liverpool — the club the rest of the game suite warms and drafts against. */
const CLUB = 40;

test.describe("Full Season (TASK-1811)", () => {
  test("⛔ the gate routes a season, and the CLUB SHEET carries it", async ({ page }) => {
    /**
     * ⛔ The second half is the one that bites. The gate's format link and the club page's
     * `?format=` reader were built in separate tasks and each is fine on its own; between
     * them sits the club sheet, whose links are built server-side from `/game/{mode}/{id}`
     * and dropped the param on the floor. A coach picking Full Season landed in an ordinary
     * single match, and every screen on the way looked exactly right.
     */
    await page.goto("/game");

    await page.getByRole("button", { name: /Legacy Club/ }).click();
    await page.getByRole("link", { name: /Full Season/ }).click();
    await expect(page).toHaveURL(/\/game\/legacy\?format=season$/);

    await page
      .getByRole("link", { name: /Liverpool/ })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/game/legacy/${CLUB}\\?format=season$`));
  });

  test("⚠️ and ONE MATCH still arrives with no param at all", async ({ page }) => {
    // The inertness control for the rule above: the sheet must carry the season and only the
    // season, or every other mode's links grow a query string they never asked for.
    await page.goto("/game");
    await page.getByRole("button", { name: /Legacy Club/ }).click();
    await page.getByRole("link", { name: /One Match/ }).click();
    await expect(page).toHaveURL(/\/game\/legacy$/);

    await page
      .getByRole("link", { name: /Liverpool/ })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/game/legacy/${CLUB}$`));
  });
});

/**
 * ⛔ NO RETRIES, and its own timeout — this one test's budget is a JOB-LEVEL decision.
 *
 * Before a hub can exist the season fetches NINETEEN rival squads, and each
 * `/api/game/rivals/[club]` is a full club-history build measured at ~4.9s of CPU cold
 * (CLAUDE.md). In production they are prerendered CDN files and the league arrives in
 * seconds; the E2E job runs `next dev`, so they are rendered on demand. Warming cannot help —
 * Turbopack compiles per ROUTE and it is the per-param RENDER that costs, for nineteen clubs
 * a random seed picks fresh each run.
 *
 * ⚠️ At the suite default of 2 retries a 4-minute test can spend 12 minutes, which on its own
 * exceeds the job's whole budget: that is what cancelled the E2E job at 15m18s, and no
 * per-test timeout could have fixed it. One attempt, capped, is the shape that fits — so a
 * genuine failure here is reported once rather than paid for three times.
 */
test.describe("Full Season — the league itself", () => {
  test.describe.configure({ retries: 0 });

  test("⭐ drafting an XI reaches the hub, and a matchweek moves the table", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(`/game/legacy/${CLUB}?format=season`);

    await page.getByRole("button", { name: /^Lock in / }).click();

    /**
     * ⚠️ A round may already be OPEN — clicking a slot while it is would just churn. Take a
     * candidate whenever one is on screen, and only open a slot when none is. Legacy has no
     * "Confirm squad" step; it confirms the moment the XI is full.
     */
    for (let i = 0; i < 30; i++) {
      const pick = page.getByRole("button", { name: /^Choose / }).first();
      if (await pick.isVisible().catch(() => false)) {
        await pick.click();
        continue;
      }
      const slot = page.getByRole("button", { name: /empty\. Choose a player/ }).first();
      if (!(await slot.isVisible().catch(() => false))) break;
      await slot.click();
    }

    /**
     * ⭐ STAGED, so a failure says WHICH half broke rather than only "no hub".
     *
     * First: the season took over instead of a match. `SeasonStart` shows "Building the
     * league…" while it fetches, so the union covers both orders — on a warm server the hub
     * can win the race, and asserting on the loading state alone would be its own flake.
     */
    await expect(
      page.locator("[data-testid=season-loading], [data-testid=season-hub]"),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: /Kick off/i })).toHaveCount(0);

    // Then the league itself, which is the part that takes minutes on a dev server.
    const hub = page.getByTestId("season-hub");
    await expect(hub).toBeVisible({ timeout: 180_000 });

    const week = page.getByTestId("season-week");
    await expect(week).toContainText(/Matchweek 0 of \d+/);

    /**
     * ⚠️ The size is asserted as a SHAPE, not as 20. A club whose squad could not be fetched
     * is left out rather than faked, and the league is then trimmed to an EVEN count — so a
     * flaky fetch legitimately shortens it. Pinning 20 would fail on the documented
     * degradation instead of on a defect.
     */
    const before = await page.getByTestId("season-row").count();
    expect(before).toBeGreaterThanOrEqual(10);
    expect(before % 2).toBe(0);

    await page.getByRole("button", { name: /Sim week/i }).click();

    await expect(week).toContainText(/Matchweek 1 of \d+/);
    // A whole matchweek, so every club in the league has played exactly once.
    const played = await page
      .getByTestId("season-row")
      .evaluateAll((rows) => rows.map((r) => Number((r as HTMLElement).dataset.played)));
    expect(played).toHaveLength(before);
    expect(played.every((p) => p === 1)).toBe(true);
  });
});
