# Free-tier-safe season rendering for entity detail pages

**Date:** 2026-07-25
**Status:** Approved design — ready for implementation planning

## Problem

The `pitchiq` Vercel project (Hobby/free plan) was paused for exceeding the
monthly Fluid **Active CPU** allowance (used ~12h against a 4h cap). The Vercel
Observability breakdown pinned the cost:

- `pitchiq` = 95.3% of all Active CPU (11h 27m).
- Within it, `/[locale]/players/[id]` alone ≈ 90% (~6 min CPU from 511 renders
  in a 12h window; `/[locale]/fixtures/[id]`, `/[locale]/teams/[id]`,
  `/[locale]/managers/[id]`, and `/[locale]/compare` follow, seconds each).
- Usage spiked from ~zero on ~Jul 17, matching the TASK-M65 deploys that rebuilt
  the player page into a heavy 66-field stat accordion with extended multi-season
  stats (~0.7s CPU per render).

### Root cause

The entity **detail pages read `searchParams`** (`?season=`) in the page
component **and** in `generateMetadata`. In Next.js 15, accessing `searchParams`
in either opts the route into **dynamic rendering**. So despite
`generateStaticParams` listing every current-season entity, the pages are **not
statically served** — every request (including bot crawls of the plain base URL
that the sitemap advertises) is a live server render.

This is confirmed by the data: ~511 renders for ~570 players in 12h ≈ roughly
one render per player. If the pages were static/cached, the function would not be
invoked per crawl at all.

### The free-tier constraint

`canonicalPath` deliberately keeps `?season=` for historical seasons so "each
historical season stays independently indexable." But keeping thousands of
historical-season pages individually server-rendered is fundamentally
incompatible with the free tier:

> ~570 players × ~20 seasons × 2 locales ≈ 23,000 pages × ~0.7s CPU ≈ **~4.4
> CPU-hours for a single crawl pass** — over the entire 4h monthly cap, even if
> each URL renders only once.

**Decision (approved):** render only the **current season** on the server; load
historical seasons **client-side** on demand. Only the current season is
search-indexed — which already matches the sitemap (it excludes historical
seasons).

### Scope decision (data-driven, 2026-07-25)

The observability per-render costs (CPU ÷ invocations, 12h window):

| Page | Invocations | Total CPU | Per render |
| --- | --- | --- | --- |
| `players/[id]` | 511 | 6 min | **~0.70s** |
| `fixtures/[id]` | 151 | 21s | ~0.14s |
| `teams/[id]` | 194 | 7s | ~0.036s |
| `managers/[id]` | 45 | 2.68s | ~0.06s |

`players/[id]` is ~90% of the cost and ~20× heavier per render (the TASK-M65
66-field accordion). `teams`/`managers` are already dynamic but so cheap per
render they barely register — and `teams/[id]` is architecturally expensive to
convert (five Suspense server-loader sections, each fetching its own season
data). Converting them is high risk for ~1% savings.

**Approved scope:** full client-side season swap on **`players/[id]` only**;
**`fixtures/[id]`** gets SSG + `revalidate`; **`teams/[id]` and `managers/[id]`
are NOT refactored** (they keep today's `searchParams`-driven rendering). All
four detail pages still get the global `robots` + `revalidate` fixes.

## Goals

1. Detail pages for the current season render statically (SSG) and are served
   from the CDN — bot crawls cost ~zero runtime Active CPU.
2. Historical seasons remain reachable to real users (client-side), just not
   server-rendered or indexed.
3. Bring `pitchiq` Active CPU back under the free-tier cap.

## Non-goals

- Independently indexing historical-season pages (explicitly dropped; already not
  in the sitemap).
- Refactoring the global header season switcher / list-page season behavior
  (standings, leaderboards, fixtures list, home). Those are bounded (N seasons,
  not N × entities) and cheap; they keep the existing `shallow:false` RSC model.
- Reducing per-render CPU of the stat accordion (moot once current-season pages
  are static — that render happens at build/ISR time, not per request).

## Design

### 1. Static current-season rendering — `players/[id]` only

> Scope note: only `players/[id]` gets this refactor (see Scope decision above).
> `teams/[id]` and `managers/[id]` keep today's `searchParams`-driven rendering.

For the player page:

- Remove `searchParams` from **both** the default page component **and**
  `generateMetadata`. Both always use `currentDataSeason()`.
- Keep `generateStaticParams` (already enumerates current-season entities) →
  pages prerender as static and serve from CDN.
- `generateMetadata`:
  - `canonical` → season-less current (`canonicalPath(locale, "/players/${id}")`).
  - OG image → pinned to the current season.
- Add `export const revalidate = 86400` (24h) so the static page refreshes after
  the daily data cron.

`dynamicParams` behavior for non-current / unknown ids: unchanged conceptually
(current-season entities are SSG; a genuinely unknown id still resolves to
`notFound()`), but the on-demand render path must no longer depend on
`searchParams`.

### 2. Client-side historical seasons (player page only)

- Introduce a client wrapper (e.g. `PlayerSeasonView`) that:
  - receives the server-rendered **current-season** data as initial state,
  - renders the same presentational subtree (hero / stats / splits / trivia for
    players; the analogous subtrees for teams and managers),
  - on season change (via `EntitySeasonSwitcher`), fetches the selected season
    from the entity's API, swaps the rendered data, and updates the URL to
    `?season=X` **shallowly** (no RSC refetch),
  - handles the "entity didn't play/exist that season" empty-state client-side
    (the current `DataUnavailable` card).
- `EntitySeasonSwitcher` switches from the `shallow:false` `useSeason` binding to
  a shallow, client-fetch variant scoped to entity detail pages. The global
  header switcher and list pages keep `useSeason` (`shallow:false`) unchanged.
- **Confirmed by owner:** the hero / stats / splits / trivia components are
  presentational and receive data via props — none query the database inside the
  component. The plan still verifies each before wiring, but no server-only
  refactor is expected.

### 3. New per-season API for the player profile

- The existing `/api/players/[id]` returns the **slim** compare-card shape
  (`getPlayerSlim`), not the full profile — so it can't be reused for the swap.
- Add `/api/players/[id]/profile?season=&locale=` returning the full
  `getPlayerProfile(id, season)` shape the page renders.
- Reuse existing endpoints for the rest of the season-dependent subtree:
  `/api/players/[id]/seasons` (season-independent known seasons) and
  `/api/trivia?scope=player&id=&season=` (returns `{ facts }`).
- No new team/manager endpoints — those pages are out of scope.

### 4. `fixtures/[id]`

- Does **not** use `searchParams` (season is derived from the fixture id via
  `seasonFromFixtureId`). It is dynamic only because it lacks
  `generateStaticParams`.
- Fix: add `generateStaticParams` for current-season fixtures + `revalidate`.
  No client refactor, no API.

### 5. Global fixes

- `robots.ts`: add `Disallow: /*?season=` alongside the existing `/api/` rule, so
  compliant crawlers never hit query URLs. (The switcher is a `<Select>`, so bots
  only reach seasons via a few `<a href="?season=">` CTA links — those get
  blocked too.)
- `revalidate` on all four detail pages (see above).

## Testing

- Unit tests for the new `/api/teams/[id]` and `/api/managers/[id]` routes
  (season param handling, shape, not-found).
- A test/assertion that the four detail pages do not opt into dynamic rendering
  (no `searchParams` access in page or metadata).
- Verify `pnpm build` output marks the detail routes as static (`○` / SSG) rather
  than dynamic (`ƒ`).
- Manual/e2e: current season renders server-side; switching to a historical
  season swaps client-side and updates the URL without a full navigation; a
  deep-linked `?season=X` loads (current-season shell → client swap); empty-state
  shows for a season the entity didn't play.

## Rollout

- Feature branch → PR → watch CI → merge on green (per the PitchIQ git workflow;
  never push directly to `main`).
- After the next monthly usage reset (or upgrade), confirm via Vercel
  Observability that `/[locale]/players/[id]` et al. no longer dominate Active
  CPU.

## Risks / open items

- Presentational-component client-renderability (see §2) — the main unknown.
- Deep-linked historical `?season=` URLs render the current-season shell first,
  then swap client-side (minor flash). Acceptable given they are not indexed.
- `robots` only constrains compliant bots; the static-caching change is what
  actually defends against non-compliant scrapers.
