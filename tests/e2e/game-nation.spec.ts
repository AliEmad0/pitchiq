// ⚠️ `test`/`expect` come from the local helper, NEVER from @playwright/test — a click
// dispatched before hydration is silently swallowed (no router exists to handle it), and no
// timeout can rescue an interaction that never issued a request.
import { expect, test } from "./_helpers/test";

test.describe("Nationality Draft", () => {
  test("the gate opens the mode, its format, then the nation menu", async ({ page }) => {
    await page.goto("/game");
    await page.getByRole("button", { name: /Nationality Draft/ }).click();
    await page.getByRole("link", { name: /One Match/ }).click();
    await expect(page).toHaveURL(/\/game\/nation$/);
    // The menu is grouped by continent and Egypt — the owner's own example — is offerable.
    await expect(page.getByRole("heading", { name: /Nationality Draft/ })).toBeVisible();
    await expect(page.getByTestId("nation-tile").first()).toBeVisible();
  });

  test("Egypt drafts, and a thin position's hand arrives WIDENED and says so", async ({ page }) => {
    /**
     * Egypt is empty at GK across the whole archive's measurement window — the exact case
     * the owner described. The GK round must deal a non-Egyptian hand carrying the ring
     * line and a chip per card, which is the ticket's "the ring must be VISIBLE".
     */
    await page.goto("/game/nation/eg");

    // ⭐ WHO YOU FACE lists NATIONS, not clubs (owner, 2026-08-27) — preselected on Egypt
    // itself, with France somewhere in the menu and Arsenal nowhere. Asserted BEFORE the
    // lock-in: the picker lives on the shape bar, which the lock dismisses.
    const picker = page.locator("select.pd-select");
    await expect(picker).toHaveValue("eg");
    await expect(picker.locator('option[value="fr"]')).toHaveCount(1);
    await expect(picker.locator("option", { hasText: "Arsenal" })).toHaveCount(0);

    await page.getByRole("button", { name: /^Lock in / }).click();
    await page.getByRole("button", { name: /^GK, empty/ }).click();

    const veil = page.getByTestId("pd-veil");
    await expect(veil).toBeVisible();
    await expect(veil.getByTestId("pd-ring-line")).toContainText(/Egypt/);
    const chips = veil.getByTestId("pd-ring-chip");
    await expect(chips.first()).toBeVisible();
    // No 80+ promise — the pack ships no standout, and the copy is keyed on the pack.
    await expect(veil).not.toContainText(/rated 80/);
  });

  test("France drafts all-nation — no ring furniture on a deep position", async ({ page }) => {
    // The control on the real surface: France fills every role five-deep, so its rounds
    // must look exactly like Legacy's — no line, no chips.
    await page.goto("/game/nation/fr");
    await page.getByRole("button", { name: /^Lock in / }).click();
    await page.getByRole("button", { name: /^GK, empty/ }).click();
    const veil = page.getByTestId("pd-veil");
    await expect(veil).toBeVisible();
    await expect(veil.getByTestId("pd-candidate").first()).toBeVisible();
    await expect(veil.getByTestId("pd-ring-line")).toHaveCount(0);
    await expect(veil.getByTestId("pd-ring-chip")).toHaveCount(0);
  });

  test("an invented nation code 404s without rendering", async ({ page }) => {
    // `dynamicParams = false` — a crawler walking invented codes must never run a build.
    const response = await page.goto("/game/nation/zz", { waitUntil: "commit" });
    expect(response?.status()).toBe(404);
  });
});
