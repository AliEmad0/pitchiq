// ⚠️ `test`/`expect` come from the local helper, NEVER from @playwright/test. The helper
// waits for the App Router to mount; without it a click dispatched pre-hydration is
// silently swallowed — React suppresses the default action but no router exists to handle
// it, so no RSC request is ever issued and no timeout value can rescue it.
import { expect, test } from "./_helpers/test";

test.describe("the game hub", () => {
  test("is reachable from the header and leads into a match", async ({ page }) => {
    await page.goto("/");

    // Scoped to the primary nav: the same link text also appears in the mobile drawer and
    // the footer, so an unscoped locator is a strict-mode violation.
    await page
      .getByRole("navigation", { name: /primary/i })
      .getByRole("link", { name: "Game" })
      .click();
    await expect(page).toHaveURL(/\/game$/);

    await expect(page.getByRole("heading", { name: "Play PitchIQ" })).toBeVisible();

    // Locked modes are visible but are not controls — that is the whole accessibility
    // decision behind the gate, so it is asserted end to end and not only in the unit test.
    await expect(page.getByText("Captain's Draft")).toBeVisible();
    await expect(page.getByRole("button", { name: /Captain's Draft/ })).toHaveCount(0);

    // Mode, then format.
    await page.getByRole("button", { name: /Tactical H2H/ }).click();
    await expect(page.getByRole("link", { name: /One Match/ })).toBeVisible();
    // Season is planned on every mode until TASK-1810/1811 ship.
    await expect(page.getByRole("link", { name: /Full Season/ })).toHaveCount(0);

    await page.getByRole("link", { name: /One Match/ }).click();
    await expect(page).toHaveURL(/\/game\/draft$/);
  });

  test("redirects the retired /game/play to the draft", async ({ page }) => {
    await page.goto("/game/play");
    await expect(page).toHaveURL(/\/game\/draft$/);
  });
});
