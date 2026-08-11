import { expect, test } from "./_helpers/test";

// TASK-1705 — "Neon glow" micro-interactions: hovering an interactive surface
// lights an era-accent halo (ix-glow), the standings row hover washes the
// whole row INCLUDING the sticky columns (ix-row), and the press compress
// (ix-press) is disabled under reduced motion. Boot loader skipped via its
// session flag.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("pitchiq:booted", "1"));
});

test.describe("micro-interactions", () => {
  test("fixture cards glow on hover", async ({ page }) => {
    await page.goto("/fixtures");
    const card = page.locator("li[data-reveal] .ix-glow").first();
    await card.hover();
    // The glow transition runs on the fast token (150ms).
    await expect
      .poll(async () => card.evaluate((el) => getComputedStyle(el).boxShadow))
      .toContain("0px 0px 14px");
  });

  test("standings row hover washes the sticky cells too", async ({ page }) => {
    await page.goto("/");
    const row = page.locator("tr.ix-row").first();
    const sticky = row.locator("td").first();
    const before = await sticky.evaluate((el) => getComputedStyle(el).backgroundColor);
    await row.hover();
    await expect
      .poll(async () => sticky.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(before);
  });

  test("presses compress; reduced motion disables the compress", async ({ page }) => {
    // The header ⌘K trigger carries ix-press and exists on every page.
    const pressTransform = async () => {
      const btn = page.locator("header button:has(kbd)").first();
      await btn.waitFor();
      const box = await btn.boundingBox();
      if (!box) throw new Error("no box");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(250);
      const t = await btn.evaluate((el) => getComputedStyle(el).transform);
      await page.mouse.up();
      await page.keyboard.press("Escape");
      return t;
    };

    await page.goto("/");
    expect(await pressTransform()).toContain("matrix(0.98");

    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await pressTransform()).toBe("none");

    // TASK-1706: under reduce, the ⌘K dialog opens WITHOUT its zoom/fade
    // entrance (the overlay-slot gate in globals.css).
    await page.locator("header button:has(kbd)").first().click();
    const dlg = page.locator('[data-slot="dialog-content"]');
    await dlg.waitFor();
    expect(await dlg.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  });
});
