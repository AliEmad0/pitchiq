import { expect, test } from "./_helpers/test";

test("map: nav, 51 markers, slider changes the season, badge → team page", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Map" }).first().click();
  await expect(page).toHaveURL(/\/map$/);

  // All 51 clubs render as markers.
  const markers = page.locator("a.club-marker");
  await expect(markers.first()).toBeVisible();
  await expect(markers).toHaveCount(51);

  // The active count for the default season is shown.
  await expect(page.getByText(/of 51 clubs active/)).toBeVisible();

  // Dragging the slider to the earliest season updates the readout.
  const slider = page.getByRole("slider", { name: "Season timeline" });
  await slider.focus();
  await slider.press("Home"); // jump to 1992-93
  await expect(page.getByText("1992-93").first()).toBeVisible();

  // Dense clusters overlap: keyboard activation targets the actual link instead
  // of forcing a centre click through another badge or the sticky slider.
  const active = page.locator('a.club-marker[data-active="true"]').first();
  await expect(active).toHaveAttribute("href", "/teams/33?season=1992");
  await active.press("Enter");
  await expect(page).toHaveURL(/\/teams\/33\?season=1992$/);
});

test("map: a region opens its modal with clubs + titles", async ({ page }) => {
  await page.goto("/map", { waitUntil: "domcontentloaded" });
  // Activate the region via keyboard — a centre click can land on a marker
  // badge that overlays the region (markers are clickable on top).
  await page.getByRole("button", { name: /North West — view clubs/ }).press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("North West");
  await expect(dialog).toContainText(/PL title/);
  // A club row links to its team page.
  await dialog.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/teams\/\d+/);
});
