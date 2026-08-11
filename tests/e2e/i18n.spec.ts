import { expect, test } from "./_helpers/test";

// TASK-1601 — i18n infrastructure. Proves the locale switcher toggles en ⇄ ar
// with the correct `dir`/`lang` + URL, and that English stays un-prefixed
// (localePrefix "as-needed").
test.describe("i18n locale switching", () => {
  test("toggles en ⇄ ar with dir/lang + URL and localizes the nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    // From English, the switcher offers Arabic.
    await page.getByRole("button", { name: "التبديل إلى العربية" }).click();
    await expect(page).toHaveURL(/\/ar$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    // The primary-nav landmark aria-label is itself localized now (TASK-1603
    // batch 12), so on /ar it reads "التنقل الرئيسي" (exact, to avoid the
    // mobile nav's "…للجوال"); it contains the Arabic "Dashboard" link.
    await expect(
      page.getByRole("navigation", { name: "التنقل الرئيسي", exact: true }),
    ).toContainText("الرئيسية");

    // From Arabic, the switcher offers English and returns to the un-prefixed root.
    await page.getByRole("button", { name: "Switch to English" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });

  test("existing English URLs stay un-prefixed (as-needed)", async ({ page }) => {
    const res = await page.goto("/teams");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/teams$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

// TASK-1605 — locale-aware formatting. The fixtures page renders matchday
// headings + kickoff dates through the locale formatters, so the month names
// switch language with the locale (digits stay Western in both).
const ARABIC_MONTHS = /يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر/;
const ENGLISH_MONTHS = /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/;

test.describe("i18n locale-aware date formatting", () => {
  test("English fixtures render Latin month names with dir=ltr", async ({ page }) => {
    await page.goto("/fixtures");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByText(ENGLISH_MONTHS).first()).toBeVisible();
  });

  test("Arabic fixtures render Arabic month names with dir=rtl", async ({ page }) => {
    await page.goto("/ar/fixtures");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText(ARABIC_MONTHS).first()).toBeVisible();
  });
});
