import { expect, test } from "./_helpers/test";

/**
 * TASK-1818 — the Mystery Market in a real browser: the gate links in (the last mode to ship), a
 * run starts with three lives, and the first round's match screens open.
 */
test.describe("Mystery Market (TASK-1818)", () => {
  test("the gate links in; a run starts with three lives and plays its first round", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/game");
    await page.getByRole("link", { name: /Mystery Market/ }).click();
    await expect(page).toHaveURL(/\/game\/market$/);
    await page.getByTestId("market-start").click();
    await expect(page.getByTestId("market-lives")).toHaveAccessibleName("3 lives left", {
      timeout: 30_000,
    });
    await page.getByTestId("market-play").click();
    await expect(page.getByText(/restart/i).first()).toBeVisible({ timeout: 30_000 });
  });
});
