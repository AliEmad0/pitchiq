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
  await expect(
    page.getByText("Match rules: up to 3 substitutions per team.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return to season" }).click();
  await expect(page.getByText("1 of 38 fixtures", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Play fixture", exact: true }).click();
  await page.getByRole("button", { name: /Kick off/i }).click();
  await page.getByRole("button", { name: "Full time", exact: true }).click({ timeout: 150_000 });
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

test("Classic modern half-time supports two changes in one submission", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/game/classic");
  await page
    .getByRole("group", { name: "Choose your historical season" })
    .getByRole("combobox", { name: "Season", exact: true })
    .selectOption("2022");
  await page.getByRole("button", { name: "Start season", exact: true }).click();
  await page.getByRole("button", { name: "Play fixture", exact: true }).click();
  await expect(page.getByText(/Match rules: up to 5 substitutions/)).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: /Kick off/i }).click();
  await page.getByTestId("bench-button").click();
  const dialog = page.getByRole("dialog", { name: "The bench" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: /^Take .* off$/ })
    .nth(1)
    .click();
  await dialog
    .getByRole("button", { name: /^Bring .* on$/ })
    .nth(1)
    .click();
  await dialog.getByRole("button", { name: "Add another change" }).click();
  await expect(dialog.getByText(/1 changes queued/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("era-bench-mobile.png") });
  await dialog
    .getByRole("button", { name: /^Take .* off$/ })
    .nth(1)
    .click();
  await dialog
    .getByRole("button", { name: /^Bring .* on$/ })
    .nth(1)
    .click();
  await dialog.getByRole("button", { name: "Make the change" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Full time", exact: true }).click({ timeout: 150_000 });
  await page.getByRole("button", { name: "Return to season" }).click();
  await expect(page.getByText("1 of 38 fixtures", { exact: false })).toBeVisible();
});

test("Classic rotation saves after a fixture and survives reload", async ({ page }) => {
  await page.goto("/game/classic");
  await page.getByRole("button", { name: "Start season", exact: true }).click({ timeout: 60_000 });
  await page.getByRole("button", { name: "Sim fixture", exact: true }).click();
  await expect(page.getByText("1 of 38 fixtures", { exact: false })).toBeVisible();
  const before = await page.getByRole("table").innerText();
  await page.locator("summary").filter({ hasText: "Your XI" }).click();
  const slot = page.getByRole("combobox", { name: /^Position 2 / });
  const original = await slot.inputValue();
  const replacement = await slot
    .locator("option")
    .evaluateAll(
      (options, value) =>
        options.map((o) => (o as HTMLOptionElement).value).find((v) => v !== value),
      original,
    );
  expect(replacement).toBeTruthy();
  await slot.selectOption(replacement!);
  await expect(page.getByRole("button", { name: "Play fixture", exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByText("1 of 38 fixtures", { exact: false })).toBeVisible();
  await page.locator("summary").filter({ hasText: "Your XI" }).click();
  await expect(slot).toHaveValue(replacement!);
  expect(await page.getByRole("table").innerText()).toBe(before);
  await page.getByRole("button", { name: "Play fixture", exact: true }).click();
  await page.getByRole("button", { name: "Return to season" }).click();
  await page.locator("summary").filter({ hasText: "Your XI" }).click();
  await expect(slot).toHaveValue(replacement!);
  expect(await page.getByRole("table").innerText()).toBe(before);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
