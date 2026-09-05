import { expect, test } from "./_helpers/test";

test("Classic orbit: sim, play away, return to table and resume", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/game/classic");
  await page.getByRole("button", { name: "Start season", exact: true }).click({ timeout: 60_000 });
  await page.getByRole("button", { name: "Sim fixture", exact: true }).click();
  await expect(page.getByText("1 of 38 fixtures", { exact: false })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Play fixture", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Leaving or refreshing" })).toBeVisible();
  await page.getByRole("button", { name: "Return to season" }).click();
  await expect(page.getByText("1 of 38 fixtures", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Play fixture", exact: true }).click();
  await page.getByRole("button", { name: /Kick off/i }).click();
  await page.getByRole("button", { name: "Full time", exact: true }).click({ timeout: 90_000 });
  await page.getByRole("button", { name: "Return to season" }).click();
  await expect(page.getByText("2 of 38 fixtures", { exact: false })).toBeVisible();
  const table = page.getByRole("table");
  const before = await table.innerText();
  await page.reload();
  await expect(page.getByText("2 of 38 fixtures", { exact: false })).toBeVisible({
    timeout: 60_000,
  });
  expect(await table.innerText()).toBe(before);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("Classic 1992 has 42 fixtures", async ({ page }) => {
  await page.goto("/game/classic");
  await page
    .getByRole("group", { name: "Choose your historical season" })
    .getByRole("combobox", { name: "Season", exact: true })
    .selectOption("1992");
  await expect(page.getByText("0 of 42 fixtures", { exact: false })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("button", { name: "Start season" })).toBeVisible();
});
