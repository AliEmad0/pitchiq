/**
 * Is this request obviously a vulnerability scanner rather than a visitor?
 *
 * ⭐ HOSTING COST, measured 2026-08-27. Every unknown URL on this site runs a **Node
 * function**: a non-dotted path falls through to `[locale]/[...rest]/page.tsx` and a dotted one
 * to `[locale]/page.tsx`, and both answer `x-vercel-cache: MISS` on every single request —
 * verified on production against `/wp-login.php`, `/.env`, `/admin.php`, `/wp-admin`,
 * `/.git/config` and `/xmlrpc.php`. A public site is probed for these around the clock, and
 * every probe was buying a React render to produce a 404. Answering them in middleware costs
 * edge time instead, which is the cheapest thing this stack has.
 *
 * ⛔ A DENYLIST OF JUNK, deliberately — NOT an allowlist of the app's real segments. An
 * allowlist would be more complete, but it would also mean a human who mistypes `/playerz`
 * gets a bare edge 404 instead of the branded `not-found` page, and it would 404 any new
 * section whose author forgot to update a list here. Nothing below can match a plausible typo
 * of a real page: the app serves no `.php`, and no route begins with a dot or with `wp-`.
 *
 * ⚠️ `.well-known` is REAL and must never be caught — ACME challenges and
 * `apple-app-site-association` live there, and 404ing it silently breaks certificate renewal
 * and universal links.
 *
 * ⚠️ Kept in step with `middleware.ts`'s matcher by hand, and the two must not drift: the
 * matcher decides what REACHES middleware, this decides what gets the 404. This predicate is
 * deliberately at least as broad as the matcher's probe entries, so a path admitted by them
 * can never fall through to the locale rewrite.
 */

/** Extensions this app never serves. ⛔ Positive list — see the note in `middleware.ts`. */
const PROBE_EXTENSION =
  /\.(?:php|phtml|php[0-9]|asp|aspx|jsp|jspx|cgi|pl|env|sql|bak|old|ini|sh|bash|yml|yaml|swp|log)$/i;

/**
 * A first path segment that begins with a dot — `/.env`, `/.git/config`, `/.aws/credentials`.
 * ⚠️ `.well-known` is a real, standardised directory and is excluded.
 */
const DOT_DIRECTORY = /^\/\.(?!well-known(?:\/|$))/;

/** Classic scanner prefixes. None of these is, or could become, a section of this app. */
const PROBE_PREFIX =
  /^\/(?:wp-|wordpress(?:\/|$)|phpmyadmin(?:\/|$)|pma(?:\/|$)|cgi-bin(?:\/|$)|vendor(?:\/|$)|autodiscover(?:\/|$)|owa(?:\/|$)|_ignition(?:\/|$)|actuator(?:\/|$))/i;

export function isProbePath(pathname: string): boolean {
  return (
    DOT_DIRECTORY.test(pathname) || PROBE_PREFIX.test(pathname) || PROBE_EXTENSION.test(pathname)
  );
}
