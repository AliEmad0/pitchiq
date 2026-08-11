import { expect, test } from "./_helpers/test";

// TASK-1703 — zoom-fade route transitions. Internal Link navigations run
// inside document.startViewTransition (spied via addInitScript); reduced
// motion / unsupported browsers fall back to an instant normal navigation.

declare global {
  interface Window {
    __vtCount?: number;
  }
}

function spyViewTransitions() {
  return (page: import("@playwright/test").Page) =>
    page.addInitScript(() => {
      window.__vtCount = 0;
      const doc = document as Document & {
        startViewTransition?: (cb: () => void | Promise<unknown>) => unknown;
      };
      const original = doc.startViewTransition?.bind(document);
      if (original) {
        doc.startViewTransition = (cb: () => void | Promise<unknown>) => {
          window.__vtCount = (window.__vtCount ?? 0) + 1;
          return original(cb);
        };
      }
    });
}

test.describe("route transitions", () => {
  test("an internal nav click runs a view transition and lands on the route", async ({ page }) => {
    await spyViewTransitions()(page);
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Teams" })
      .click();
    await expect(page).toHaveURL(/\/teams/);
    await expect(page.getByRole("heading", { level: 1, name: /clubs/i })).toBeVisible();
    expect(await page.evaluate(() => window.__vtCount)).toBeGreaterThan(0);
  });

  test("reduced motion navigates instantly — no view transition", async ({ page }) => {
    await spyViewTransitions()(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Teams" })
      .click();
    await expect(page).toHaveURL(/\/teams/);
    expect(await page.evaluate(() => window.__vtCount)).toBe(0);
  });

  test("the nav-scoped attribute is cleaned up after the transition", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Teams" })
      .click();
    await expect(page).toHaveURL(/\/teams/);
    await expect(page.locator("html")).not.toHaveAttribute("data-vt", "nav", {
      timeout: 5_000,
    });
  });
});
