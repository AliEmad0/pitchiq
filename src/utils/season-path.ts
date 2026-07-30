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
  const m = /^\/seasons\/([^/]+)$/.exec(pathname);
  return m ? parseSeasonSegment(m[1]) : null;
}
