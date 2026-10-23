import { expect, test } from "./_helpers/test";

/**
 * TASK-1812 — Records in a real browser: reached from the mode gate, and a new coach sees the
 * empty state with a way into a match. (What gets recorded is covered by the unit suites, which
 * drive the career log through `recordFullTime` and the first-open backfill.)
 */
test.describe("Records (TASK-1812)", () => {
  test("the gate links in, and a new coach sees how to start", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/game");
    await page.getByRole("link", { name: /Records/ }).click();
    await expect(page).toHaveURL(/\/game\/records$/);
    const empty = page.getByTestId("records-empty");
    await expect(empty).toBeVisible({ timeout: 30_000 });
    await expect(empty.getByRole("link", { name: "Play a match" })).toHaveAttribute(
      "href",
      "/game",
    );
  });
});
