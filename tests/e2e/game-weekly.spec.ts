import { expect, test } from "./_helpers/test";

/**
 * TASK-1828 — the Weekly Ladder in a real browser: reached from the mode gate, the week resolves
 * after mount, the rule and the seven real rival clubs show, and the draft opens.
 * (The league logic is covered by the unit suites, which drive every matchday path.)
 */
test.describe("Weekly Ladder (TASK-1828)", () => {
  // ⚠️ No Arabic test: `/ar/*` is 301'd to English while Arabic is parked (TASK-1843).
  test("the gate links in; the week's rule and seven rivals show; the draft opens", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/game");
    await page.getByRole("link", { name: /Weekly Ladder/ }).click();
    await expect(page).toHaveURL(/\/game\/weekly$/);
    await expect(page.getByTestId("weekly-intro")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("weekly-rule")).toBeVisible();
    await expect(page.getByTestId("weekly-rivals").locator("li")).toHaveCount(7);
    await page.getByTestId("weekly-draft").click();
    await expect(page.getByTestId("weekly-intro")).toHaveCount(0);
  });
});
