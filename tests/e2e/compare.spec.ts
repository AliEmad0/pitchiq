import { test, expect } from "./_helpers/test";

// TASK-411 — full compare flow, against committed snapshot data.
//
// Walks the four-stage UX:
//   1. Land on `/compare` with no ids → two empty slot pickers.
//   2. Search "Bruno" in slot A → pick Bruno Fernandes (snapshot id 1000208).
//   3. Search "Salah" in slot B → pick Mohamed Salah (snapshot id 1001119).
//      "Salah" is uniquely named in the dataset; "Rashford" has two hits
//      (Aston Villa + Man Utd) which would create a `.first()` ambiguity.
//   4. Assert the comparison view rendered: both names in the header,
//      at least one `<StatRow>` label, the radar's aria-label, and the
//      URL has `?a=1000208&b=1001119`.
//   5. Reload the page → both slots remain populated from URL state.
//
// As of TASK-507, all Comparison fetchers read from committed snapshot JSON
// snapshots via src/data/loaders.ts — no MSW `/players` handler is needed.

test.describe("Compare flow happy-path", () => {
  test("search and pick two players, see the comparison, survive a reload", async ({ page }) => {
    // Pinned to 2024-25: that season has the full FBref metric set (so the
    // radar's six axes resolve) and the canonical "Bruno Fernandes" name. The
    // default 2025-26 season (since TASK-1203) sources players from FPL — its
    // FBref-only metrics are null and the name renders as "Bruno Borges
    // Fernandes". The page threads `?season=` into the search + comparison, and
    // nuqs preserves the param across slot picks, so the whole flow stays on 2024.
    await page.goto("/compare?season=2024");

    // --- Stage 1: empty pickers ---------------------------------------
    await expect(page.getByRole("heading", { level: 1, name: /compare players/i })).toBeVisible();
    await expect(page.getByPlaceholder(/search player a/i)).toBeVisible();
    await expect(page.getByPlaceholder(/search player b/i)).toBeVisible();

    // --- Stage 2: pick player A ---------------------------------------
    // Type past the 3-char threshold so the debounced TanStack Query
    // fires. The cmdk dropdown renders results as `role="option"`.
    await page.getByPlaceholder(/search player a/i).fill("Bruno");
    await page
      .getByRole("option", { name: /Bruno Fernandes/ })
      .first()
      .click();

    // Slot A's picker re-renders into the populated `<Card>` state with
    // a Change button — placeholder A is gone, name + Change appear.
    // URL now carries `?a=1000208` (nuqs writes synchronously on select).
    await expect(page).toHaveURL(/[?&]a=1000208/);
    await expect(page.getByPlaceholder(/search player a/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /change/i }).first()).toBeVisible();

    // --- Stage 3: pick player B ---------------------------------------
    await page.getByPlaceholder(/search player b/i).fill("Salah");
    await page
      .getByRole("option", { name: /Mohamed Salah/ })
      .first()
      .click();

    await expect(page).toHaveURL(/[?&]a=1000208/);
    await expect(page).toHaveURL(/[?&]b=1001119/);

    // --- Stage 4: the comparison view renders -------------------------
    // Both names live in the `<h2>` name header — server-rendered for
    // SSR shareability, so they're present in initial HTML.
    const header = page.getByRole("heading", { level: 2 });
    await expect(header).toContainText("Bruno Fernandes");
    await expect(header).toContainText("Mohamed Salah");

    // At least one StatRow label — `Appearances` is a representative
    // assertion from the 12-row `COMPARISON_METRICS` stack. Picked over
    // `Goals` because `Goals` also appears as a radar axis label and a
    // strict-mode `getByText` would reject the duplicate match. The
    // distinct label proves the StatRow stack rendered specifically.
    await expect(page.getByText("Appearances", { exact: true })).toBeVisible();

    // The radar's wrapper carries `role="img"` + an aria-label naming
    // both players (TASK-407). Pinning this confirms `getMetricMaxes`
    // resolved and the chart mounted, not just the bar stack.
    await expect(page.getByRole("img", { name: /radar comparison/i })).toBeVisible();

    // --- Stage 5: reload + state survives -----------------------------
    // The URL carries both ids; on reload the server re-fetches both
    // players + maxes, the slot pickers re-hydrate, and the comparison
    // view renders the same content. This is the AC's "shareable URL"
    // guarantee — paste the link into a new tab and the comparison
    // comes back.
    await page.reload();
    await expect(page).toHaveURL(/[?&]a=1000208/);
    await expect(page).toHaveURL(/[?&]b=1001119/);

    const headerAfterReload = page.getByRole("heading", { level: 2 });
    await expect(headerAfterReload).toContainText("Bruno Fernandes");
    await expect(headerAfterReload).toContainText("Mohamed Salah");
  });

  // TASK-605 — the empty-state suggested-player grid.
  // TASK-910 — the click→fill now runs through `runViewTransition`; we assert
  // the resulting STATE (per the ticket: never animation timing).
  test("suggested grid fills slot A when a card is clicked", async ({ page }) => {
    await page.goto("/compare");

    // The grid is a client island that fetches `/api/players/suggested`; it
    // renders a labelled region once the season's top scorers/assisters load.
    const grid = page.getByRole("region", { name: /suggested players/i });
    await expect(grid).toBeVisible();

    // Clicking the first card fills slot A (A-first rule) → `?a=<id>`. The fill
    // is wrapped in a native View Transition (TASK-910) — chromium runs the
    // morph, the fallback is instant; either way the slot ends up populated.
    await grid.getByRole("button").first().click();
    await expect(page).toHaveURL(/[?&]a=\d+/);

    // Slot A's picker is now populated (Change button), and the grid stays
    // visible because slot B is still empty.
    await expect(page.getByRole("button", { name: /change/i }).first()).toBeVisible();
    await expect(grid).toBeVisible();

    // TASK-910: the populated slot card carries a `view-transition-name` so the
    // browser can morph the picked card into it. Stable state (not motion).
    await expect(page.getByTestId("slot-a-populated")).toHaveAttribute(
      "style",
      /view-transition-name/,
    );
  });

  // TASK-803 — old-season (< 2017-18) empty state. Both ids resolve to real
  // players, but neither has stats for a pre-2017 season, so the comparison view
  // is replaced by the <DataUnavailable> card instead of the misleading
  // "pick a second player" hint.
  test("renders <DataUnavailable> when comparing on a pre-2017 season", async ({ page }) => {
    const hydrationErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /hydrat|Warning:/i.test(msg.text())) {
        hydrationErrors.push(msg.text());
      }
    });

    // Bruno (1000208) + Salah (1001119) both picked, but season 1995-96 pre-dates
    // the player-stats coverage (advanced player stats start 2017-18).
    await page.goto("/compare?a=1000208&b=1001119&season=1995");

    await expect(
      page.getByRole("status", { name: /no comparison for these seasons/i }),
    ).toBeVisible();

    // The comparison header (h2 with both names) must NOT render.
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);

    expect(hydrationErrors).toEqual([]);
  });

  // TASK-M24 — per-slot season selection + "All seasons" career aggregate.
  // Deep-links slot A to a historical season and slot B to its whole career,
  // proving cross-era comparison works and the `sa`/`sb` params are shareable.
  test("per-slot season: cross-era single season vs All seasons career", async ({ page }) => {
    // Henry (1003061) at his 2003-04 season vs Salah (1001119) career.
    await page.goto("/compare?a=1003061&sa=2003&b=1001119&sb=all");

    const header = page.getByRole("heading", { level: 2 });
    await expect(header).toContainText("Henry");
    await expect(header).toContainText("Salah");
    // Slot A shows the single-season label; slot B the career label.
    await expect(header).toContainText("2003-04");
    await expect(header).toContainText(/Career/);

    // The pairwise radar always renders when both slots resolve.
    await expect(page.getByRole("img", { name: /radar comparison/i })).toBeVisible();

    // Per-slot season params survive a reload (shareable deep link).
    await page.reload();
    await expect(page).toHaveURL(/[?&]sa=2003/);
    await expect(page).toHaveURL(/[?&]sb=all/);
    await expect(page.getByRole("heading", { level: 2 })).toContainText("Henry");
  });

  // TASK-M11 — cross-season search. On the default (2025-26) season the slot
  // search must still find a historical player (Henry didn't play 2025-26),
  // so cross-era compare is reachable via the UI (not just deep links).
  test("cross-season search finds a historical player on the current season", async ({ page }) => {
    await page.goto("/compare"); // default 2025-26

    // Slot A: a player from a past era — previously returned "No players found".
    await page.getByPlaceholder(/search player a/i).fill("Thierry Henry");
    await page
      .getByRole("option", { name: /Thierry Henry/ })
      .first()
      .click();
    await expect(page).toHaveURL(/[?&]a=1003061/);

    // Slot B: a current player.
    await page.getByPlaceholder(/search player b/i).fill("Haaland");
    await page
      .getByRole("option", { name: /Erling Haaland/ })
      .first()
      .click();

    // Cross-era comparison forms.
    const header = page.getByRole("heading", { level: 2 });
    await expect(header).toContainText("Henry");
    await expect(header).toContainText("Haaland");
    await expect(page.getByRole("img", { name: /radar comparison/i })).toBeVisible();
  });

  // Regression — the "Compare with another player" CTA from a HISTORICAL-season
  // profile must carry that season as the slot-A season (`sa`). The old CTA
  // (`/compare?a=<id>` with no season) made compare default to the current
  // season, 404 the slot-A hydrate for a player with no current-season stats,
  // and self-heal the slot empty — so the player silently failed to pick.
  test("Compare CTA from a historical profile keeps the player in slot A", async ({ page }) => {
    // Didier Drogba (1002187) at 2007-08 — no current-season stats.
    await page.goto("/players/1002187?season=2007");
    await page.getByRole("link", { name: /compare with another player/i }).click();

    // The viewed season travels with the id as `sa`.
    await expect(page).toHaveURL(/\/compare\?a=1002187&sa=2007$/);

    // Slot A hydrates and STAYS populated (the bug self-healed it to the empty
    // search state, dropping `?a=` from the URL).
    await expect(page.getByTestId("slot-a-populated")).toBeVisible();
    await expect(page.getByTestId("slot-a-empty")).toHaveCount(0);

    // The player's season is preserved, shown on the slot card's season select.
    await expect(page.getByRole("combobox", { name: /season for player a/i })).toContainText(
      "2007-08",
    );
  });
});
