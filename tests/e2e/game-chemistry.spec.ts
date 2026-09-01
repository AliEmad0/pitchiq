// ⚠️ `test`/`expect` come from the local helper, NEVER from @playwright/test. The helper
// waits for the App Router to mount; without it a click dispatched pre-hydration is
// silently swallowed — React suppresses the default action but no router exists to handle
// it, so no RSC request is ever issued and no timeout value can rescue it.
import { expect, test } from "./_helpers/test";

const TIERS = ["none", "nation", "club", "teammates"];

test.describe("Chemistry Draft", () => {
  test("the gate opens the mode, then its format", async ({ page }) => {
    await page.goto("/game");

    /**
     * ⚠️ A TILE, then a FORMAT — not a direct link, for the same reason as Budget Cap:
     * `isDirectEntry` only collapses the step for a mode with exactly ONE applicable format,
     * and chemistry has two (`single` live, `season` planned for TASK-1811).
     */
    await page.getByRole("button", { name: /Chemistry Draft/ }).click();
    await page.getByRole("link", { name: /One Match/ }).click();
    await expect(page).toHaveURL(/\/game\/chemistry$/);
  });

  test("locking a shape draws the link graph over the pitch", async ({ page }) => {
    await page.goto("/game/chemistry");
    await page.getByRole("button", { name: /^Lock in / }).click();

    /**
     * ⭐ The adjacency graph reached the browser. Asserted as the measured 14–25 band
     * (spec §0.4) rather than the 4-4-2 Flat golden of 23 — the exact pair list is already
     * pinned in `tests/unit/pitch-adjacency.test.ts`, and a band survives the default shape
     * changing under it while a collapse to zero connectors still cannot hide.
     */
    const links = page.getByTestId("chem-link");
    await expect(links.first()).toBeAttached();
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(14);
    expect(count).toBeLessThanOrEqual(25);

    // Every connector is TIERED — an untiered line would draw a link that means nothing.
    const tiers = await links.evaluateAll((els) => els.map((e) => e.getAttribute("data-tier")));
    expect(tiers.filter((t) => t != null && TIERS.includes(t))).toHaveLength(count);

    // An empty XI has no pairs to link, so the meter opens with nothing to show.
    const meter = page.getByTestId("chem-meter");
    await expect(meter).toBeVisible();
    await expect(meter).toContainText(/No links yet/);
  });

  test("a card's advertised delta is exactly what the meter pays", async ({ page }) => {
    /**
     * ⭐ THE MODE'S PROMISE, end to end: the badge on a candidate tells the coach what that
     * card would ADD, and taking it moves the meter by precisely that much. This also proves
     * in a REAL browser what the unit suite can only assert as a style — that the full-pitch
     * SVG connector layer does not eat the clicks. Every pick below goes through a pitch spot
     * underneath that layer, so if it ever took a hit this test cannot open a round at all.
     *
     * ⛔ Asserted as an EQUALITY on a POSITIVE delta, not as "the score went up". Measured
     * over 600 rooms on the real pool with realistic uint32 seeds (`randomSeed()` spans the
     * full space, and the deal is NOT seeded from the URL): a coach who just takes the first
     * card in every hand still ends on a non-zero score in 596 of them. So "pick, then expect
     * the meter above zero" would keep passing with the delta badges rendering all zeroes —
     * it would test that chemistry accrues, which the unit suite already pins, and NOT that
     * steering by the badges works.
     *
     * Requiring a positive delta is what makes it bite, and it is safe: a hand offering one
     * appeared by the 7th slot in 600 of 600 rooms, and by the 3rd in the median room.
     */
    await page.goto("/game/chemistry");
    await page.getByRole("button", { name: /^Lock in / }).click();

    const score = async () => {
      const text = (await page.getByTestId("chem-meter").textContent()) ?? "";
      return Number(/^\s*(\d+)/.exec(text)?.[1] ?? "-1");
    };
    expect(await score()).toBe(0);

    const veil = page.getByTestId("pd-veil");
    let advertised = 0;
    let before = -1;
    let after = -1;

    for (let round = 0; round < 11 && advertised === 0; round++) {
      await page
        .getByRole("button", { name: /empty\. Choose a player/ })
        .first()
        .click();
      await expect(veil).toBeVisible();

      const candidates = veil.getByTestId("pd-candidate");
      await expect(candidates).toHaveCount(5);

      // ⭐ Every candidate carries what it would ADD — including the zeroes, so "this one
      // buys you nothing" reads as clearly as "+7".
      await expect(veil.getByTestId("chem-delta")).toHaveCount(5);
      const deltas = await candidates.evaluateAll((els) =>
        els.map((el) =>
          Number(el.querySelector("[data-testid=chem-delta]")?.getAttribute("data-delta") ?? "0"),
        ),
      );

      const best = Math.max(...deltas);
      before = await score();
      await candidates
        .nth(deltas.indexOf(best))
        .getByRole("button", { name: /^Choose / })
        .click();
      await expect(veil).toHaveCount(0);

      // Until a hand offers a link the walk is just filling slots to create neighbours.
      if (best > 0) {
        advertised = best;
        after = await score();
      }
    }

    // ⛔ The badges promised something. All-zero deltas — a broken or unwired `chemDelta` —
    // land here, and this is the assertion that a "meter went up" test would sleep through.
    expect(advertised).toBeGreaterThan(0);
    // ⭐ And the meter paid EXACTLY that. Both sides are the same rounded display score, so
    // this is an equality rather than a tolerance: the badge is the promise, the meter is the
    // settlement, and a badge that overstates its card is the defect this catches.
    expect(after).toBe(before + advertised);

    // The score is explained in WORDS too, so the three link states stay legible without
    // colour vision and the number reads as explicable rather than as a verdict.
    await expect(page.getByTestId("chem-meter")).toContainText(
      /teammate pair|club link|countryman link/,
    );
  });
});
