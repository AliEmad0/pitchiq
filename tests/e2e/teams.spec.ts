import { test, expect } from "@playwright/test";

// TASK-311 — index → detail navigation, offline against MSW.
// The Playwright web-server is started with TEST_MSW=1, which makes
// `src/instrumentation.ts` boot the Node-side MSW handlers in
// `tests/msw/handlers.ts` so wire outbound calls resolve from
// the canned mocks instead of the upstream. Required because the free
// tier's daily quota and per-minute rate-limit make wall-clock E2Es
// flaky against the real API.

test.describe("Teams index → detail navigation", () => {
  test("filters the grid and navigates to the team profile, rendering a squad member", async ({
    page,
  }) => {
    // Step 1: land on the index.
    await page.goto("/teams");
    await expect(
      page.getByRole("heading", { level: 1, name: /Premier League clubs/i }),
    ).toBeVisible();

    // snapshot standings data includes the real PL clubs — assert at least
    // the canonical ones are linkable so the grid render is verified
    // before we drill in.
    await expect(page.getByRole("link", { name: "Manchester United" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Liverpool" })).toBeVisible();

    // Step 2: type into the filter input; the grid should narrow to one
    // result and the URL should pick up `?q=`.
    await page.getByLabel("Filter clubs").fill("Manchester U");
    await expect(page.getByRole("link", { name: "Manchester United" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Liverpool" })).toHaveCount(0);
    await expect(page).toHaveURL(/\?q=Manchester\+U/);

    // Step 3: click the surviving tile and assert the team profile page
    // rendered the hero name + at least one squad member (per the AC's
    // "non-trivial DOM element" requirement). The squad section streams
    // under its own Suspense boundary, so `getByText(...)` will wait for
    // it.
    await page.getByRole("link", { name: "Manchester United" }).click();
    await expect(page).toHaveURL(/\/teams\/33/);
    await expect(page.getByRole("heading", { level: 1, name: "Manchester United" })).toBeVisible();

    // Squad member from the snapshot squad data — the profile defaults to the
    // latest committed season (2025-26 since TASK-1203), so `Bryan Mbeumo` is
    // the canonical assertion (a 2025-26 Man Utd squad member). `SquadGrid`
    // mounts both a mobile-tabs tree (`md:hidden`, first in DOM order) and a
    // desktop columns tree (`hidden md:grid`, second). At Playwright's "Desktop
    // Chrome" viewport the mobile one is `display:none`, so we want the *second*
    // occurrence — `.last()` over `.first()`.
    await expect(page.getByText("Bryan Mbeumo").last()).toBeVisible();

    // Sanity-check the stats tiles section also rendered with real snapshot
    // data (Manchester United 2025-26 Goals for: 69 from standings-2025.json).
    // Scope to the `Season statistics` landmark region so the assertion
    // doesn't pick up stray "69" substrings elsewhere on the page.
    const statsRegion = page.getByRole("region", { name: "Season statistics" });
    await expect(statsRegion.getByText("Goals for")).toBeVisible();
    await expect(statsRegion.getByText("69")).toBeVisible();
  });

  // TASK-M09: navigation preserves the viewing season. From a HISTORICAL season's
  // squad, clicking a player must carry `?season=` to the profile so it renders
  // that season's data instead of falling back to the current season's
  // <DataUnavailable> card.
  test("preserves a historical season when navigating from a squad to a player", async ({
    page,
  }) => {
    // Arsenal (42) at 2011-12 — a season with committed squad data.
    await page.goto("/teams/42?season=2011");
    await expect(page.getByRole("heading", { level: 1, name: "Arsenal" })).toBeVisible();

    // TASK-M10: the page-local season control reflects the viewed season and is
    // the only "Season" combobox (the global header switcher hides on entity
    // pages). Arsenal is an ever-present club, so it's a multi-season dropdown.
    const seasonControl = page.getByRole("combobox", { name: "Season" });
    await expect(seasonControl).toHaveCount(1);
    await expect(seasonControl).toContainText("2011-12");

    // A visible squad player link must already carry ?season=2011 in its href.
    const playerLink = page.locator('a[href*="/players/"]:visible').first();
    await expect(playerLink).toHaveAttribute("href", /\/players\/\d+\?season=2011$/);

    // Clicking it lands on the player profile for that season (no empty-state).
    await playerLink.click();
    await expect(page).toHaveURL(/\/players\/\d+\?season=2011$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  // TASK-M51: a legacy (1992-2007) season now shows the team's manager, derived
  // from the Wikipedia manager table + committed fixtures.
  test("shows the team's manager on a legacy season", async ({ page }) => {
    await page.goto("/teams/33?season=1993");
    await expect(page.getByRole("heading", { level: 1, name: "Manchester United" })).toBeVisible();
    await expect(page.getByText("Alex Ferguson").first()).toBeVisible();
  });

  // TASK-M71c: the page is now prerendered and the season swap is client-side.
  // A `?season=` deep link must still render that season's content — including
  // on /ar, which exercises the locale-in-Route-Handler path. Assert on
  // RENDERED structure, never raw HTML greps (next-intl serialises the whole
  // catalog into every page). The entity page has exactly one combobox (the
  // global header switcher hides on detail routes).
  test("a ?season= deep link renders that season client-side (ar too)", async ({ page }) => {
    await page.goto("/ar/teams/42?season=2003");
    // The mount effect swaps to 2003 (fetching the ar season-view); the season
    // control reflects it in Eastern-Arabic digits.
    await expect(page.getByRole("combobox")).toContainText("٢٠٠٣");
    // The swapped 2003 squad renders — its player links carry ?season=2003.
    // SquadGrid mounts a mobile (md:hidden) + desktop tree; take the visible one.
    await expect(
      page.locator('a[href*="/players/"][href*="season=2003"]:visible').first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/season=2003/);
  });
});
