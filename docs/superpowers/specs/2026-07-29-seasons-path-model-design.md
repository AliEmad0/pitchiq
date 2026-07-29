# Season pages in the path — `/seasons/[year]` and the season directory

**TASK-M71a** · 2026-07-29 · Status: approved, not yet implemented

## Why

PitchIQ holds 34 seasons of Premier League history. Today **none of it is
discoverable**. A historical season is reachable only through `?season=YYYY` on
the header's `<select>` — and a `<select>` is not a link, so no crawler can
operate it. The sitemap excludes historical seasons. The archive that is the
product's main asset is invisible to search engines and has no browsable index.

Separately, `src/app/[locale]/page.tsx` reads the server `searchParams` prop, so
the dashboard is rendered on demand and served `private, no-store` with
`x-vercel-cache: MISS`. The daily `Cache guard` reports it as a known gap.

Moving the season into the URL path fixes both: season pages become real,
prerenderable, linkable documents.

### This supersedes a prior non-goal — deliberately

[`2026-07-25-season-rendering-free-tier-design.md`](2026-07-25-season-rendering-free-tier-design.md)
listed two non-goals that this spec reverses:

> - Independently indexing historical-season pages (explicitly dropped; already
>   not in the sitemap).
> - Refactoring the global header season switcher / list-page season behavior
>   (standings, leaderboards, fixtures list, home). Those are bounded (N seasons,
>   not N × entities) and cheap.

That reasoning was sound **as a cost argument**, and it still is. It was never a
product argument. Owner decision (2026-07-29): the archive should be indexable
and browsable, so the season belongs in the path.

**Be honest about the payoff.** This is an SEO and product change. The CPU saving
is incidental and probably small — the prior spec measured list pages as bounded
and cheap, and `/` was never shown to be expensive. Do not justify this work on
hosting cost.

### What was actually learned on 2026-07-29

The `searchParams` → dynamic-rendering link was already documented on 07-25. Two
things genuinely were not:

1. **`export const revalidate` alone lets the render fall back to dynamic.** A
   page also needs `export const dynamic = "force-static"` or Vercel serves it
   `private, no-store` + MISS. Fixed for `/players/[id]` and `/fixtures/[id]` in
   PR #59.
2. **`force-static` does NOT override a server `searchParams` read** — its
   documented coercion covers `cookies()`, `headers()` and `useSearchParams()`,
   not the `searchParams` prop. Such a route emits **zero** prerendered pages
   despite `generateStaticParams`, while the build's route table still prints
   `● (SSG)`. Verified by counting `.next/server/app/<locale>/<route>/*.html`:
   players 537/locale, fixtures 380/locale, **teams 0, managers 0**.

## Scope

**In:** `/`, `/seasons`, `/seasons/[year]`, the redirect, the switcher's
navigation model, `?season=` back-compat, sitemap and canonicals.

**Out:** the section indexes (`/teams`, `/players`, `/fixtures`, `/leaderboards`,
`/managers`) — TASK-M71b. `/teams/[id]` and `/managers/[id]` — TASK-M71c, and
note the prior spec's data says those are ~1% of cost, so M71c is an SEO/
consistency change too, not a cost fix. Enriching hub cards beyond season +
champion is out.

## Routing model

| URL | Renders | Prerendered |
| --- | --- | --- |
| `/` | Bento dashboard, current season | yes |
| `/seasons/[year]` | The same dashboard, that season | yes — 34 × 2 locales |
| `/seasons` | Directory of all 34 seasons | yes |
| `/seasons/<current>` | 308 → `/` | edge redirect, no render |

`/[locale]/page.tsx` stops reading `searchParams` entirely — that is the change
that makes it prerenderable. `/seasons/[year]/page.tsx` takes the year from
`params` and renders the identical component tree.

**The redirect goes in `next.config` `redirects()`**, not a Server Component
`redirect()`, so it is handled at the edge and costs no Active CPU. Its target is
computed from `currentDataSeason()` at build time. At the August rollover the
target moves automatically and the previous season stops redirecting and becomes
a real page — no manual step, but **it does mean a deploy is required for the
rollover to take effect**.

Invalid or out-of-range years (`/seasons/1985`, `/seasons/abc`) → `notFound()`.
`generateStaticParams` returns the committed seasons from `_meta.json`, so the
prerendered set always matches the data.

## Transitional behaviour

M71a ships alone, so the section indexes still use `?season=`. Until M71b:

- `SeasonSwitcher` navigates to `/seasons/<year>` when the current route is `/`
  or `/seasons/*`; everywhere else it keeps writing `?season=`.
- `withSeason()` / `NavLink` / `PrimaryNav` / `MobileNav` still append
  `?season=<year>` when leaving a season page for a not-yet-migrated section, so
  `tests/e2e/season-nav.spec.ts` continues to pass unchanged.
- `/?season=YYYY` 308-redirects to `/seasons/YYYY` so existing bookmarks, shared
  links and anything already indexed keep working.

This dual behaviour is temporary and must be deleted in M71b. Leave a comment at
both sites saying so.

## The season directory (`/seasons`)

A grid of 34 cards, newest first, each linking to that season's page. Card
content is **season + champion only** — deliberately minimal (YAGNI); enrich only
if the page proves to get traffic.

### Card design (gallery concept A8 + logo)

```
PREMIER LEAGUE        ← kicker, 9px, uppercase, .14em tracking, 50% opacity
2003–04               ← oversized year, 800 weight, magenta en-dash
[crest] Arsenal       ← club logo then name
```

The year is the anchor and the club is supporting. That ordering is load-bearing:
it is what makes Blackburn 1994-95 and Leicester 2015-16 look as considered as
Arsenal 2003-04. Validated across six real champions.

**Longest name is "Manchester United"** — needs a min-width or truncation rule so
it does not wrap raggedly at narrow widths.

Champion comes from the committed standings for that season (rank 1); the crest
uses the existing local `/logos/<team-id>.png` and `<PlayerImage>`-style
fallback conventions.

## Motion

All of it `prefers-reduced-motion`-gated, all transform/opacity only so
`tests/unit/motion-audit.test.ts` passes unchanged.

**Card entrance** (once, when the card scrolls into view):

| Step | Effect | Timing |
| --- | --- | --- |
| Kicker | fade | 0–400ms |
| Year | `rotateX(-72deg)` → 0 | 0–550ms |
| Club row | rise 12px + fade | 200–650ms |
| Magenta dash | `scaleX(0→1)`, origin left | 380–830ms |

**Card hover:**

- Magnetic drift — card translates toward the pointer (max ~16px x, 12px y),
  springs back on leave.
- Club-colour bleed — a radial gradient in the champion's colour grows from the
  cursor position.
- Crest spins once (360°, 700ms).
- Kicker letters spread — **per-letter `translateX`, not `letter-spacing`**.

> `letter-spacing` triggers layout every frame and is rejected by the motion
> audit. The kicker is split into per-letter spans, each translated
> proportionally to its index. This requires a splitter that preserves the
> translated string — it cannot be a bare `{t("premierLeague")}`.
> **Not applied for `ar`**: letter-spacing on joined Arabic script is
> typographically wrong. The `ar` card keeps every other hover effect.

**Grid hover:** hovering a card dims the other 33 to ~28% opacity. Opacity only.

**Grid entrance:** depth arrival — cards come forward from `translateZ(-300px)`
with a slight rise, ~800ms, `cubic-bezier(.22,1,.36,1)`.

**Scroll-triggered per row via IntersectionObserver, not on page load.** With 34
cards most are below the fold; a load-time stagger animates content nobody is
looking at and finishes before it is scrolled to.

Depth arrival is direction-neutral, so it needs no RTL mirror.

### Assumption to confirm or reverse

Two selected hover effects conflicted — a magenta panel sweep and the
club-colour bleed are both full-card fills, and run together they muddy into one
wash with the club colour losing. **Decision: keep the club-colour bleed, drop
the magenta sweep**, because the club colour differs per season (it carries
information) and is cursor-driven so it composes with the magnetic drift.
Reversing this is a one-line change.

## SEO

- `/seasons/[year]` is self-canonical. `/` is self-canonical. `/seasons/<current>`
  never renders, so it cannot compete.
- Sitemap gains `/seasons` and all 34 `/seasons/[year]` for both locales. Any
  `?season=` URLs are removed from it.
- `robots.txt` currently disallows `?season=`; that stays — the query form is now
  purely a redirect surface.
- `/seasons` is the internal-linking parent that makes the 34 pages reachable.
  Without it they would be orphans and this whole exercise would not pay off.

## Testing

**Unit**
- Season-path helpers: build/parse `/seasons/<year>`, reject out-of-range and
  non-numeric, round-trip against `parseSeason`.
- The redirect target equals `currentDataSeason()`.
- `generateStaticParams` returns exactly the committed seasons.

**E2E**
- `/seasons` lists 34 cards and each links to its season page.
- `/seasons/2010` renders 2010-11 standings.
- `/?season=2010` redirects to `/seasons/2010`.
- `/seasons/<current>` redirects to `/`.
- The switcher navigates to a path on `/` and to `?season=` on a section index.
- `/ar/seasons/2010` renders RTL with Arabic entity names — **assert on rendered
  text via the browser, never by grepping HTML** (next-intl serialises the whole
  message catalog into every page, so any UI string matches whether or not it
  rendered).

**Guards**
- `motion-audit` and `no-hardcoded-strings` pass unchanged.
- After deploy, `/` moves from the cache guard's report-only `note()` list into
  the enforced `check()` list. That promotion is the acceptance test.

## Risks

- **Build size.** 34 seasons × 2 locales × (season page + hub) ≈ 70 extra pages
  against 1,835 already prerendered. Negligible, but confirm the build time does
  not regress.
- **The dual switcher behaviour** is the main source of bugs in M71a. It is
  temporary; delete it in M71b.
- **Rollover requires a deploy** for the redirect target to move. Deploys happen
  most days, so this is minor, but it is a real coupling.
- **A season with no committed standings** would render a championless card.
  `generateStaticParams` reads `_meta.json`, so this should not occur — but the
  card must degrade gracefully rather than throw.
