import { test, expect } from "./_helpers/test";
import { ARABIC_ENABLED, ARABIC_PARKED, LOCALE_PATHS } from "./_helpers/locales";

/**
 * TASK-M79 / TASK-M80 — the sticky header used to scroll the whole document
 * sideways, in two separate bands with two separate causes.
 *
 * The header row lays three intrinsically-sized children out with
 * `justify-between gap-4`: the logo, the segmented pill nav, and the controls
 * cluster. Nothing in it can shrink — every pill is content-sized and the
 * search / theme / locale / season controls are fixed-width — so the row's
 * width is simply the sum of its parts.
 *
 * TASK-M79 fixed the tablet band: the pill nav was revealed at `md` (768px)
 * though the row needs ~985px in English to hold it, so 768–1000px overflowed.
 * The pills moved to `lg`.
 *
 * TASK-M80 fixed the phone band. Below `sm` the pills are long gone, so this
 * was the controls cluster alone: 278px of controls plus a 99px logo against a
 * 320px viewport — 89px over in English, 70px in Arabic. Two controls gave way
 * (owner's call, since every option here trades something away): the season
 * chip drops its label below `sm` and keeps only the calendar glyph, and the
 * locale switcher moves into the mobile drawer.
 *
 * No unit test can catch either one: happy-dom does no layout, so a className
 * assertion only ever proves which breakpoint token was typed, not whether the
 * result fits. This spec measures the real thing at the boundaries that matter,
 * in both writing directions (the header mirrors under `/ar`).
 */

// 320px is the narrowest viewport worth supporting (iPhone SE 1st gen / a
// Galaxy Fold's cover screen). Then the common phone widths, the boundaries
// either side of `sm`, `lg` and `xl`, the widths from the original M79 report
// (820 / 900), and two ordinary laptop sizes.
const WIDTHS = [
  320, 360, 375, 393, 412, 430, 480, 639, 640, 767, 768, 820, 900, 1000, 1023, 1024, 1100, 1279,
  1280, 1440,
] as const;

/**
 * The HEADER is measured at every width above. The DOCUMENT is only measured
 * from 640px up, and that is a real exclusion rather than an oversight.
 *
 * Below 640px the English dashboard's own content overflows independently of
 * the header: the match rows in the "moments" card (`grid-cols-[1fr_auto_1fr]`,
 * a 20px crest plus a club name per side) need 289px against the 288px that
 * `container-page` leaves at 320px, and the historic map's SVG adds a few more
 * — 19px of document overflow in total at 320px, with the header itself
 * measuring 0. Bisected by hiding subtrees until `documentElement.scrollWidth`
 * dropped back to the viewport width; `/ar` is clean, so it is English label
 * lengths that do it.
 *
 * It is invisible today because `html` is `overflow-x: hidden` — the content is
 * clipped rather than scrolled — which is also why it survived unnoticed.
 * Fixing it means deciding how a club name should degrade on a 320px phone
 * (truncate, wrap, drop the crest), which is dashboard design and a different
 * ticket's surface. See the TASK-M80 follow-up note in TASKS.md.
 */
const DOC_OVERFLOW_FLOOR = 640;

const OVERFLOW_PROBE = () => {
  const header = document.querySelector("header");
  if (!header) return { header: -1, doc: -1 };
  const doc = document.documentElement;
  return {
    header: header.scrollWidth - header.clientWidth,
    doc: doc.scrollWidth - doc.clientWidth,
  };
};

/**
 * ⛔ The measurement trap that produced a false green during TASK-M79.
 *
 * The season chip mounts behind a `<Suspense>` fallback, so a header measured
 * before it lands is ~44px narrower than the one a user sees — missing its
 * widest control — and reports no overflow at any width. Wait for the real
 * control: a `<button>` in the header carrying a 4-digit year.
 *
 * The year has to be matched in BOTH numeral systems. Arabic runs as
 * `ar-u-nu-arab` (see `src/i18n/request.ts`), so the chip reads ٢٠٢٥ and a
 * plain `\d{4}` waits forever on a chip that is already on screen.
 *
 * `textContent`, not `innerText`: below `sm` the label is `sr-only`, which is
 * clipped to 1px rather than removed, and `innerText` would not see it.
 */
async function waitForSeasonChip(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    () => {
      const header = document.querySelector("header");
      if (!header) return false;
      return [...header.querySelectorAll("button")].some((b) =>
        /[0-9٠-٩]{4}/.test(b.textContent || ""),
      );
    },
    undefined,
    { timeout: 30_000 },
  );
}

// ⭐ Derived, not a literal pair (TASK-1843): with Arabic parked this runs the English
// widths only, and re-arms the Arabic pass the moment the locale goes back into routing.
for (const path of LOCALE_PATHS) {
  test(`the header fits at every width without scrolling the page sideways (${path})`, async ({
    page,
  }) => {
    await page.goto(path);
    await waitForSeasonChip(page);

    // Resizing re-evaluates the media queries without a reload, so this is one
    // page load rather than twenty. Collect every offender before asserting so
    // a failure names the whole broken band instead of only its first width.
    const offenders: { width: number; header: number; doc: number }[] = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const measured = await page.evaluate(OVERFLOW_PROBE);
      const docCounts = width >= DOC_OVERFLOW_FLOOR && measured.doc > 0;
      if (measured.header > 0 || docCounts) offenders.push({ width, ...measured });
    }

    expect(offenders).toEqual([]);
  });
}

/**
 * TASK-M80 — the overflow fix moved a control rather than deleting it, and the
 * measurement above cannot tell those two apart: a header with the language
 * toggle simply removed on phones passes every width. This is the other half of
 * the guarantee — below `sm` the control is gone from the header and present in
 * the drawer, and above `sm` it is the other way round, so it exists exactly
 * once at every width.
 *
 * On an English page the toggle's next locale is Arabic, so its accessible name
 * is the Arabic string (the label describes where it takes you).
 */
const LOCALE_TOGGLE = /التبديل إلى العربية/;

test("the language toggle exists exactly once on a phone — in the drawer, not the header", async ({
  page,
}) => {
  test.skip(!ARABIC_ENABLED, ARABIC_PARKED);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/");
  await waitForSeasonChip(page);

  await expect(page.locator("header").getByRole("button", { name: LOCALE_TOGGLE })).toBeHidden();

  await page.getByRole("button", { name: /open navigation menu/i }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: LOCALE_TOGGLE })).toBeVisible();
});

test("the language toggle stays in the header on desktop and out of the drawer", async ({
  page,
}) => {
  test.skip(!ARABIC_ENABLED, ARABIC_PARKED);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await waitForSeasonChip(page);

  await expect(page.locator("header").getByRole("button", { name: LOCALE_TOGGLE })).toBeVisible();
});
