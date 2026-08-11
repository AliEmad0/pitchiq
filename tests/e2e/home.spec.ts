import { test, expect } from "./_helpers/test";

// The dashboard h1 has been "Premier League {season}–{endYear}" since the
// TASK-207 composition landed. The brand text "PitchIQ" lives in the
// header link, which is covered by the AppShell describe block below.

test.describe("AppShell (TASK-106)", () => {
  test("home page renders Header + Footer", async ({ page }) => {
    await page.goto("/");

    // Header brand link (separate from the page h1)
    await expect(page.getByRole("link", { name: /PitchIQ/i }).first()).toBeVisible();

    // Primary nav — scoped to the header's "Primary" landmark (the multi-column
    // footer now also links Teams/Compare, so an unscoped query is ambiguous).
    const primaryNav = page.getByRole("navigation", { name: "Primary" });
    await expect(primaryNav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(primaryNav.getByRole("link", { name: "Teams" })).toBeVisible();
    await expect(primaryNav.getByRole("link", { name: "Compare" })).toBeVisible();

    // Footer tagline (TASK-912 rebrand — "PitchIQ — Premier League, decoded.
    // Refreshed daily."; TASK-609 had already dropped the legacy wire
    // attribution since snapshot datasets don't require it).
    await expect(page.getByText(/Premier League, decoded/i)).toBeVisible();
  });

  test("404 page still renders the not-found UI inside Header + Footer", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");

    // Under i18n routing (TASK-1601) an unknown path is caught by the
    // `[locale]/[...rest]` catch-all → `notFound()` → `[locale]/not-found.tsx`,
    // which renders inside `[locale]/layout.tsx` (the full shell). We assert the
    // rendered 404 UI + shell — a stronger check than a bare status code, and the
    // right one here: the localized soft-404 streams HTTP 200 on the dev server
    // (the `[locale]/loading.tsx` Suspense boundary flushes first) while a
    // production build buffers and returns 404. The "Page not found" heading
    // proves this is the not-found page and not an accidentally-rendered route.
    await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();

    // AppShell wraps the localized 404 too (header brand link + footer tagline).
    await expect(page.getByRole("link", { name: /PitchIQ/i }).first()).toBeVisible();
    await expect(page.getByText(/Premier League, decoded/i)).toBeVisible();
  });
});
