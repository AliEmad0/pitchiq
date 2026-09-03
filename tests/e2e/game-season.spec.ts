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

  test("⭐ drafting an XI reaches the hub, and a matchweek moves the table", async ({ page }) => {
    test.slow(); // A season builds 20 XIs and then simulates ten matches through the real engine.
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

    // ⭐ The season took over instead of a match: no kick-off, a league instead.
    const hub = page.getByTestId("season-hub");
    await expect(hub).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: /Kick off/i })).toHaveCount(0);

    const week = page.getByTestId("season-week");
    await expect(week).toContainText(/0[\s\S]*38/);
    await expect(page.getByTestId("season-row")).toHaveCount(20);

    await page.getByRole("button", { name: /Sim week/i }).click();

    await expect(week).toContainText(/1[\s\S]*38/);
    // Ten fixtures a week, so a full round leaves every club on one game played.
    const played = await page
      .getByTestId("season-row")
      .evaluateAll((rows) => rows.map((r) => Number((r as HTMLElement).dataset.played)));
    expect(played).toHaveLength(20);
    expect(played.every((p) => p === 1)).toBe(true);
  });
});
