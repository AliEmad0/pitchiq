import { expect, test } from "./_helpers/test";

// TASK-1704 — soft-rise entrance/scroll reveal. The pre-paint gate stamps
// <html data-reveal-ready>, the controller stamps data-reveal-live and marks
// [data-reveal] elements with data-revealed as they enter the viewport; CSS
// plays the rise. Reduced motion never stamps the gate → nothing is hidden.
//
// The boot loader is skipped via its session flag so its ~3.6s scroll-locked
// life (which deliberately defers reveals) doesn't slow these tests.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("pitchiq:booted", "1"));
});

test.describe("scroll reveal", () => {
  test("reveals above-fold content on load and below-fold content on scroll", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-reveal-ready", "");
    await expect(page.locator("html")).toHaveAttribute("data-reveal-live", "");

    // Above the fold: the dashboard hero header reveals on hydration.
    const hero = page.locator("header[data-reveal]").first();
    await expect(hero).toHaveAttribute("data-revealed", "");
    await expect(hero).toHaveCSS("opacity", "1");

    // Below the fold: the trivia block stays un-revealed (opacity 0) until a
    // real user scroll brings it into view (the 1702 lesson: probe scroll
    // behaviour with a trusted mouse.wheel, not programmatic scrollTo).
    const below = page.locator("main [data-reveal]").last();
    await expect(below).not.toHaveAttribute("data-revealed", "");
    await expect(below).toHaveCSS("opacity", "0");

    for (let i = 0; i < 14; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(60);
    }
    await expect(below).toHaveAttribute("data-revealed", "");
    await expect(below).toHaveCSS("opacity", "1");
  });

  test("client-side navigation reveals the incoming page's content", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-reveal-live", "");
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Teams" })
      .click();
    await expect(page).toHaveURL(/\/teams/);
    // The MutationObserver picks up the swapped route content — the club cards
    // arrive with data-reveal and get revealed in view.
    await expect
      .poll(async () => page.locator("li[data-reveal][data-revealed]").count(), {
        timeout: 30_000,
      })
      .toBeGreaterThanOrEqual(10);
  });

  test("reduced motion: the gate never stamps and nothing is ever hidden", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveAttribute("data-reveal-ready", "");
    // Targets are fully visible without any reveal marking.
    const hero = page.locator("header[data-reveal]").first();
    await expect(hero).toHaveCSS("opacity", "1");
    const below = page.locator("main [data-reveal]").last();
    await expect(below).toHaveCSS("opacity", "1");
  });
});
