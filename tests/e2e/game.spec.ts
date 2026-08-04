import { expect, test } from "@playwright/test";

test("game page renders the live match view", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/game");

  // Content-visible assertions (no navigation race).
  await expect(page.getByRole("group", { name: /Live scoreboard/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /Match pitch/i })).toBeVisible();
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Page not found/i })).toHaveCount(0);

  expect(errors).toEqual([]);
});
