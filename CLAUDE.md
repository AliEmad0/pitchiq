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

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server with Turbopack (port 3000) |
| `pnpm build` | Production build — also type-checks and lints |
| `pnpm start` | Serve the production build |
| `pnpm type-check` | `tsc --noEmit` |
| `pnpm lint` | ESLint (`--dir src --dir tests`) |
| `pnpm test` | Vitest, single pass |
| `pnpm test:watch` | Vitest watch mode |
| `pnpm test tests/unit/logger.test.ts` | Run a single test file |
| `pnpm test -t "emits info"` | Run tests matching a name pattern |
| `pnpm test:e2e` | Playwright E2E (offline against MSW via `TEST_MSW=1`) |
| `pnpm test:e2e:install` | One-time Playwright browser + system-lib install (needs sudo) |

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
```

Shared concerns live one level up: `src/components/`, `src/hooks/`, `src/data/` (loaders + Zod schemas), `src/types/api.ts`, `src/utils/`.

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
- **`<PlayerImage>` owns avatar resolution** — always render player avatars via `src/features/players/components/PlayerImage.tsx` (it resolves the photo source + falls back through candidates to an initials monogram on `onError`), never `<Image src={player.photo}>` directly.
- **MSW handlers are an empty stub** (`tests/msw/handlers.ts`) — the app makes no outbound fetches _from the server_. Component/fetcher tests mock `@/data/loaders` directly. A new MSW handler is a code-smell (what outbound fetch are we testing?). But MSW only intercepts Node-side: during E2E the **browser** still fetches player/manager photos from `resources.premierleague.com` and `upload.wikimedia.org` for real — dozens per page — and Playwright's default `waitUntil: "load"` blocks on them. The suite is not actually offline.
- **E2E specs must import `test`/`expect` from `tests/e2e/_helpers/test.ts`, never from `@playwright/test` directly.** That module wraps `page.goto`/`page.reload` to wait for the App Router to mount (`window.next.router`). Without it, an interaction dispatched before hydration is **silently swallowed**: React suppresses the browser's default navigation but no router exists to handle it, so no RSC request is ever issued and the URL never changes. It presents as a `toHaveURL` timeout, but no timeout value can fix it — nothing is in flight. This was misread as a "nav flake cloud" and cleared with reruns for months. It hits buttons too, not just links (a pre-hydration `<button>` click has no default action to suppress and is simply dropped). Opt out only via `waitUntil: "commit"` (the boot-loader specs, which need the overlay mid-flight), and then call `waitForAppRouter(page)` yourself before interacting.
- **The E2E job runs `pnpm dev`, so routes compile on demand** — `scripts/warm-e2e-routes.sh` (a workflow step) compiles them all up front. Without it the first test to reach a route pays its compile inside a 12s `expect` timeout (`/game/chaos` alone measured 15.3s, above the timeout on its own), and every compile broadcasts an HMR rebuild to every open page mid-assertion. **Add new routes to that script.**
- **`next dev` renders its own static-route indicator with `role="status"`** — a bare `getByRole("status")` in an E2E spec is a strict-mode violation whenever that indicator happens to be mounted. Always scope by accessible name.
- **Pre-commit hook** (Husky + lint-staged) auto-formats staged files. It's locked to the platform that installed `node_modules` — commit from whichever shell ran the last `pnpm install` (WSL). `.npmrc` sets `verify-deps-before-run=false`.

## Reference docs

- [`README.md`](README.md) — Tech Stack & Engineering Decisions, folder structure, feature overview.
- [`TASKS.md`](TASKS.md) — phased ticket board.
- [`docs/design-system.md`](docs/design-system.md), [`docs/motion.md`](docs/motion.md), [`docs/i18n-glossary.md`](docs/i18n-glossary.md) — the design/motion/i18n conventions.
- [`.env.example`](.env.example) — env vars.
