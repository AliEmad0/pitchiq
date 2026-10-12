# Static-data archive for match and player pages (TASK-M96)

**Status:** approved by the owner 2026-10-12. Implementation is in two PRs (matches first,
then players). Measurements are in [`deployment-storage.md`](../../deployment-storage.md).

## Goal

Bring one production build from **~4.9 GB to ≤ ~1.5 GB**, so that the deployments Vercel
always keeps on Hobby fit under the **10 GB** Deployment Storage limit with room to spare.
Vercel keeps the last 3 deployments created plus the last 3 production deployments,
regardless of the retention policy. Turning branch previews off makes those the same 3
builds.

## Hard constraint (owner, 2026-10-12): no new cost on any other meter

Fixing storage must not move cost onto anything else on the Hobby plan. Every acceptance
criterion below is a gate, not a goal.

| Meter                 | Rule                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fluid Active CPU      | **No new request-time rendering.** Archive data is prerendered static JSON (`force-static`, `dynamicParams = false`, `revalidate = false`) served by the CDN, so a visit runs no function. |
| Middleware CPU        | At most a string check plus a set lookup and a rewrite. No `fetch`, no data parsing per request.                                                                                           |
| ISR writes            | None. No `dynamicParams = true`, no positive `revalidate`. The 2026-08-29 scraper incident (145,000 of 200,000 writes in two days) must stay impossible.                                   |
| Function invocations  | Archive views must never call `/api/players/[id]/profile`, `/api/trivia`, or any other request-time route.                                                                                 |
| Build time and memory | Fewer prerendered pages; the build must get faster, not slower.                                                                                                                            |
| Data transfer         | One small JSON per visit (≈ 5–40 KB), CDN-cached.                                                                                                                                          |

## Design

### Which pages are archived

- **Matches:** every fixture outside the current data season. The current season's ~380
  matches stay fully prerendered (they are in the sitemap).
- **Players:** every player with no row in the current season. Current-season players
  (~550) stay fully prerendered, including their in-page season switcher.

### Data

Each archived entity gets one prerendered JSON file from a `force-static` route handler
with `generateStaticParams` over the archived ids, the same pattern as
`/api/game/rivals/[club]`:

- `/api/archive/fixtures/[id]` holds the same `FixtureDetail` the match page renders.
- `/api/archive/players/[id]` holds everything the player page renders for **all** of that
  player's seasons: profile per season, career record, market value, and trivia facts
  computed **at build time**.

These are data files only, with no HTML, layout, or duplicate RSC payload, so each is a few
KB instead of ~200 KB.

### Pages

- `/[locale]/archive/fixture` and `/[locale]/archive/player` are single static client shells.
  Each reads the entity id from `location.pathname`, fetches its JSON, and renders **the
  same components** the prerendered page uses (`FixtureHeader`, `PitchLineup`,
  `EventTimeline`, `StatComparison`; the player-page components).
- `/[locale]/fixtures/[id]` and `/[locale]/players/[id]` keep `dynamicParams = false` and now
  prerender only the current-season set.

### Routing

`src/middleware.ts` rewrites `/fixtures/<archived id>` and `/players/<archived id>` to the
archive shells. The visible URL is unchanged, so every existing link, bookmark and season
query keeps working. It decides from a **build-time generated** id set:

- An id in the archive set is rewritten to the shell.
- Any other id falls through to the route, which returns a real **404** for unknown ids
  (TASK-M72 soft-404 rule preserved).

### What changes for users

- Archived pages render in the browser after one small fetch instead of arriving as
  finished HTML. On a normal connection that is a brief loading state.
- Archived pages have no per-entity `<title>`/OG tags in the initial HTML. The shell sets
  `document.title` after load. They were never in the sitemap, and the site is not indexed
  yet.
- The current season is untouched.

## Verification (each PR)

1. Full local build (fonts mocked, 2 GB heap cap): page count, output size by route, peak memory.
2. Size of the archive JSON set.
3. Unit tests:
   - the id-set split is exhaustive and disjoint;
   - archived routes are `force-static`;
   - middleware rewrites archived ids, passes current-season ids, and 404s unknown ids.
4. E2E: a historical match and a historical player render their content; an unknown id still
   returns HTTP 404.
5. After deploy: the Vercel dashboard shows no rise in Active CPU or invocations, and
   Deployment Storage per build drops as measured.

## Rollout

1. **PR A:** previews off (`vercel.json` `git.deploymentEnabled: { "**": false, "main": true }`)
   plus the match archive.
2. **PR B:** the player archive.

Arabic is parked (routing has `en` only). If it returns, the archive JSON needs a per-locale
variant for localized entity names.
