// ⚠️ `test`/`expect` come from the local helper, NEVER from @playwright/test. The helper
// waits for the App Router to mount; without it a click dispatched pre-hydration is
// silently swallowed — React suppresses the default action but no router exists to handle
// it, so no RSC request is ever issued and no timeout value can rescue it.
import { expect, test } from "./_helpers/test";

test.describe("Budget Cap Draft", () => {
  test("the gate opens the mode, then its format", async ({ page }) => {
    await page.goto("/game");

    /**
     * ⚠️ A TILE, then a FORMAT — not a direct link. `isDirectEntry` only collapses the step
     * for a mode with exactly ONE applicable format, and Budget Cap has two: `single` is live
     * and `season` is `planned` (TASK-1811), which still renders as a choice. Only the daily,
     * whose season format is `n/a`, goes straight in.
     */
    await page.getByRole("button", { name: /Budget Cap Draft/ }).click();
    await page.getByRole("link", { name: /One Match/ }).click();
    await expect(page).toHaveURL(/\/game\/budget$/);
  });

  test("the draft shows a budget and prices every card it deals", async ({ page }) => {
    await page.goto("/game/budget");

    // Lock any shape — the meter only exists once the deal exists.
    await page.getByRole("button", { name: /^Lock in / }).click();

    const meter = page.getByTestId("budget-meter").first();
    await expect(meter).toBeVisible();
    // €100M, in whatever digits the locale renders.
    await expect(meter).toContainText(/Remaining/);

    // Open the first empty position and check the hand.
    await page
      .getByRole("button", { name: /empty\. Choose a player/ })
      .first()
      .click();
    const veil = page.getByRole("dialog", { name: /Choose your/ });
    await expect(veil).toBeVisible();

    const candidates = veil.getByTestId("pd-candidate");
    await expect(candidates).toHaveCount(5);

    /**
     * ⛔ Every dealt card carries a price. The pool builder filters the 644 unpriced rows out,
     * so a card with no cost badge here means an unpriced card reached the page — which would
     * be a FREE superstar, and the whole mode with it.
     */
    await expect(veil.getByTestId("card-cost")).toHaveCount(5);

    /**
     * ⭐ The reserve rule's guarantee, end to end: whatever the deal, at least one card in the
     * open hand is affordable, so a coach can never reach a hand he cannot answer.
     */
    const pickable = veil.getByRole("button", { name: /^Choose / }).and(page.locator(":enabled"));
    await expect(pickable.first()).toBeVisible();
  });

  test("a pick spends the budget", async ({ page }) => {
    await page.goto("/game/budget");
    await page.getByRole("button", { name: /^Lock in / }).click();

    const spent = async () =>
      ((await page.getByTestId("budget-meter").first().textContent()) ?? "").replace(/\s+/g, " ");
    const before = await spent();

    await page
      .getByRole("button", { name: /empty\. Choose a player/ })
      .first()
      .click();
    const veil = page.getByRole("dialog", { name: /Choose your/ });
    await veil
      .getByRole("button", { name: /^Choose / })
      .and(page.locator(":enabled"))
      .first()
      .click();

    // The meter is DERIVED from the picks, so it must move the moment one is made.
    await expect.poll(async () => (await spent()) !== before, { timeout: 5000 }).toBe(true);
  });

  test("a filled position re-opens with the fee back on the table, and a way out", async ({
    page,
  }) => {
    /**
     * ⛔ THE DEAD END this closes (owner report, 2026-08-26). With the squad full and a little
     * change left, tapping a filled position dealt a hand in which every card was priced out —
     * the man being replaced was still counted as spent — and a round carries no close
     * control. There was no way out of the page at all.
     *
     * ⚠️ Asserted on ONE pick, not a full sixteen. The arithmetic is the same either way (the
     * ceiling must come back to exactly what it was), and clicking sixteen positions through a
     * real browser buys a minute of runtime and no extra coverage.
     */
    await page.goto("/game/budget");
    await page.getByRole("button", { name: /^Lock in / }).click();

    const ceiling = async () => {
      const text = (await page.getByTestId("budget-meter").first().textContent()) ?? "";
      return /£([\d.]+)m spendable/.exec(text)?.[1];
    };

    await page
      .getByRole("button", { name: /empty\. Choose a player/ })
      .first()
      .click();
    const before = await ceiling();
    await page
      .getByTestId("pd-veil")
      .getByRole("button", { name: /^Choose / })
      .and(page.locator(":enabled"))
      .first()
      .click();

    // The same position, now filled.
    await page
      .getByRole("button", { name: /View card/ })
      .first()
      .click();
    const veil = page.getByTestId("pd-veil");
    await expect(veil.getByRole("heading")).toHaveText(/^Change your/);
    await expect(veil.getByTestId("pd-current-mark")).toBeVisible();
    // Dropping him costs nothing, so his own card is never priced out of his own slot.
    await expect(veil.getByTestId("pd-drop")).toBeEnabled();
    await expect.poll(ceiling).toBe(before);

    // ⭐ And it can be LEFT. Before the fix there was no control here of any kind.
    await veil.getByTestId("veil-back").click();
    await expect(veil).toHaveCount(0);
  });
});
