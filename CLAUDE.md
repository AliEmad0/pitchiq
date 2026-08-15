# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment — read this first

The project lives on the WSL Ubuntu filesystem. When Claude Code is launched from Windows, the working directory is a UNC path (`\\wsl.localhost\ubuntu\...`). **Node-toolchain commands cannot run from a Windows shell with a UNC cwd** — any tool that spawns `cmd.exe` (npm, npx, pnpm dlx, package postinstall scripts) fails with "UNC paths are not supported."

**All `pnpm`/`node`/`npx` commands must be invoked through WSL**, sourcing `nvm` to pick up Node 22:

```bash
wsl -d Ubuntu -- bash -c 'source $HOME/.nvm/nvm.sh && nvm use 22 > /dev/null && cd /home/aliemad/projects/pitchiq && pnpm <command>'
```

The Bash/Edit/Read tools work fine on the UNC path because they don't spawn `cmd.exe`.

## What this repo is

PitchIQ is a Premier League encyclopedia web app covering the complete history, 1992-93 → 2025-26 (34 seasons): standings, fixtures + match detail, team profiles + squads, player profiles, managers, a season-vs-season player comparison tool, leaderboards, a trivia layer, and an interactive historic map — with a Time-Machine theme that re-skins the UI per era, English + Arabic (RTL) localization, and motion.

**This repo contains the app + the committed data it renders.** The data lives as JSON snapshots under `data/`, refreshed by an **external pipeline** that opens data-only PRs here. This repo has no data-fetching/scraper code — it only reads the committed snapshots.

## Common commands

All run through WSL per the snippet above.

| Command                               | What it does                                                  |
| ------------------------------------- | ------------------------------------------------------------- |
| `pnpm dev`                            | Next.js dev server with Turbopack (port 3000)                 |
| `pnpm build`                          | Production build — also type-checks and lints                 |
| `pnpm start`                          | Serve the production build                                    |
| `pnpm type-check`                     | `tsc --noEmit`                                                |
| `pnpm lint`                           | ESLint (`--dir src --dir tests`)                              |
| `pnpm test`                           | Vitest, single pass                                           |
| `pnpm test:watch`                     | Vitest watch mode                                             |
| `pnpm test tests/unit/logger.test.ts` | Run a single test file                                        |
| `pnpm test -t "emits info"`           | Run tests matching a name pattern                             |
| `pnpm test:e2e`                       | Playwright E2E (offline against MSW via `TEST_MSW=1`)         |
| `pnpm test:e2e:install`               | One-time Playwright browser + system-lib install (needs sudo) |

## Architecture

### Data flow — server-side reads from committed JSON

Sports data comes from **committed JSON snapshots** under `data/` — `standings-<season>.json`, `teams-<season>.json`, `players-<season>.json`, `fixtures-<season>.json`, `leaderboards-<season>.json`, `lineups-<season>.json`, `events-<season>.json`, plus a single `_meta.json` (refresh provenance) and a cross-season `search-index.json` (powers the ⌘K global search). These are produced and refreshed by an external data pipeline.

- **Read path is `src/data/loaders.ts`** — server-only async loaders (`loadStandings`, `loadTeams`, `loadPlayers`, `loadFixtures`, `loadLeaderboard`, `loadMeta`, plus derived `loadPlayer` / `loadFixture` / `loadSquad` / `loadTeamStats` / `loadLineup` / `loadEvents` / `loadCaptains` / `loadManagers` …). Each reads a JSON file via `readFile`, parses, and validates against a Zod schema in `src/data/schemas.ts`. Returns `null` on ENOENT / parse error / schema violation; `[]` for derived filters that match zero rows.
- **Server-only enforcement**: every loader + every `src/features/*/api.ts` fetcher starts with `import "server-only";`. The fetchers are thin adapters — they call the loaders and reshape the flat committed shape into the wire shapes page components consume.
- **Route Handlers under `src/app/api/`** proxy the same fetchers for client-side use cases: `/api/search`, `/api/standings`, `/api/leaderboards/[kind]`, `/api/fixtures`, `/api/players/[id]`, `/api/players/search`, `/api/trivia`, `/api/admin/revalidate` (manual cache bust), `/api/health` (uptime + `_meta.json` freshness), and the dynamic OG-image routes under `/api/og/*`.

### Season model

- **34 seasons committed AND advertised (1992-93 → 2025-26).** `src/utils/season.ts#currentDataSeason()` (`= LATEST_DATA_SEASON`, 2025) is the default for every fetcher; `EARLIEST_SEASON` is 1992. `parseSeason` clamps `?season=` to `[EARLIEST_SEASON, currentDataSeason()]`. `getAvailableSeasons()` reads `_meta.json.seasons` (filtered `<= currentDataSeason()`), so the `<SeasonSwitcher>` lists exactly the committed seasons.
- **Stable player ids** — a player has ONE id across all seasons (a committed registry maps identity → id; the same id appears in multiple `players-<season>.json` files, one row per season played). `loadPlayer(id, season)` finds the per-season row. Never renumber ids — bookmarked `/players/<id>` URLs depend on them.
- **Entity-scoped season control** — on entity detail routes the global header `<SeasonSwitcher>` hides (`<HeaderSeasonSwitcher>` returns `null` when the path matches `/^\/(players|teams|managers)\/[^/]+$/`); `teams/[id]` + `managers/[id]` render a page-local `<EntitySeasonSwitcher>` scoped to the entity's own seasons (still `?season=`-driven, so still dynamically rendered).
- **`players/[id]` is the exception — it renders the current season server-side (SSG) and swaps history client-side.** It does NOT read `?season=` (reading `searchParams` de-statics every view — the Vercel Active-CPU regression, fixed 2026-07). Instead `<PlayerSeasonView>` holds the season subtree, and picking a season fetches `GET /api/players/[id]/profile?season=&locale=` (+ `/seasons`, `/api/trivia`) and swaps in place, syncing `?season=` via `window.location` + `history.pushState` (NOT `useSearchParams` — that would bail static prerender). Only the current season is server-rendered/indexed (matches the sitemap). `fixtures/[id]` is SSG via `generateStaticParams` + daily ISR; all four detail pages set `revalidate = 86400`.

### Cache strategy

The loaders read local JSON via `readFile` (no outbound fetches), so the Next fetch cache is not load-bearing for sports data. Cache-tag helpers live in `src/utils/cache-tags.ts` (convention enforced by `tests/unit/cache-tags.test.ts`); bust on demand via `GET /api/admin/revalidate?tag=<tag>&secret=<REVALIDATE_SECRET>`.

### Client-side data & URL state

- **TanStack Query is for client-interactive features only** (search, comparison) — not the SSR data layer. Mounted via `src/components/providers/QueryProvider.tsx`.
- Shareable client state lives in URL search params via **nuqs**, not Zustand. See `src/hooks/useComparisonSelection.ts` (`?a=&b=&sa=&sb=`).

### Styling & i18n

- **Tailwind CSS v4** — config is CSS-based (`@theme inline { … }` blocks in `src/app/globals.css`). There is **no `tailwind.config.ts`**. `@custom-variant dark (&:where(.dark, .dark *))` binds `dark:` to the next-themes `.dark` class (not the OS).
- **Shadcn UI** installed on-demand (`pnpm dlx shadcn@latest add <component>`); aliases in `components.json`.
- **next-intl** — English (un-prefixed URLs) + Arabic (`/ar/*`, full RTL). The whole route tree is under `src/app/[locale]/`; `setRequestLocale` preserves SSG. Use CSS logical properties so RTL mirrors for free. See `docs/i18n-glossary.md`.
- **Time-Machine eras** — `src/utils/era.ts#eraForSeason` skins the UI per era via a `data-era` attribute + era-scoped `globals.css` overrides. See `docs/design-system.md`.
- **Motion** — mostly CSS/Tailwind + View Transitions, all `prefers-reduced-motion`-gated. See `docs/motion.md`. `tests/unit/motion-audit.test.ts` enforces the keyframe-property allowlist + reduce gates.

### Feature folders

Each feature owns its data layer, UI, and types:

```
src/features/
  leagues/     standings, fixtures (server fetchers + components)
  teams/       team profile, squad, stats
  players/     leaderboards, search, comparison engine
  managers/    manager index + profile
  trivia/      provable-fact "Did you know?" engine
  map/         interactive historic map
  i18n/        entity-name localization
  game/        the in-app football sim (Phase 18) — see below
```

Shared concerns live one level up: `src/components/`, `src/hooks/`, `src/data/` (loaders + Zod schemas), `src/types/api.ts`, `src/utils/`.

### `features/game/` — the football sim (Phase 18)

A playable game built on the committed data, route-split under `/game/*`. Its layering is stricter than the rest of the app and the rules below are load-bearing — see `TASKS.md` Phase 18 for the tickets.

- **`domain/`** — pure, browser-safe, **no I/O and no entropy**. The match engine, ratings, eligibility, formations, the draft-room deal. `adapter/` — the sole raw-JSON boundary, `import "server-only"`. `view/` — presentation logic (view models, reducers, streams). `components/` — the `.tsx`.
- **⚠️ Never import `adapter/*` from a client component.** Those are `server-only`; client code uses `domain/` + `view/` only.
- **⚠️ Determinism is the core invariant.** A match replays byte-for-byte from `(setup, seed, decisions[])`. Nothing the engine or a deal reads may touch `Math.random()` or `Date.now()` — a seeded `mulberry32` is the only entropy source. Timers and clocks live in components: a countdown **picks** something, and that pick is the input.
- **⚠️ Every `/game/*` route is `force-static`.** `tests/unit/game-routes-static.test.ts` asserts the directive — a route silently going dynamic is what caused the 2026-07 Vercel Active-CPU pause.
- **The routes:** `/game` is the **mode gate**, `/game/demo` the broadcast showcase, `/game/draft` the canonical loop (Tactical H2H), `/game/chaos` the Chaos Draft. `/game/play` was byte-identical to `/game/draft` and is now a `next.config.ts` redirect, not a route. Only `/game` is in `NAV_ITEMS` and the sitemap — the sub-routes are app surfaces, not content.
- **The mode roster is DATA.** `domain/modes.ts` is the single registry behind the gate: each mode's group, entry route, and status **per format** (`single` / `season`). The gate renders from it and never branches on a mode's identity, so unlocking a mode later is a data change, not a component change. `tests/unit/game-modes.test.ts` guards it — unique ids, every `live` format pointing at a route that exists, every label key resolving in **both** locales.
- **⚠️ Locked modes render as NON-FOCUSABLE elements, never disabled buttons.** Nine locked tiles as disabled buttons would be nine dead stops in the tab order leading nowhere. Same rule for a `planned` format inside an expanded tile.
- **⚠️ Pre-match is a PHASE, not a route.** The live session — generator, seed, drafted XI — lives in `GamePlay`'s memory, so navigating to a separate URL would drop it. The URL already mirrors the phase as `?phase=preview`.
- **The header's width budget is measured, not guessed.** Nothing in that row can shrink, so its width is the sum of its parts and every `PRIMARY_NAV_HREFS` entry spends real budget. Since TASK-M79 the pill row appears at `lg` (not `md`) and the ⌘K button is icon-only between `lg` and `xl`, which makes **1024px the tight width**: 88px logo + 454px nav + 258px controls + 32px gaps + 64px padding = 896px of the 1024 available, ~128px spare. A seventh pill (~72px) fits. `/compare` sits in "More ▾" by editorial choice now, not by force. Verify any change with `tests/e2e/header-overflow.spec.ts` (twenty widths × both locales) rather than by arithmetic. Below `sm` there are no pills and the budget is tighter still — TASK-M80 bought it back by collapsing the season chip to its glyph and moving the locale switcher into the drawer, so those two are spent.
- **⚠️ Resolve a formation with `formationByName`, never `FORMATIONS[i]`.** The array's order is presentation only; a guard test fails on index access. Variant names carry the shape ("4-3-3 Holding", not "4-3-3") because `formationKey` is `` `${name}/${slots.length}` `` and every shape is 11 slots — a collision restores a saved match into the wrong shape.
- **Client persistence** is `features/game/storage/` (raw IndexedDB, no dependency). An in-progress match is stored as its **replay tuple**, never a snapshot, and verified on load by fingerprinting its events — a stale save is discarded rather than resumed into a different match.
- **Motion:** keyframes live in `globals.css` and the audit allowlists `transform` / `opacity` / `box-shadow` only. `filter` is rejected and animating a layout property fails, which is why bars animate `transform: scaleX`.

### Logging & observability

`src/utils/logger.ts` emits structured JSON. `logger.warn`/`logger.error` forward to Sentry in production (`Sentry.captureMessage`); a fetcher's `catch` funnels errors to `warn` + `return null` so the page degrades to its empty-state path. `GET /api/health` returns `{ status, commit, uptime, data: { lastRefresh, datasets } | null, ts }` — wire an uptime monitor at this URL.

## Project-specific gotchas

- **pnpm 11 blocks native postinstall scripts by default.** Native deps are whitelisted in `pnpm-workspace.yaml` under `allowBuilds:`. Add a new native postinstall dep there and run `pnpm rebuild`.
- **No client-secret env vars.** The only server secret is `REVALIDATE_SECRET` (gates `/api/admin/revalidate`). Sentry's `SENTRY_AUTH_TOKEN` (source-map upload) + `NEXT_PUBLIC_SENTRY_DSN` (browser-visible) are unrelated.
- **PL season** runs Aug–May — the current season string is `new Date().getMonth() >= 7 ? year : year - 1`.
- **`title.template` in `app/[locale]/layout.tsx` only wraps _child_ segments** — the dashboard sets its title to the absolute form; nested routes inherit the template with a bare-string title.
- **Satori (next/og) doesn't parse OKLCH or CSS variables**, and rejects the `background` shorthand mixing a gradient + hex. Split into `backgroundColor` + `backgroundImage` with hex equivalents. `repeating-linear-gradient` doesn't render (build dashes from real divs). `export const contentType` is invalid in a Route Handler.
- **`instrumentation.ts` lives at the project root**, not `src/`. If you move it, `rm -rf .next` first.
- **Playwright on WSL Ubuntu needs system libs** (`sudo apt install libnspr4 libnss3 libasound2t64` — note the `t64` suffix on 24.04+). `pnpm test:e2e:install` handles it.
- **`useSearchParams()` in the shell (`Header`/`Footer`) needs `<Suspense>`** or the page bails out of static prerender. The header's `<SeasonSwitcher>` is wrapped this way.
- **Never make `players/[id]` read `?season=` (server `searchParams` OR client `useSearchParams`).** It must stay statically prerendered — reading season on the server de-statics every view and a client `useSearchParams` bails prerender, both of which blow the Vercel Hobby Active-CPU cap (the 2026-07 pause). Season lives in `<PlayerSeasonView>` via `window.location` + `history.pushState`; see the Season model section.
- **nuqs `useQueryStates` defaults to `shallow: true`** (no server refetch). Set `shallow: false` when a URL write must trigger a server re-render (see `useComparisonSelection.ts`).
- **Testing recharts in happy-dom needs a `ResponsiveContainer` mock** that injects a fixed width/height, else the chart measures 0×0 and paints nothing. See `tests/unit/comparison-radar.test.tsx`.
- **Visual-regression assertions** live in `tests/e2e/dashboard.spec.ts` + `tests/e2e/redesign-visual.spec.ts` via `tests/e2e/_helpers/visual-assertions.ts`. Tailwind v4 emits `oklch()`; the helper rasterises any computed color → sRGB via a 1×1 canvas. Playwright renders the LIGHT theme.
- **Sentry is disabled in dev by default** (Turbopack incompat before Next 15.4.1) — gated by `src/utils/sentry-enabled.ts`. Exercise it via `pnpm build && pnpm start` or `SENTRY_FORWARD_DEV=1 pnpm dev`. The `import-in-the-middle` warnings on `pnpm dev` are harmless noise.
- **`<PlayerImage>` owns avatar resolution** — always render player avatars via `src/features/players/components/PlayerImage.tsx` (it resolves the photo source + falls back through candidates to an initials monogram on `onError`), never `<Image src={player.photo}>` directly. It also accepts an optional **`photoFallback`** (TASK-M87): an absolute URL appended **after** every candidate `photo` produces, used by managers to carry the crawled Transfermarkt portrait. Only an absolute URL is accepted there — a bare id would re-enter the PL-CDN path that just failed and hide a real gap behind a second 404.
- **⚠️ A manager's photo is `bio?.photo ?? id`, and a NUMERIC id resolves to the PL CDN on its own.** Every manager fetcher (`managers.api.ts`, `manager-profile.api.ts`, `managers-index.api.ts`) falls back to the manager's own id, which `<PlayerImage>` turns into a `resources.premierleague.com` URL — managers share the player photo namespace. **So a manager with no stored photo is usually still rendering one**, and any audit of "who has no photo" that reads only the stored bio fields will report false gaps (Iain Dowie was listed as missing while the app had served his headshot all along, and a redundant override was nearly shipped as a fix). The gap is real only for **legacy `lm-*` ids**, which are non-numeric, cannot reach the CDN, and fall through to the initials monogram. Coverage is **292/293** — only Stuart Gray has none, deliberately: the available image was a watermarked stock preview, and absent beats wrong. **TASK-M87 added a fourth rung below the CDN:** the three manager fetchers now also emit **`photoFallback`** from `manager-enrichment.json`'s `photo` (the crawled Transfermarkt portrait), so the full chain is `override → PL-CDN 110x140 → PL-CDN 250x250 → crawled portrait → initials`. It is deliberately *below* the CDN, so it changes nothing for a manager whose headshot already loads — it fixed exactly two (Oliver Glasner 44410, Andoni Iraola 50428, whose CDN candidates both 404) and covers every future legacy `lm-*` manager automatically. ⚠️ **`<ImageZoom>` on the manager hero has no failover** (single static `src`), so a numeric-id manager whose CDN photo 404s still zooms to a broken URL; passing the fallback to `resolvePlayerPhotoSrc` helps only `lm-*` ids, which otherwise get no zoom at all.
- **MSW handlers are an empty stub** (`tests/msw/handlers.ts`) — the app makes no outbound fetches _from the server_. Component/fetcher tests mock `@/data/loaders` directly. A new MSW handler is a code-smell (what outbound fetch are we testing?). But MSW only intercepts Node-side: during E2E the **browser** still fetches player/manager photos from `resources.premierleague.com` and `upload.wikimedia.org` for real — dozens per page — and Playwright's default `waitUntil: "load"` blocks on them. The suite is not actually offline.
- **E2E specs must import `test`/`expect` from `tests/e2e/_helpers/test.ts`, never from `@playwright/test` directly.** That module wraps `page.goto`/`page.reload` to wait for the App Router to mount (`window.next.router`). Without it, an interaction dispatched before hydration is **silently swallowed**: React suppresses the browser's default navigation but no router exists to handle it, so no RSC request is ever issued and the URL never changes. It presents as a `toHaveURL` timeout, but no timeout value can fix it — nothing is in flight. This was misread as a "nav flake cloud" and cleared with reruns for months. It hits buttons too, not just links (a pre-hydration `<button>` click has no default action to suppress and is simply dropped). Opt out only via `waitUntil: "commit"` (the boot-loader specs, which need the overlay mid-flight), and then call `waitForAppRouter(page)` yourself before interacting.
- **The E2E job runs `pnpm dev`, so routes compile on demand** — `scripts/warm-e2e-routes.sh` (a workflow step) compiles them all up front. Without it the first test to reach a route pays its compile inside a 12s `expect` timeout (`/game/chaos` alone measured 15.3s, above the timeout on its own), and every compile broadcasts an HMR rebuild to every open page mid-assertion. **Add new routes to that script.**
- **`next dev` renders its own static-route indicator with `role="status"`** — a bare `getByRole("status")` in an E2E spec is a strict-mode violation whenever that indicator happens to be mounted. Always scope by accessible name.
- **Pre-commit hook** (Husky + lint-staged) auto-formats staged files. It's locked to the platform that installed `node_modules` — commit from whichever shell ran the last `pnpm install` (WSL). `.npmrc` sets `verify-deps-before-run=false`.
- **⚠️ Radix's `Select.Value` ignores `className`.** It renders its own span, so styling it directly type-checks, reads correctly in review, and does nothing — TASK-M80 nearly shipped a responsive rule that never applied. Put the classes on a wrapper (and remember that moves the value out of reach of the trigger's `*:data-[slot=select-value]` rules). When a utility class on a third-party primitive is load-bearing, assert it in a test rather than trusting the markup.
- **⚠️ Vitest does NOT type-check.** A dangling import or a removed symbol survives a fully green suite — only `pnpm type-check` sees it. Run it before claiming done; a green suite is not evidence the code compiles.
- **⚠️ A green suite is also not evidence that nothing changed.** Tests that assert _relationships_ (same seed reproduces itself, the result is one of the valid set) stay green through a total change in output. Going from 4 to 20 formations changed what every seed drafts and not one determinism test noticed. When a change should be user-visible, verify it by measurement, not by the suite staying green.
- **⚠️ React 19 will not flush state produced by a fake timer outside `act`.** A test that advances `vi.advanceTimersByTimeAsync` without wrapping it silently asserts against the un-updated DOM. Wrap the advance in `act(async () => …)`.
- **⚠️ `pnpm lint` can abort with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`.** pnpm 11 runs a deps check before every script and, with no TTY, aborts rather than prompting. Prefix with `CI=true`. Lint is the one command that must go through pnpm — `next lint` cannot resolve `eslint-plugin-react-hooks` from a bare node invocation.

## Reference docs

- [`README.md`](README.md) — Tech Stack & Engineering Decisions, folder structure, feature overview.
- [`TASKS.md`](TASKS.md) — phased ticket board.
- [`docs/design-system.md`](docs/design-system.md), [`docs/motion.md`](docs/motion.md), [`docs/i18n-glossary.md`](docs/i18n-glossary.md) — the design/motion/i18n conventions.
- [`.env.example`](.env.example) — env vars.
