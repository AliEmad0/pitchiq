# TASK-M71b — Section indexes in the season path: Design

**Status:** Approved 2026-07-30. **Owner decisions:** (1) URL model = season-path pages (`/seasons/<year>/<section>`), not client-swap; (2) the index→detail season crossing (path → query) is accepted, detail pages are NOT re-architected.

## Why

The five section index pages — `/teams`, `/players`, `/fixtures`, `/leaderboards`, `/managers` — each read the server `searchParams` prop (`?season=`) in `generateMetadata` and the page body. That opts them into dynamic rendering; `force-static` cannot override a `searchParams` read (measured repeatedly — see [[pitchiq-vercel-cpu-pause]]), so all five emit **zero** prerendered pages and every view costs a Fluid Active-CPU invocation. They are the last route class still doing this — every entity DETAIL route and the season dashboards are already prerendered (M71a, M71c).

This is the third and final M71 sub-project. It also completes the URL model M71a introduced: seasons live in the path. And it retires the transitional `?season=` behavior M71a deliberately left in the switcher and nav (with a "delete in M71b" comment at both sites).

## Scope

**In:** the five section indexes become season-path pages; the current-season/`?season=` edge redirects; the season switcher + primary/mobile nav become path-aware across `/seasons/<year>/*` (deleting the `?season=` dual behavior); sitemap + canonicals for the new URLs.

**Out:** the entity DETAIL pages (`/teams/[id]`, `/managers/[id]`, `/players/[id]`, `/fixtures/[id]`) — they shipped query-based in M71c and stay that way. Migrating them to `/seasons/<year>/<section>/<id>` is a large separate re-architecture, explicitly deferred (owner: "accept the crossing"). Enriching the index pages beyond their current content is out.

## URL model (mirrors the M71a season-dashboard model exactly)

| URL                                                                 | Renders                           | Prerendered                                            |
| ------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------ |
| `/<section>` (teams · players · fixtures · leaderboards · managers) | that section, **current** season  | yes — 5 × 2 locales                                    |
| `/seasons/<year>/<section>`                                         | that section, that season         | yes — 33 non-current seasons × 5 × 2 locales = **330** |
| `/seasons/<current>/<section>`                                      | 308 → `/<section>`                | edge redirect, no render                               |
| `/<section>?season=<year>`                                          | 308 → `/seasons/<year>/<section>` | edge redirect (back-compat)                            |

The bare URL is the current season (like `/` is the current dashboard); the path form is historical; the current-season path form redirects to the bare URL so the current season has a single canonical URL; old `?season=` links redirect to the path form.

**The index→detail crossing (accepted):** clicking an entity on `/seasons/2003/teams` links to `/teams/42?season=2003` — the M71c detail deep-link. The season crosses from path (collection) to query (entity). Each model is locally sensible; no M71c rework.

## Route & component structure

Each index page today is a season-parameterized Server Component: fetch the season's data → render a header + a client filter/list component (`<TeamFilter>`, etc.). Extract that body into a shared async Server Component per section, e.g.:

```
src/features/teams/components/TeamsIndex.tsx      →  <TeamsIndex season={n} locale={s} />
src/features/players/components/PlayersIndex.tsx
src/features/leagues/components/FixturesIndex.tsx
src/features/players/components/LeaderboardsIndex.tsx   (leaderboards live under players/)
src/features/managers/components/ManagersIndex.tsx
```

(Confirm the actual current owning folder for each during planning; follow the existing import paths.)

Then two thin pages per section consume it:

- `src/app/[locale]/<section>/page.tsx` — `force-static`; renders `<XIndex season={currentDataSeason()} />`. Drops the `searchParams` prop entirely.
- `src/app/[locale]/seasons/[year]/<section>/page.tsx` — `force-static` + `dynamicParams = false`; `generateStaticParams` returns the 33 non-current committed seasons; parses `[year]` via `parseSeasonSegment` and `notFound()`s an invalid/out-of-range year; renders `<XIndex season={year} />`.

This is exactly how M71a extracted `<SeasonDashboard>` for `/` and `/seasons/[year]`. The nested pages are siblings of the existing `seasons/[year]/page.tsx` dashboard — App Router allows `[year]/page.tsx` and `[year]/teams/page.tsx` to coexist.

**Metadata:** both pages set a self-canonical (`canonicalPath(locale, "/seasons/<year>/<section>")` for the path form, `canonicalPath(locale, "/<section>")` for the bare form — season-less, matching the `/players/[id]` precedent) and the section's existing OG image pinned to the rendered season.

## Redirects (`next.config.ts`)

Extend the existing `redirects()` (added in M71a). For each of the five sections, generated in a loop over a `SECTIONS` array so it stays DRY:

- `/seasons/:year(<CURRENT>)/<section>` → `/<section>` (and the `/ar` twin)
- `/<section>` with `?season=<4 digits>` → `/seasons/:year/<section>` (and the `/ar` twin)

Reuse the existing `CURRENT_SEASON_FOR_REDIRECT` constant (already pinned to `currentDataSeason()` by `tests/unit/next-config-redirects.test.ts`) — do NOT introduce a second copy of the current-season literal. Extend that guard test to assert the section redirects derive from the constant, so the August rollover stays a one-line change.

**Known Next behavior (from M71a):** Next forwards the incoming query onto the redirect destination, so `/teams?season=2003` → `/seasons/2003/teams?season=2003`. Harmless — the force-static index ignores the query and self-canonicalises to the bare path. Tests must expect the forwarded query.

## Switcher + nav rework (retire the transitional `?season=`)

- **`SeasonSwitcher`:** its `seasonIsInPath` guard currently covers `/` and `/seasons/*`. Extend it to treat the bare section indexes as path-model too: on `/teams` (etc.) and any `/seasons/<year>/*`, picking a season navigates to `/seasons/<year>/<section>` (or the bare `/<section>` for the current season), deriving the current section from the pathname. Once every season-bearing page is path-based, **delete the `useSeason()`/`?season=` branch** entirely.
- **`PrimaryNav` / `MobileNav` / `NavLink`:** currently append `?season=` via `withSeason()` to carry the viewed season across sections. Replace with path-building: on a `/seasons/<year>/*` page, section links become `/seasons/<year>/<targetSection>`; on a bare current-season page they stay bare. **Delete the `withSeason()` usage in the navs** (the helper itself may still be used elsewhere — check before removing the export).
- The entity DETAIL pages are unaffected: the header `SeasonSwitcher` is already hidden there (M71a), and their in-page `PlayerSeasonSelect` keeps its `?season=` client-swap (M71c). Deleting the switcher's query branch is safe because detail pages don't use the switcher.

`tests/e2e/season-nav.spec.ts` currently asserts `?season=` is carried across nav; it must be rewritten to assert the path form is carried instead.

## Sitemap + canonicals

Add every `/seasons/<year>/<section>` to the sitemap (33 × 5 = 165 URLs, each with its `/ar` alternate — well under the 10k limit). The current-season bare indexes are already effectively covered; ensure `/teams` etc. remain listed once (bare, canonical). Exclude `/seasons/<current>/<section>` (it redirects).

## Prerender / cost outcome

All five indexes emit 0 static pages today. After: the 5 bare indexes × 2 locales = **10** pages go dynamic → static (same URLs, now CDN-served), plus **330** genuinely new nested pages (33 non-current seasons × 5 sections × 2 locales) — **340 prerendered index pages total**. Every index view becomes `x-vercel-cache: HIT` + `public`. After this lands, **no route in the app reads the server `searchParams` prop except `/compare`** (which genuinely needs it and stays dynamic).

## Testing

- **Unit:** the shared `<XIndex>` components render the passed season; the extended next-config redirect guard; the switcher/nav path-building helpers; sitemap includes the season-section URLs and excludes the current-season path form.
- **Build verification:** count emitted pages per section via **Python** (`ls`/`find` globs are unreliable through `wsl.exe` — see [[pitchiq-wsl-toolchain]]); confirm `seasons/<year>/<section>.html` counts (33/locale each) and that the bare `<section>.html` exists.
- **Production-accurate e2e (serial, `next start`):** a `/seasons/<year>/<section>` renders that season; `/seasons/<current>/<section>` 308s to `/<section>`; `/<section>?season=<year>` 308s to the path form; the switcher on an index navigates within the path; cross-section nav carries the season in the path; `/ar` renders RTL. Unknown year → 404 (M72 must hold — never add a `loading.tsx`).

## Traps (carried from M71a/M71c/M72 — do not relearn)

- `force-static` does NOT override a server `searchParams` read; dropping the prop is the actual fix. Verify by counting emitted `.html`, never the build route table's `● (SSG)`.
- Never add a `loading.tsx` above a segment that can `notFound()` (TASK-M72 — resurrects soft 404s).
- Don't grep rendered HTML for i18n copy (the whole catalog serialises into every page); assert on structure / rendered text.
- Local Playwright timing is untrustworthy; judge scoped `--workers=1` runs and rely on CI (retries) for the full suite. Never pipe `next build` through `tail` (masks a failed build).
- Reuse `revealProps()`/`<RevealController>`; never render `data-revealed` from React.
- `next.config.ts` runs outside the `@` alias — it cannot import `@/utils/season`; the current-season literal stays inlined as `CURRENT_SEASON_FOR_REDIRECT`.
