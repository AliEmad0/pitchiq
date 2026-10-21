import { expect, test } from "./_helpers/test";

/**
 * TASK-1827 — the first run in a real browser: a fresh browser sees the banner on the mode gate,
 * the welcome takes a name and a crest, and Take charge opens the briefed tutorial rescue.
 */
test.describe("Onboarding (TASK-1827)", () => {
  test("a first-time visitor is offered the rescue and reaches the tutorial match", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/game");
    await page.getByTestId("coach-banner-new").click();
    await expect(page).toHaveURL(/\/game\/start$/);
    await page.getByLabel("Coach name").fill("Tester");
    await page.getByRole("radio", { name: "Wolf" }).click();
    await page.getByTestId("ob-start").click();
    await expect(page.getByTestId("ob-match")).toContainText("Tester, it", { timeout: 30_000 });
    await expect(page.getByTestId("wi-tip").first()).toBeVisible({ timeout: 30_000 });
  });

  test("after skipping, the gate greets the coach by name", async ({ page }) => {
    await page.goto("/game/start");
    await page.getByLabel("Coach name").fill("Ali");
    await page.getByTestId("ob-skip").click();
    await expect(page).toHaveURL(/\/game$/);
    await expect(page.getByTestId("coach-banner")).toContainText("Ali", { timeout: 30_000 });
  });
});
