import { expect, test } from "./_helpers/test";

test("game page renders the live match view", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/game");

  // Content-visible assertions (no navigation race).
  await expect(page.getByRole("group", { name: /Live scoreboard/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /Match pitch/i })).toBeVisible();
  // Scoped by name: `next dev` renders its own static-route indicator toast
  // with `role="status"`, so a bare getByRole("status") is a strict-mode
  // violation whenever that indicator happens to be mounted.
  await expect(page.getByRole("status", { name: /Live commentary/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Page not found/i })).toHaveCount(0);

  expect(errors).toEqual([]);
});
