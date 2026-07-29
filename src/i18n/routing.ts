import { defineRouting } from "next-intl/routing";

// TASK-1601 — locale routing. Path-prefix with `as-needed`: the default locale
// (en) keeps un-prefixed URLs (/teams/42); Arabic is served under /ar/*.
//
// `localeDetection: false` (TASK-1602) makes English the guaranteed default: the
// bare "/" always serves English regardless of the visitor's Accept-Language
// header, instead of auto-redirecting an Arabic-locale browser to /ar. Arabic is
// opt-in via the header switcher (which persists the choice in the URL + cookie).
export const routing = defineRouting({
  locales: ["en", "ar"],
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
