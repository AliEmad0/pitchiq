import { test, expect } from "./_helpers/test";

/**
 * TASK-M79 — the sticky header used to scroll the whole document sideways
 * between 768px and ~1000px.
 *
 * The header row lays three intrinsically-sized children out with
 * `justify-between gap-4`: the logo, the segmented pill nav, and the controls
 * cluster. Nothing in it can shrink — every pill is content-sized and the
 * search / theme / locale / season controls are fixed-width — so the row's
 * width is simply the sum of its parts. Measured in English that sum is
 * 88 + 474 + 343 + 32 (gaps) = 937px, and with the `container-page` side
 * padding the header needs ~985px before it can hold its own contents.
 *
 * The pill nav was revealed at Tailwind's `md` (768px) — a quarter of a
 * viewport before the header could contain it — and the excess became
 * horizontal overflow on `<header>` and therefore on the document.
 *
 * No unit test can catch that: happy-dom does no layout, so a className
 * assertion only ever proves which breakpoint token was typed, not whether
 * the result fits. This spec measures the real thing at the boundaries that
 * matter, in both writing directions (the header mirrors under `/ar`).
 *
 * Widths start at 640px. Below that the header has a *separate*, pre-existing
 * overflow — the controls cluster alone is ~272px against a 393px viewport,
 * with the season chip taking 110px of it. That one is not this ticket's, and
 * fixing it means trading away either the wordmark or the season control, which
 * is the owner's call. See the TASK-M79 notes in TASKS.md.
 */

// Breakpoint boundaries either side of `sm`, `lg` and `xl`, plus the widths
// from the original bug report (820 / 900) and two ordinary laptop sizes.
const WIDTHS = [640, 767, 768, 820, 900, 1000, 1023, 1024, 1100, 1279, 1280, 1440] as const;

const OVERFLOW_PROBE = () => {
  const header = document.querySelector("header");
  if (!header) return { header: -1, doc: -1 };
  const doc = document.documentElement;
  return {
    header: header.scrollWidth - header.clientWidth,
    doc: doc.scrollWidth - doc.clientWidth,
  };
};

for (const path of ["/", "/ar"] as const) {
  test(`the header fits at every width without scrolling the page sideways (${path})`, async ({
    page,
  }) => {
    await page.goto(path);

    // Resizing re-evaluates the media queries without a reload, so this is one
    // page load rather than twelve. Collect every offender before asserting so
    // a failure names the whole broken band instead of only its first width.
    const offenders: { width: number; header: number; doc: number }[] = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const measured = await page.evaluate(OVERFLOW_PROBE);
      if (measured.header > 0 || measured.doc > 0) offenders.push({ width, ...measured });
    }

    expect(offenders).toEqual([]);
  });
}
