import { SECTION_SLUGS } from "@/features/seasons/section-slugs";

import { EARLIEST_SEASON, LATEST_DATA_SEASON } from "./season";

/**
 * TASK-M71a — the season lives in the URL path, not `?season=`.
 *
 * `/seasons/<year>` is a real prerendered document: crawlable, linkable, and
 * cheap to serve. The query form survives only as an edge redirect (see
 * `next.config.ts`), because a page that reads the server `searchParams` prop
 * is opted into dynamic rendering — and `force-static` does NOT override that,
 * so such a route prerenders nothing at all. See docs/hosting-cost.md.
 */
export function seasonPath(season: number): string {
  return `/seasons/${season}`;
}

/**
 * Parse a `[year]` route segment into a committed season, or null.
 *
 * Deliberately strict — exactly four digits, no sign, no leading zeros, no
 * surrounding whitespace. `/seasons/02003` must 404 rather than quietly render
 * 2003 at a second URL, which would split its indexing signal.
 */
export function parseSeasonSegment(segment: string): number | null {
  if (!/^\d{4}$/.test(segment)) return null;
  const year = Number(segment);
  if (year < EARLIEST_SEASON || year > LATEST_DATA_SEASON) return null;
  return year;
}

/**
 * The season a (locale-stripped) pathname is viewing, or null when it isn't a
 * `/seasons/<year>` page. Client nav components use this so links keep
 * carrying the viewed season (TASK-M25) now that the dashboard's season lives
 * in the path instead of `?season=`.
 */
export function seasonFromPathname(pathname: string): number | null {
  // `/seasons/<year>` (dashboard) or `/seasons/<year>/<section>` (TASK-M71b).
  const m = /^\/seasons\/(\d{4})(?:\/[a-z]+)?$/.exec(pathname);
  return m ? parseSeasonSegment(m[1]) : null;
}

// The section slug of a (locale-stripped) pathname — `/teams` or
// `/seasons/<year>/teams` → "teams" — or null when it isn't a section index.
function sectionOf(pathname: string): string | null {
  const m = /^\/(?:seasons\/\d{4}\/)?([a-z]+)$/.exec(pathname);
  return m && (SECTION_SLUGS as readonly string[]).includes(m[1]) ? m[1] : null;
}

/**
 * TASK-M71b — where the season switcher navigates when it picks `season` while
 * viewing `pathname` (locale-stripped; next-intl's router re-adds the locale).
 * On a section index it stays in that section; elsewhere it goes to the season
 * dashboard. The current season maps to the bare URL (its single canonical URL).
 */
export function seasonNavTarget(pathname: string, season: number, currentSeason: number): string {
  const section = sectionOf(pathname);
  if (section) {
    return season === currentSeason ? `/${section}` : `/seasons/${season}/${section}`;
  }
  return season === currentSeason ? "/" : `/seasons/${season}`;
}

/**
 * TASK-M71b — the nav href for a bare NAV_ITEMS `href` ("/", "/teams", …) given
 * the viewed `season`. Current season / no season → the bare href; a historical
 * season → the `/seasons/<year>/…` path form. Non-season routes (`/compare`,
 * `/map`) stay bare.
 */
export function navHrefForSeason(
  href: string,
  season: number | null,
  currentSeason: number,
): string {
  if (season === null || season === currentSeason) return href;
  if (href === "/") return `/seasons/${season}`;
  const slug = href.replace(/^\//, "");
  if ((SECTION_SLUGS as readonly string[]).includes(slug)) return `/seasons/${season}/${slug}`;
  return href;
}
