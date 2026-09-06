import { expect, test } from "./_helpers/test";

test("shared translations render without duplicating the catalog in page HTML", async ({
  page,
}) => {
  const response = await page.goto("/map", { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(200);
  const html = await response!.text();
  // This game-only key used to be serialized on every page, including the map.
  expect(html).not.toContain("benchKeeperNeeded");
  await expect(page.getByRole("slider", { name: "Season timeline" })).toBeVisible();
  await page.getByRole("slider", { name: "Season timeline" }).press("Home");
  await expect(page.getByText("1992-93").first()).toBeVisible();
  // Client navigation must retain the provider and its translated interactive labels.
  await page.getByRole("link", { name: "Game", exact: true }).click();
  await expect(page).toHaveURL(/\/game$/);
  await page.getByRole("button", { name: /Legacy Club/ }).click();
  await expect(page.getByRole("link", { name: /Full Season/ })).toBeVisible();
});
