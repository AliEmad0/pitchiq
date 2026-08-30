import { expect, test } from "./_helpers/test";
import { ARABIC_ENABLED, ARABIC_PARKED } from "./_helpers/locales";

// Every case in this file asserts Arabic OUTPUT, so the suite is gated as a whole rather
// than deleted - it is the record of what "Arabic works" means. See _helpers/locales.ts.
test.skip(!ARABIC_ENABLED, ARABIC_PARKED);

// TASK-1606 (Plan A) — Arabic entity-name data on /ar.
// Positions + the seeded Manchester United club name are the deterministic,
// no-external-dependency proof that the data (not just the UI chrome) is Arabic.

test("/ar renders the seeded Arabic club name in the standings table", async ({ page }) => {
  await page.goto("/ar?season=2024");
  await expect(page.getByText("مانشستر يونايتد").first()).toBeVisible();
});

test("/ar renders an Arabic name + position on a player profile", async ({ page }) => {
  // Mohamed Salah (id 1001119) → محمد صلاح, a Forward → مهاجم.
  await page.goto("/ar/players/1001119?season=2024");
  await expect(page.getByText("محمد صلاح").first()).toBeVisible();
  await expect(page.getByText("مهاجم").first()).toBeVisible();
});

/**
 * TASK-M89 — the /ar entity DETAIL pages shipped the ENGLISH UI catalog.
 *
 * ⚠️ The two tests above did NOT catch it, and that is the lesson: they assert
 * Arabic *entity data* (اسم اللاعب، المركز), which is resolved by
 * `getEntityNames(locale)` from an EXPLICIT locale argument and kept working
 * throughout. The broken thing was every string from the *message catalog*,
 * which resolves from the request context. So a detail page rendered the Arabic
 * player NAME inside a fully English UI, and a data-only assertion passed.
 *
 * These assert a UI string instead — one that can only come from `ar.json`.
 */
test("/ar entity detail pages render the Arabic UI catalog, not just Arabic data", async ({
  page,
}) => {
  await page.goto("/ar/managers/134");
  await expect(page.getByText("ملف المدرب").first()).toBeVisible();
  await expect(page.getByText("Manager profile")).toHaveCount(0);

  await page.goto("/ar/players/1001119");
  await expect(page.getByText(/ملف اللاعب/).first()).toBeVisible();
});

test("/en keeps the Latin club name (data untranslated)", async ({ page }) => {
  await page.goto("/?season=2024");
  await expect(page.getByText("Manchester United").first()).toBeVisible();
  await expect(page.getByText("مانشستر يونايتد")).toHaveCount(0);
});
