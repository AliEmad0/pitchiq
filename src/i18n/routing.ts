import { defineRouting } from "next-intl/routing";

// TASK-1601 — locale routing. Path-prefix with `as-needed`: the default locale
// (en) keeps un-prefixed URLs (/teams/42); Arabic is served under /ar/*.
//
// `localeDetection: false` (TASK-1602) makes English the guaranteed default: the
// bare "/" always serves English regardless of the visitor's Accept-Language
// header, instead of auto-redirecting an Arabic-locale browser to /ar. Arabic is
// opt-in via the header switcher (which persists the choice in the URL + cookie).
// ⛔ ARABIC IS PARKED, NOT DELETED (TASK-1843, measured 2026-08-30).
//
// `[locale]/layout.tsx#generateStaticParams` returns exactly this array, so every entry here
// MULTIPLIES the entire prerendered site. With both locales the build is 38,121 pages and it
// **failed on Vercel's 45-minute build limit** (measured: 12 min of fixed cost for
// compile + lint + type-check, then 27.9 pages/sec, so ~23 min of generation on top). One
// locale is 19,163 pages — about 23 minutes — which fits with room for the data to grow.
//
// ⭐ Nothing Arabic was deleted. `src/i18n/messages/ar.json` (74 KB), the Arabic entity-name
// data, `README.ar.md` and every RTL logical-property rule are all still here and still in
// step with the code. **To bring Arabic back, put "ar" back in this array** (and re-enable the
// suites listed in tests/unit/i18n-routing.test.ts). Tag `ar-locale-live` marks the last
// commit that shipped it.
//
// ⚠️ Restoring it means paying that build budget again, so it needs a page-count cut first -
// see tests/unit/entity-routes-bounded.test.ts for why the cut may NOT be `dynamicParams`.
// `/ar/*` URLs are 301'd to their English equivalents in next.config.ts, at the edge.
export const routing = defineRouting({
  locales: ["en"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  localeDetection: false,

  // ⚠️ LOAD-BEARING FOR HOSTING COST — do NOT re-enable.
  //
  // By default next-intl's middleware writes `Set-Cookie: NEXT_LOCALE` on every
  // response it handles. A response carrying `Set-Cookie` is not cacheable by a
  // shared CDN, so Vercel stamped every page `private, no-cache, no-store` and
  // returned `x-vercel-cache: MISS` on 100% of requests — meaning all ~1,700
  // prerendered pages were bypassed and EVERY page view ran a Fluid function.
  // That was the real cause of the Active-CPU overruns behind the 2026-07
  // pause (the PR #35 / #40 work cut per-render cost, which never mattered
  // while nothing could be cached at all).
  //
  // Turning the cookie off is safe here precisely because `localeDetection` is
  // already false: the cookie was never read for detection, no code in `src/`
  // references NEXT_LOCALE, and the active locale lives in the URL (`/ar/*`)
  // with <LocaleSwitcher> navigating by path.
  //
  // Guarded by tests/unit/i18n-routing.test.ts and the scheduled
  // .github/workflows/cache-guard.yml probe against production.
  localeCookie: false,
});
