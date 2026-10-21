// ⚠️ `test`/`expect` come from the local helper, NEVER from @playwright/test. The helper
// waits for the App Router to mount; without it a click dispatched pre-hydration is
// silently swallowed — React suppresses the default action but no router exists to handle
// it, so no RSC request is ever issued and no timeout value can rescue it.
import { GAME_MODES, isPlayable } from "@/features/game/domain/modes";
import en from "@/i18n/messages/en.json";
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

    /**
     * Locked modes are visible but are not controls — that is the whole accessibility
     * decision behind the gate, so it is asserted end to end and not only in the unit test.
     *
     * ⛔ The example is DERIVED from the registry. It was hardcoded to "Captain's Draft",
     * and the day that mode shipped this assertion failed for a reason unrelated to the
     * rule it guards — a locked mode had simply become a button. Every mode that ships
     * would break it again.
     */
    // ⚠️ Since TASK-1818 (2026-10-21) every mode is live, so there may be no locked tile to check;
    // the unit test keeps the rule guarded with a synthetic one. The next new mode re-arms this.
    const locked = GAME_MODES.find((m) => !isPlayable(m));
    if (locked != null) {
      const lockedName = en.game[locked.nameKey as keyof typeof en.game] as string;
      await expect(page.getByText(lockedName).first()).toBeVisible();
      await expect(page.getByRole("button", { name: lockedName })).toHaveCount(0);
    }

    // Mode, then format.
    await page.getByRole("button", { name: /Tactical H2H/ }).click();
    await expect(page.getByRole("link", { name: /One Match/ })).toBeVisible();
    // ⭐ Every mode has a live season since 2026-10-12 — the same page, told apart by the param.
    await expect(page.getByRole("link", { name: /Full Season/ })).toHaveAttribute(
      "href",
      /\/game\/draft\?format=season$/,
    );

    await page.getByRole("link", { name: /One Match/ }).click();
    await expect(page).toHaveURL(/\/game\/draft$/);
  });

  test("redirects the retired /game/play to the draft", async ({ page }) => {
    await page.goto("/game/play");
    await expect(page).toHaveURL(/\/game\/draft$/);
  });
});
