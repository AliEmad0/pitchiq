// Primary site navigation. Shared between the desktop Header (TASK-102)
// and the mobile drawer (TASK-103) so a route addition lives in exactly
// one place.
// `key` indexes the `nav` message namespace (src/i18n/messages/*.json) so the
// nav renders localized labels (TASK-1601); `label` stays as the English
// fallback / test anchor.
export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", key: "dashboard" },
  { href: "/teams", label: "Teams", key: "teams" },
  { href: "/managers", label: "Managers", key: "managers" },
  { href: "/players", label: "Players", key: "players" },
  { href: "/leaderboards", label: "Leaderboards", key: "leaderboards" },
  { href: "/fixtures", label: "Fixtures", key: "fixtures" },
  { href: "/compare", label: "Compare", key: "compare" },
  { href: "/map", label: "Map", key: "map" },
  // TASK-1832 — the game hub. Last on purpose: it is the one destination that is not the
  // encyclopedia, and it must never be a SECTION_SLUG or `navHrefForSeason` would rewrite
  // it to /seasons/<year>/game on a historical page.
  { href: "/game", label: "Game", key: "game" },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];

// Phase 15 redesign (TASK-1502): the desktop header renders a segmented pill
// nav. These hrefs show inline; everything else in NAV_ITEMS folds into a
// "More ▾" dropdown. The mobile drawer + footer still use the full NAV_ITEMS
// list, so a route addition only needs a decision here about primary vs
// overflow placement.
// TASK-1832 added `/game` here — accented in PrimaryNav so it reads as a departure from
// the encyclopedia. It was in neither the nav nor the sitemap before, which is why the
// whole game was reachable only by typing the URL.
//
// `/compare` is back inline. It was pushed into "More ▾" by TASK-1832 purely because six
// pills overflowed the header at the time; TASK-M79 then changed the geometry underneath
// that decision, so the move was obsolete almost immediately and is now reverted.
//
// The budget, measured at 1024px — the tight width, because TASK-M79 reveals the pill row
// at `lg` and keeps the ⌘K button icon-only between `lg` and `xl`: 88px logo + 454px nav
// + 258px controls + 32px gaps + 64px padding = **896px of the 1024 available**, i.e. ~128px
// spare (slightly less when a vertical scrollbar is showing), which is what a sixth pill
// spends. Nothing in this row can shrink, so anything added here spends real budget.
//
// ⚠️ Check a change by RUNNING `tests/e2e/header-overflow.spec.ts` (twenty widths × both
// locales), never by doing arithmetic against the numbers above. Those numbers have gone
// stale twice already — once per header ticket — and arithmetic against a remembered
// constant is exactly how TASK-1832 shipped a demotion it did not need.
export const PRIMARY_NAV_HREFS: readonly string[] = [
  "/",
  "/teams",
  "/players",
  "/fixtures",
  "/compare",
  "/game",
];
