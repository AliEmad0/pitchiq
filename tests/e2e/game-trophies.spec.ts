import { expect, test } from "./_helpers/test";

/**
 * TASK-1813/1819 — the Trophy Room in a real browser: reached from the mode gate, an empty
 * album says how to start, the Hall of Fame shows sixteen cups, and `#hall` opens it directly.
 * (Recording at full time is covered by the unit suites, which drive every full-time path.)
 */
test.describe("Trophy Room (TASK-1813/1819)", () => {
  test("the gate links in; the album and the cabinet both open", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/game");
    await page.getByRole("link", { name: /Album/ }).click();
    await expect(page).toHaveURL(/\/game\/trophies$/);
    await expect(page.getByText(/Your album is empty/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("tab", { name: "Hall of Fame" }).click();
    await expect(page.getByTestId("tc-cup")).toHaveCount(16);
    await expect(page.getByTestId("tc-cup").first()).not.toHaveClass(/is-lit/);
  });

  test("#hall opens the cabinet, in Arabic too", async ({ page }) => {
    await page.goto("/ar/game/trophies#hall");
    await expect(page.getByTestId("tc-cup")).toHaveCount(16, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("غرفة الكؤوس");
  });
});
