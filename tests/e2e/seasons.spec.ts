import { expect, test } from "@playwright/test";

// TASK-M71a — the season path model: /seasons directory, /seasons/<year>
// pages, and the edge redirects that keep the current season single-URL.

test("the seasons directory lists every season and links to it", async ({ page }) => {
  await page.goto("/seasons");
  const links = page.locator('a[href^="/seasons/"]');
  expect(await links.count()).toBeGreaterThanOrEqual(33);
});

test("a season card navigates to that season's page", async ({ page }) => {
  await page.goto("/seasons");
  // The first card is the current season, whose path form redirects to `/` —
  // click a historical one instead so the URL assertion is meaningful.
  const link = page.locator('a[href="/seasons/2003"]');
  await link.scrollIntoViewIfNeeded();
  // The depth-arrival reveal keeps the card mid-3D-transition (with a stagger
  // DELAY during which its box looks stable) — a click computed then lands on
  // the pre-transition position and misses. Wait until the cell's transition
  // has actually finished (transform back to none, fully opaque).
  await page.waitForFunction(() => {
    const cell = document.querySelector('a[href="/seasons/2003"]')?.closest("[data-reveal-depth]");
    if (!cell) return false;
    const cs = getComputedStyle(cell);
    return cs.opacity === "1" && cs.transform === "none";
  });
  await link.click();
  await expect(page).toHaveURL(/\/seasons\/2003$/);
});

test("a season page renders that season's standings", async ({ page }) => {
  await page.goto("/seasons/2003");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("2003");
});

// Next forwards the incoming query onto the redirect destination and config
// redirects cannot strip it — the trailing ?season= is expected (the page
// ignores it and self-canonicalises to the bare path).
test("?season= redirects to the path form", async ({ page }) => {
  await page.goto("/?season=2010");
  await expect(page).toHaveURL(/\/seasons\/2010(\?season=2010)?$/);
});

test("the current season's path form redirects to /", async ({ page }) => {
  await page.goto("/seasons/2025");
  await expect(page).toHaveURL(/\/$/);
});

// TASK-M72 landed real 404s: an ungenerated year falls through to the
// catch-all (dynamicParams=false) and, with no loading boundary flushing an
// early 200 shell, the notFound() sets a real 404 with the VAR panel.
test("an unknown season returns 404 with the not-found page", async ({ page }) => {
  const res = await page.goto("/seasons/1985");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Page not found");
  await expect(page.locator("#standings")).toHaveCount(0);
});

test("/ar renders a season page RTL with Arabic content", async ({ page }) => {
  await page.goto("/ar/seasons/2003");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  // Assert on rendered text, never by grepping HTML: next-intl serialises the
  // whole message catalog into every page, so a grep matches regardless.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

// TASK-M25 under the path model: header links keep carrying the viewed season
// from a CLEAN /seasons/<year> URL (no lingering ?season= to lean on).
test("the header nav carries the season from a clean season path", async ({ page }) => {
  await page.goto("/seasons/2003");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await nav.getByRole("link", { name: "Teams", exact: true }).click();
  await expect(page).toHaveURL(/\/teams\?season=2003$/);
});
