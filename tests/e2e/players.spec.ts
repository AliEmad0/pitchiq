import { test, expect } from "@playwright/test";

// TASK-610 — the `/players/[id]` profile page, against committed snapshot data.
// Player ids are the stable cross-season ids from data/player-ids.json (TASK-704);
// 1001119 is Mohamed Salah (Liverpool) — the same id pinned in
// tests/unit/leaderboards-api.test.ts and tests/unit/data-loaders.test.ts, so
// they move together if the data is ever re-synced.

test.describe("Player profile page", () => {
  test("renders the hero, team link, compare CTA, and season stats", async ({ page }) => {
    await page.goto("/players/1001119");

    // Hero: name is the h1.
    await expect(page.getByRole("heading", { level: 1, name: "Mohamed Salah" })).toBeVisible();

    // Team link → /teams/[id], carrying the viewing season (TASK-M09).
    await expect(page.getByRole("link", { name: /view liverpool page/i })).toHaveAttribute(
      "href",
      /\/teams\/40\?season=\d+$/,
    );

    // Compare CTA pre-fills the compare slot, carrying the viewed season as the
    // slot-A season (`sa`, TASK-M24) so the comparison resolves the player
    // against the season they were seen in instead of self-healing empty.
    await expect(page.getByRole("link", { name: /compare with another player/i })).toHaveAttribute(
      "href",
      /\/compare\?a=1001119&sa=\d+$/,
    );

    // Season stats table renders with at least one metric label.
    await expect(page.getByRole("heading", { level: 2, name: /season statistics/i })).toBeVisible();
    await expect(page.getByText("Goals", { exact: true })).toBeVisible();

    // TASK-M10: the page owns a season control scoped to the player's seasons,
    // and the global header switcher hides itself here — so there is exactly
    // ONE "Season" combobox on the page (the page-local, scoped one).
    const seasonControl = page.getByRole("combobox", { name: "Season" });
    await expect(seasonControl).toHaveCount(1);
    await expect(seasonControl).toBeVisible();
  });

  test("renders the not-found boundary for an unknown id", async ({ page }) => {
    // TASK-M72: a real 404 status, not just the boundary UI.
    const res = await page.goto("/players/9999999");
    expect(res?.status()).toBe(404);
    await expect(page.getByText(/player not found/i)).toBeVisible();
  });

  // TASK-803 — old-season (< 2017-18) empty state. Salah is a real player with a
  // stable id, but pre-2017 seasons have no player data at all, so the page shows
  // the <DataUnavailable> card (NOT a 404) with a CTA back to his latest season.
  test("renders <DataUnavailable> for a player on a pre-2017 season", async ({ page }) => {
    const hydrationErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /hydrat|Warning:/i.test(msg.text())) {
        hydrationErrors.push(msg.text());
      }
    });

    await page.goto("/players/1001119?season=1995");

    // The card is a role="status" region titled for the missing season + player.
    const card = page.getByRole("status", { name: /no 1995-96 data for mohamed salah/i });
    await expect(card).toBeVisible();

    // CTA links back to his most-recent committed season (2025-26 since TASK-1203).
    await expect(page.getByRole("link", { name: /view 2025-26 stats/i })).toHaveAttribute(
      "href",
      "/players/1001119?season=2025",
    );

    // The real profile (hero/stats) must NOT render for this season.
    await expect(page.getByRole("heading", { level: 1, name: "Mohamed Salah" })).toHaveCount(0);

    expect(hydrationErrors).toEqual([]);
  });

  // Player-link sweep — a player name on the dashboard leaderboards links to
  // the profile page. Erling Haaland is the 2025-26 rank-1 top scorer (the
  // default season since TASK-1203); the name link can appear on more than one
  // leaderboard — `.first()` is intentional.
  test("navigates from a dashboard leaderboard into the player profile", async ({ page }) => {
    await page.goto("/");
    const playerLink = page.getByRole("link", { name: "Erling Haaland" }).first();
    await expect(playerLink).toBeVisible();
    await playerLink.click();
    await expect(page).toHaveURL(/\/players\/\d+\?season=\d+$/);
    await expect(page.getByRole("heading", { level: 1, name: "Erling Haaland" })).toBeVisible();
  });
});

// TASK-M50 — the `/players` index page (most valuable showcase + filterable table).
test.describe("Players index page", () => {
  test("shows the showcase + table and navigates into a profile", async ({ page }) => {
    await page.goto("/players");
    await expect(
      page.getByRole("heading", { level: 1, name: "Premier League players" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Most valuable players" })).toBeVisible();

    const firstPlayer = page.locator('table a[href^="/players/"]').first();
    await expect(firstPlayer).toBeVisible();
    await firstPlayer.click();
    await expect(page).toHaveURL(/\/players\/\d+/);
  });

  test("nav exposes Players", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Players" }).first()).toBeVisible();
  });
});
