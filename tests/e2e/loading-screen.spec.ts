import { expect, test, waitForAppRouter } from "./_helpers/test";
import { ARABIC_ENABLED, ARABIC_PARKED } from "./_helpers/locales";

// TASK-1702 — neon wordmark-draw boot loader. Shows once per browser session
// (each Playwright test gets a fresh context → fresh session), locks scrolling
// while it plays (`.boot-lock` on <html>), auto-dismisses via CSS `forwards`
// (no JS dependency for the dismiss), static frame under reduced motion.
const LOADER = "#boot-loader";

test.describe("boot loader", () => {
  test("appears on first load, locks scroll, auto-dismisses, then unlocks", async ({ page }) => {
    // `commit` resolves at first byte so we catch the loader early in its
    // ~3.6s lifetime even on a slow dev-server compile.
    await page.goto("/", { waitUntil: "commit" });
    const loader = page.locator(LOADER);
    await expect(loader).toBeVisible();
    await expect(loader.locator(".boot-neon-text")).toHaveText("PitchIQ");
    // Scroll locked while the boot plays: no scrollbar, no scrolling.
    await expect(page.locator("html")).toHaveClass(/boot-lock/);
    await expect(loader).toBeHidden({ timeout: 10_000 });
    await expect(page.locator("html")).not.toHaveClass(/boot-lock/, { timeout: 10_000 });
    // App interactive after dismissal. These specs load with `waitUntil:
    // "commit"` to catch the overlay mid-flight, which opts them out of the
    // fixture's hydration gate — so gate explicitly before the nav click.
    await waitForAppRouter(page);
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Teams" })
      .click();
    await expect(page).toHaveURL(/\/teams/);
  });

  test("does not re-appear on a reload in the same session", async ({ page }) => {
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.locator(LOADER)).toBeVisible();
    await expect(page.locator(LOADER)).toBeHidden({ timeout: 10_000 });
    await page.reload();
    // The inline gate script stamps <html data-booted> BEFORE first paint and
    // CSS hides the overlay (it must stay in the DOM — React re-inserts a
    // pre-hydration removal). No scroll lock on a gated load either.
    await expect(page.locator("html")).toHaveAttribute("data-booted", "1");
    await expect(page.locator(LOADER)).toBeHidden();
    await expect(page.locator("html")).not.toHaveClass(/boot-lock/);
  });

  test("draws the Nastaliq lockup on /ar (owner pick — matches the header)", async ({ page }) => {
    test.skip(!ARABIC_ENABLED, ARABIC_PARKED);
    await page.goto("/ar", { waitUntil: "commit" });
    const loader = page.locator(LOADER);
    await expect(loader).toBeVisible();
    await expect(loader.locator(".boot-neon-ar")).toContainText("بيتش");
    await expect(loader.locator(".boot-neon-ar")).toContainText("آي كيو");
    await expect(loader).toBeHidden({ timeout: 10_000 });
  });

  test("reduced motion gets a static branded frame that still dismisses + unlocks", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "commit" });
    const text = page.locator(".boot-neon-text");
    // Static frame: the draw animation is disabled (CSS assertions work on
    // hidden elements too, so this can't race the quicker dismiss).
    await expect(text).toHaveCSS("animation-name", "none");
    await expect(page.locator(LOADER)).toBeHidden({ timeout: 10_000 });
    await expect(page.locator("html")).not.toHaveClass(/boot-lock/, { timeout: 10_000 });
  });
});
