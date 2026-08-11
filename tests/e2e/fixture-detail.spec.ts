import { test, expect } from "./_helpers/test";

// Phase 10 — fixture detail lineups + events, against committed PL SDP data.
//
// Covered fixtures (2010-11 → 2025-26) render a real pitch + event timeline. The
// page reads committed data/lineups-<season>.json / events-<season>.json offline
// — no MSW.
//
// COVERED: Brighton 2-2 Tottenham (2025-09-20) — full lineup + 16 events.
//
// Note: the per-fixture <LineupUnavailable>/<EventsUnavailable> fallback isn't
// E2E'd here — /fixtures/[id] resolves against currentDataSeason() (2025), and
// every 2025-26 fixture has SDP data, so there's no reachable uncovered fixture
// to drive it. The empty-data branch is unit-tested in fixture-detail-api.test.ts
// ("returns lineups: [] and events: [] when no lineup data exists").
const COVERED_FIXTURE = "2025-09-20-BHA-TOT";
// A 2024-25 fixture (May 2025) — proves the season is derived from the fixture
// id's date so historical fixture pages resolve (not just the current season).
const HISTORICAL_FIXTURE = "2025-05-25-BOU-LEI";

test.describe("Fixture detail — lineups + events", () => {
  test("a historical-season fixture resolves and renders its lineup", async ({ page }) => {
    await page.goto(`/fixtures/${HISTORICAL_FIXTURE}`);
    // Not a 404 — the page derives season 2024-25 from the id's May-2025 date.
    await expect(page.getByRole("heading", { level: 1, name: /Page not found/i })).toHaveCount(0);
    await expect(page.getByLabel("Pitch lineup")).toBeVisible();
  });

  test("covered fixture renders the pitch + event timeline", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.goto(`/fixtures/${COVERED_FIXTURE}`);

    // Lineups is the default tab when data exists → the pitch SVG is visible.
    await expect(page.getByLabel("Pitch lineup")).toBeVisible();

    // Events tab shows a populated timeline.
    await page.getByRole("tab", { name: "Events" }).click();
    await expect(page.getByTestId("event-minute").first()).toBeVisible();

    expect(errors).toHaveLength(0);
  });
});
