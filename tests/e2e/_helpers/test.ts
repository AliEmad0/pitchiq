/**
 * The E2E `test` object — import this instead of `@playwright/test` directly,
 * so every navigation is gated on the App Router actually being mounted.
 *
 * ## Why this exists
 *
 * The nav specs (click a link → `expect(page).toHaveURL(...)`) failed
 * intermittently for months and were repeatedly cleared as a "flake cloud".
 * Traces from the failing CI runs show the real mechanism, and it is not a
 * timeout:
 *
 *   - the click lands on a real `<a href>` and is `preventDefault`-ed
 *     (so no full-page navigation happens), but
 *   - **no RSC request is ever issued** — the client router never runs, and
 *   - the URL therefore stays put forever.
 *
 * That is the signature of a click arriving after React installs its root
 * event listeners (which suppresses the browser's default navigation) but
 * before the App Router has mounted — the interaction is swallowed outright.
 * Raising the timeout cannot help: nothing is in flight to wait for.
 *
 * `page.goto(..., { waitUntil: "load" })` does not cover it. `load` fires when
 * subresources have finished, which under `next dev` is well before React has
 * hydrated and flushed effects. Measured with CDP CPU throttling (6x) on
 * `/players`, clicking as soon as the link is visible: **9 of 12 clicks were
 * swallowed**. Gating on the signal below: **1 of 12**, and that one did issue
 * its RSC request (a genuinely slow navigation, not a swallowed click).
 *
 * The gate lives here rather than at the ~49 nav call sites because the same
 * bug hits buttons: the dashboard "Surprise me" failure is a pre-hydration
 * click on a `<button>`, which has no default action to suppress and is simply
 * dropped.
 *
 * ## The signal
 *
 * Next assigns `window.next.router` from an effect in the App Router client
 * component, so its presence means hydration has committed *and* effects have
 * flushed — i.e. `<Link>` clicks will be handled. It is strictly later than
 * React attaching fiber props to the anchor, which is why a fiber-props check
 * is not enough on its own (measured: 4 of 12 swallowed clicks had props
 * attached but no router yet).
 *
 * Verified present on all 22 routes the suite visits, including 404s and the
 * `/ar` locale tree.
 */
import { test as base, expect, type Page, type TestInfo } from "@playwright/test";

declare global {
  interface Window {
    /** Set by Next's App Router client entry once it mounts. Dev + prod. */
    next?: { router?: unknown };
  }
}

const ROUTER_TIMEOUT_MS = 15_000;

/**
 * Resolves once `window.next.router` exists, and after `ROUTER_TIMEOUT_MS`
 * regardless.
 *
 * Giving up quietly is deliberate. This gate exists to remove a failure mode
 * and must never *add* one: if it threw, a merely-slow page would fail inside
 * the fixture with a message about hydration instead of failing on the spec's
 * own assertion — less informative, and a behaviour change for tests that
 * never needed the gate. On timeout we record an annotation (visible in the
 * HTML report) and let the test proceed exactly as it would have before.
 */
async function waitForAppRouter(page: Page, testInfo?: TestInfo): Promise<void> {
  try {
    await page.waitForFunction(() => Boolean(window.next?.router), null, {
      timeout: ROUTER_TIMEOUT_MS,
    });
  } catch {
    testInfo?.annotations.push({
      type: "app-router-slow",
      description:
        `${page.url()} did not mount the App Router within ${ROUTER_TIMEOUT_MS}ms. ` +
        `Interactions dispatched from here can be silently swallowed.`,
    });
  }
}

export const test = base.extend({
  // The fixture callback's second arg is conventionally named `use`, but that
  // trips `react-hooks/rules-of-hooks` — the rule reads `use(...)` inside a
  // property named `page` as React's `use` hook in the wrong place. It is
  // positional, so naming it `runTest` sidesteps the false positive without
  // suppressing the rule anywhere.
  page: async ({ page }, runTest, testInfo) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      // `waitUntil: "commit"` is an explicit request to observe the page before
      // it settles (the boot-loader specs need the overlay mid-flight). Gating
      // on hydration would defeat that, so those callers opt out and call
      // `waitForAppRouter` themselves before any nav click.
      if (options?.waitUntil !== "commit") await waitForAppRouter(page, testInfo);
      return response;
    };

    const reload = page.reload.bind(page);
    page.reload = async (options) => {
      const response = await reload(options);
      if (options?.waitUntil !== "commit") await waitForAppRouter(page, testInfo);
      return response;
    };

    await runTest(page);
  },
});

export { expect, waitForAppRouter };
