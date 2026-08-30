import { expect, test } from "./_helpers/test";
import { ARABIC_ENABLED, ARABIC_PARKED } from "./_helpers/locales";

// TASK-M72 — unknown URLs must be REAL 404s. Every one of these returned
// HTTP 200 before the fix: any `loading.tsx` boundary above a segment lets
// Next flush the 200 shell before the page's notFound() runs, so the status
// could never change (Next could only inject a noindex meta afterwards).
// The fix removed those boundaries, so the render — and its notFound() —
// completes BEFORE the response commits.

test("an unknown path returns 404 with the VAR panel inside the shell", async ({ page }) => {
  const res = await page.goto("/this-does-not-exist");
  expect(res?.status()).toBe(404);
  // The localized not-found page renders INSIDE the app shell — chrome intact.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Page not found");
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
});

test("an unknown player id returns 404", async ({ page }) => {
  const res = await page.goto("/players/999999999");
  expect(res?.status()).toBe(404);
});

test("an unknown team id returns 404", async ({ page }) => {
  const res = await page.goto("/teams/999999999");
  expect(res?.status()).toBe(404);
});

test("an unknown manager id returns 404", async ({ page }) => {
  const res = await page.goto("/managers/no-such-manager");
  expect(res?.status()).toBe(404);
});

test("an unknown fixture id returns 404", async ({ page }) => {
  const res = await page.goto("/fixtures/2003-01-01-XXX-YYY");
  expect(res?.status()).toBe(404);
});

test("/ar renders the 404 localized and RTL", async ({ page }) => {
  test.skip(!ARABIC_ENABLED, ARABIC_PARKED);
  const res = await page.goto("/ar/this-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  // Assert the RENDERED Arabic copy (never grep raw HTML — next-intl
  // serialises the whole catalog into every page).
  await expect(page.getByRole("heading", { level: 1 })).toContainText("الصفحة غير موجودة");
});

// Controls — the 404 machinery must not swallow real pages.
test("real pages still return 200", async ({ page }) => {
  for (const path of ["/", "/seasons/2003", "/teams/42"]) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} should be 200`).toBe(200);
  }
});
