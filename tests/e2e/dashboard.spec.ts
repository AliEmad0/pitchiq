import { test, expect } from "./_helpers/test";

import { expectCssColorInRange, getCssVar } from "./_helpers/visual-assertions";

// TASK-211 / TASK-508 — dashboard happy-path, against committed snapshot data.
// The Playwright web-server is started with TEST_MSW=1 (legacy env var; the
// MSW handler set is empty since TASK-505/506/507 migrated all fetchers to
// `src/data/loaders.ts`). After TASK-508 the dashboard fixture-rail cards
// link to real snapshot string ids (e.g. `/fixtures/2024-08-16-MUN-FUL`) and
// the detail page renders — this test asserts on that round-trip.

test.describe("Dashboard happy-path", () => {
  test("renders the season header, the dashboard sections, leaderboard content, a fixture team name, and navigates to a fixture detail page", async ({
    page,
  }) => {
    await page.goto("/");

    // The h1 includes the season — keep the regex season-agnostic so the
    // assertion survives the default season advancing. (The default is the
    // latest committed season, 2025-26 since TASK-1203, rendered as
    // "Premier League 2025–26".)
    await expect(page.getByRole("heading", { level: 1, name: /^Premier League/i })).toBeVisible();

    // Section headings from the TASK-207 layout. Each is an <h2> with the
    // heading text as its accessible name (the icon next to it is aria-hidden
    // so it doesn't pollute the name). On a completed season (the default
    // 2025-26 is finished in real time): "Upcoming Fixtures" is hidden
    // (TASK-M13) and "Recent Results" is replaced by "Classic Matches"
    // (TASK-M14).
    for (const sectionName of [
      "Standings",
      "Top Scorers",
      "Top Assists",
      "Yellow Cards",
      "Red Cards",
      "Fixtures", // M21: the Classic-Matches section heading is now "Fixtures"
    ]) {
      await expect(page.getByRole("heading", { level: 2, name: sectionName })).toBeVisible();
    }

    // M21: each leaderboard heading (Top Scorers/Assists/Yellow/Red) carries a
    // "See all →" link to /leaderboards — at least 4 on the default ended season.
    const leaderboardSeeAll = page.locator('a[href^="/leaderboards"]:has-text("See all")');
    expect(await leaderboardSeeAll.count()).toBeGreaterThanOrEqual(4);

    // TASK-M13: a completed season shows no Upcoming Fixtures section at all
    // (not an empty rail, and not the old SeasonEndedCard).
    await expect(page.getByRole("heading", { level: 2, name: "Upcoming Fixtures" })).toHaveCount(0);
    // TASK-M14: Recent Results is replaced by Classic Matches on ended seasons.
    await expect(page.getByRole("heading", { level: 2, name: "Recent Results" })).toHaveCount(0);

    // TASK-M14: the Classic Matches rail renders cards, each with a contextual
    // catalyst badge (e.g. "7-Goal Thriller" / "Title-Race Decider").
    const classicRail = page.getByRole("list", { name: /classic matches/i });
    await expect(classicRail).toBeVisible();
    await expect(
      classicRail.getByText(/Thriller|Comeback|Title-Race Decider|Relegation Battle|Marquee Clash/),
    ).not.toHaveCount(0);

    // Leaderboard content streams in under <Suspense>. The dashboard defaults
    // to the latest committed season (2025-26 since TASK-1203), whose rank-1
    // top scorer is Erling Haaland. `.first()` because the same player can
    // appear across multiple leaderboards.
    await expect(page.getByText("Erling Haaland").first()).toBeVisible();

    // A well-known club renders on the dashboard (standings + the surviving
    // Recent Results rail). `.first()` because the same club appears in both.
    await expect(page.getByText("Manchester United").first()).toBeVisible();

    // --- Stage 4: fixture-rail navigation -----------------------------
    // Click the first card in either rail and assert the detail page
    // renders. TASK-508 closed the djb2 hash window — these links go
    // to real snapshot fixture ids, not 404s.
    const firstFixtureLink = page.locator('a[href^="/fixtures/"]').first();
    await expect(firstFixtureLink).toBeVisible();
    await firstFixtureLink.click();

    // URL pattern matches snapshot string ids: YYYY-MM-DD-HHH-AAA
    await expect(page).toHaveURL(/\/fixtures\/\d{4}-\d{2}-\d{2}-[A-Z]{3}-[A-Z]{3}$/);

    // Fixture detail renders the three tab triggers (Lineups / Events /
    // Statistics). The "Statistics" tab is the default after TASK-508.
    await expect(page.getByRole("tab", { name: "Statistics" })).toBeVisible();

    // Verify we're not back on the dashboard — the h1 "Premier League …"
    // is only present on the dashboard page.
    await expect(page.getByRole("heading", { level: 1, name: /^Premier League/i })).toHaveCount(0);
  });

  // TASK-1103 — the trivia card renders league facts below the primary content,
  // and "Surprise me!" cycles to a different fact (provable engine, 2025-26 data
  // yields several league facts so the shuffle control is present).
  test("trivia card renders and 'Surprise me' cycles the fact", async ({ page }) => {
    await page.goto("/");
    const card = page.getByRole("region", { name: /did you know/i });
    await expect(card).toBeVisible();

    const fact = card.locator(".trivia-fact").first();
    const before = (await fact.textContent())?.trim();
    expect(before && before.length > 0).toBeTruthy();

    await card.getByRole("button", { name: /surprise me/i }).click();
    await expect.poll(async () => (await fact.textContent())?.trim()).not.toBe(before);
  });

  // TASK-606 — team names/logos across the dashboard link to `/teams/[id]`.
  // Asserts two distinct nav paths: the standings table and the fixtures rail.
  test("team links on the dashboard navigate to the team profile", async ({ page }) => {
    // --- Path 1: standings table team cell ----------------------------
    await page.goto("/");
    const standingsTeamLink = page.locator('table a[href^="/teams/"]').first();
    await expect(standingsTeamLink).toBeVisible();
    await standingsTeamLink.click();
    await expect(page).toHaveURL(/\/teams\/\d+\?season=\d+$/);
    // Left the dashboard — its "Premier League …" h1 is gone.
    await expect(page.getByRole("heading", { level: 1, name: /^Premier League/i })).toHaveCount(0);

    // --- Path 2: fixtures rail team chip ------------------------------
    // On the completed default season this is the Classic Matches rail
    // (TASK-M14); on an in-progress season it would be Recent Results. Match
    // either so the test survives the default season advancing.
    await page.goto("/");
    const fixturesRail = page.getByRole("list", { name: /classic matches|recent results/i });
    const railTeamLink = fixturesRail.getByRole("link", { name: /view .* page/i }).first();
    await expect(railTeamLink).toBeVisible();
    await railTeamLink.click();
    await expect(page).toHaveURL(/\/teams\/\d+\?season=\d+$/);
  });

  // TASK-911 — visual-regression net. Computed-style assertions that unit tests
  // (which only see class names) can't catch: the standings color-coding saga
  // (#92-#95) + a lock on the TASK-909 brand palette. Playwright renders the
  // LIGHT theme (ThemeProvider defaultTheme="system" + Playwright's default light
  // colorScheme), so the bg-*-50 tints + *-500 borders are stable opaque values.
  //
  // EXPECTED RGBs below = the TASK-909 palette + the (Tailwind) standings
  // qualification colors. If you change either, update the values here.
  // NOTE: the qualification `*-500` borders are Tailwind v4 oklch() colors;
  // these expected RGBs are their oklch→sRGB rasterised values (which differ
  // from the legacy hex — e.g. green-500 is rgb(0,201,80), not #22c55e), within
  // the ±20 tolerance. The `*-50` tints + our hex tokens match their nominal hex.
  test("standings qualification colors + TASK-909 palette are locked (computed styles)", async ({
    page,
  }) => {
    await page.goto("/");
    const row = (name: RegExp) => page.getByRole("row", { name });
    // TASK-1505: the qualification border now lives on the frozen # cell (the
    // first cell in the row) so it stays pinned during horizontal scroll. Assert
    // on that cell, not the row.
    const numCell = (name: RegExp) => row(name).getByRole("cell").first();

    // NOTE (TASK-1504): the full-row qualification TINT is now DARK-MODE ONLY.
    // Playwright renders the LIGHT theme, so we assert only the coloured left
    // BORDER here (the tint is verified manually in dark mode). The border is
    // the primary qualification signal and guards the colour-coding saga.

    // --- Champions League — Arsenal (1) + Liverpool (5, 5th EPS spot): blue-500 border.
    for (const team of [/Arsenal/, /Liverpool/]) {
      await expect(numCell(team)).toHaveCSS("border-left-width", "4px");
      await expectCssColorInRange(numCell(team), "border-left-color", [43, 127, 255]);
    }

    // --- Conference League — Brighton (8): green-500. A non-top team correctly
    //     coloured — guards the hardcoded-rank-rule bug (#93/#95).
    await expect(numCell(/Brighton/)).toHaveCSS("border-left-width", "4px");
    await expectCssColorInRange(numCell(/Brighton/), "border-left-color", [0, 201, 80]);

    // --- Europa League — Crystal Palace (15, UECL winner): orange-500.
    await expect(numCell(/Crystal Palace/)).toHaveCSS("border-left-width", "4px");
    await expectCssColorInRange(numCell(/Crystal Palace/), "border-left-color", [255, 105, 0]);

    // --- Relegation — Wolves (20, the LAST row): red-500. Guards the Shadcn
    //     last-child:border-0 swallow bug (#94) — the last row must still
    //     render its qualification border.
    await expect(numCell(/Wolverhampton/)).toHaveCSS("border-left-width", "4px");
    await expectCssColorInRange(numCell(/Wolverhampton/), "border-left-color", [251, 44, 54]);

    // --- Mid-table neutral — Everton (13): no qualification border on the # cell.
    await expect(numCell(/Everton/)).toHaveCSS("border-left-width", "0px");

    // --- Qualification color key is always visible (TASK-1504 — it replaced the
    //     collapsed <details> and fills the bottom of the standings tile).
    await expect(page.getByRole("list", { name: /qualification legend/i })).toBeVisible();

    // --- TASK-909 palette token locks (light theme authored values).
    expect(await getCssVar(page, "--background")).toBe("#fafafa");
    expect(await getCssVar(page, "--foreground")).toBe("#0c0a14");
    expect(await getCssVar(page, "--primary")).toBe("#a3179a");
    expect(await getCssVar(page, "--success")).toBe("#059669");
    expect(await getCssVar(page, "--destructive")).toBe("#dc2626");
    expect(await getCssVar(page, "--chart-1")).toBe("#c91dbb");
    expect(await getCssVar(page, "--chart-2")).toBe("#fbbf24");

    // --- Rendered anchors: a real Form chip consumes --success / --destructive.
    //     Scope to the standings table so rail/other chips can't match.
    const standings = page.getByRole("table").first();
    await expectCssColorInRange(
      standings.getByRole("listitem", { name: "Win" }).first(),
      "background-color",
      [5, 150, 105],
    );
    await expectCssColorInRange(
      standings.getByRole("listitem", { name: "Loss" }).first(),
      "background-color",
      [220, 38, 38],
    );
  });
});
