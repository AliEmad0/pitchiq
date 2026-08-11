import { test, expect } from "./_helpers/test";

// TASK-703 — per-season <DataUnavailable> empty states, against committed data.
//
// Trigger: Bruno Fernandes (stable id 1000208, TASK-704) joined the PL in
// January 2020, so he has NO 2017-18 stats. Viewing him — or comparing him —
// at ?season=2017 must show the empty-state card, not a 404 or a misleading
// "pick a second player" hint.

test.describe("Per-season empty states", () => {
  test("player page shows DataUnavailable (not 404) for a season the player didn't play", async ({
    page,
  }) => {
    await page.goto("/players/1000208?season=2017");

    // The card is a status region; it names the player and offers a way back.
    // The name resolves from his most-recent season (2025-26 since TASK-1203);
    // TASK-M42 shortened the FPL-sourced legal name to the PL display name
    // "Bruno Fernandes" (was "Bruno Borges Fernandes"). The CTA points there.
    const card = page.getByRole("status", { name: /no 2017-18 data for bruno fernandes/i });
    await expect(card).toBeVisible();
    await expect(page.getByRole("link", { name: /view 2025-26 stats/i })).toBeVisible();
  });

  test("compare shows DataUnavailable when a picked player has no data for the season", async ({
    page,
  }) => {
    // Salah (1001119) played 2017-18; Bruno (1000208) did not → comparison can't render.
    await page.goto("/compare?a=1001119&b=1000208&season=2017");

    await expect(
      page.getByRole("status", { name: /no comparison for these seasons/i }),
    ).toBeVisible();
  });

  test("a genuinely unknown player id still 404s", async ({ page }) => {
    await page.goto("/players/9999999");
    await expect(page.getByText(/player not found/i)).toBeVisible();
  });
});
