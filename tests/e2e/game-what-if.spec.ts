import { expect, test } from "./_helpers/test";

/**
 * TASK-1816 — a What-If rescue end to end in a real browser: the list, the team talk at the
 * real minute, the live match, and full time with the verdict and the post-match report.
 */
test.describe("What-If (TASK-1816)", () => {
  test("a rescue plays from the team talk to the verdict", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/game/whatif");
    const row = page.getByTestId("wi-row-2011-new-ars");
    await expect(row).toContainText("Newcastle");
    await expect(row).toContainText("26'");

    await page.clock.install();
    await row.getByRole("button", { name: "Play" }).click();
    const talk = page.getByTestId("wi-talk");
    await expect(talk).toBeVisible({ timeout: 30_000 });
    await expect(talk.getByTestId("wi-pitch-player")).toHaveCount(11);
    await page.getByRole("button", { name: /Aggressive overload/ }).click();

    const bench = page.getByRole("dialog", { name: "The bench" });
    if (await bench.isVisible())
      await bench.getByRole("button", { name: /close/i }).first().click();

    // Coach windows wait 20 seconds each; run them out on the browser clock.
    const fullTime = page.getByRole("button", { name: "Full time", exact: true });
    for (let i = 0; i < 40 && !(await fullTime.isVisible()); i++) {
      await page.clock.fastForward(21_000);
    }
    await fullTime.click();
    await expect(page.getByTestId("wi-verdict")).toBeVisible();
    await expect(page.getByTestId("wi-verdict")).toContainText("4–4");
    await expect(page.getByTestId("post-match-report")).toBeVisible();
  });
});
