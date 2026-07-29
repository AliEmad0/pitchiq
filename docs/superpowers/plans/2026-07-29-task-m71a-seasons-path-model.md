# TASK-M71a — Season pages in the path: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the season in the URL path — `/seasons/[year]` plus a `/seasons` directory — so all 34 seasons become prerendered, crawlable pages, and `/` stops reading `searchParams` and becomes CDN-served.

**Architecture:** Extract today's dashboard body into one server component, render it from both `/` (current season) and `/seasons/[year]` (that season). Neither reads `searchParams`. The season directory is a new prerendered grid of 34 cards. `?season=` on `/` becomes an edge redirect to the path form. Motion reuses the existing `revealProps`/`<RevealController>` system rather than adding a second IntersectionObserver.

**Tech Stack:** Next.js 15 App Router, next-intl, Tailwind v4 (CSS-based config), Vitest, Playwright.

**Spec:** [`docs/superpowers/specs/2026-07-29-seasons-path-model-design.md`](../specs/2026-07-29-seasons-path-model-design.md)

---

## Read before starting

- **`revealProps(index)`** (`src/utils/reveal.ts`) is the ONLY scroll-reveal mechanism. It stamps `data-reveal` and `--rvi` (45ms per step, capped 12). `<RevealController>` sets `data-revealed` **via the DOM**. **Never render `data-revealed` from React** — a client re-render resets it and re-hides the element forever. Do not add a second IntersectionObserver.
- **`next.config.ts` runs outside the `@` alias.** It cannot import `@/utils/season`. The current season must be inlined there, guarded by a test (Task 5).
- **Never assert rendered i18n text by grepping HTML.** next-intl serialises the entire message catalog into every page, so any UI string matches whether or not it rendered. Assert via Playwright's rendered-text locators.
- Run commands through WSL: `wsl -d Ubuntu -- bash -c 'source $HOME/.nvm/nvm.sh && nvm use 22 && cd /home/aliemad/projects/pitchiq && <cmd>'`. Use `node_modules/.bin/vitest` etc. directly — **not** `pnpm <script>` (pnpm 11 tries to purge `node_modules` with no TTY).

## File structure

| File | Responsibility |
| --- | --- |
| `src/utils/season-path.ts` | **Create.** Build/parse `/seasons/<year>` segments. Pure. |
| `src/features/dashboard/components/SeasonDashboard.tsx` | **Create.** The dashboard body, parameterised by `season`. Server component. |
| `src/app/[locale]/page.tsx` | **Modify.** Render `<SeasonDashboard season={currentDataSeason()} />`. Drop `searchParams`. |
| `src/app/[locale]/seasons/[year]/page.tsx` | **Create.** Same body, season from `params`. |
| `src/app/[locale]/seasons/page.tsx` | **Create.** The 34-card directory. |
| `src/features/seasons/season-champions.ts` | **Create.** `getSeasonChampions()` — season → champion, read at build. |
| `src/features/seasons/components/SeasonCard.tsx` | **Create.** The A8 + logo card. Client (hover motion). |
| `src/features/seasons/components/SeasonCard.module.css` | **Create.** Card + grid motion. |
| `next.config.ts` | **Modify.** Two redirect rules. |
| `src/components/layout/SeasonSwitcher.tsx` | **Modify.** Path navigation on `/` and `/seasons/*`. |
| `src/app/sitemap.ts` | **Modify.** Add `/seasons` + 34 season URLs. |
| `src/app/globals.css` | **Modify.** Depth-arrival reveal variant. |
| `src/i18n/messages/{en,ar}.json` | **Modify.** New `seasons.*` keys. |
| `.github/workflows/cache-guard.yml` | **Modify.** Promote `/` to the enforced list. |

---

### Task 1: Season path helpers

**Files:**
- Create: `src/utils/season-path.ts`
- Test: `tests/unit/season-path.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/season-path.test.ts
import { describe, expect, it } from "vitest";

import { parseSeasonSegment, seasonPath } from "@/utils/season-path";
import { EARLIEST_SEASON, LATEST_DATA_SEASON } from "@/utils/season";

describe("seasonPath", () => {
  it("builds the season pathname", () => {
    expect(seasonPath(2003)).toBe("/seasons/2003");
  });
});

describe("parseSeasonSegment", () => {
  it("accepts a committed season", () => {
    expect(parseSeasonSegment("2003")).toBe(2003);
    expect(parseSeasonSegment(String(EARLIEST_SEASON))).toBe(EARLIEST_SEASON);
    expect(parseSeasonSegment(String(LATEST_DATA_SEASON))).toBe(LATEST_DATA_SEASON);
  });

  it("rejects out-of-range years", () => {
    expect(parseSeasonSegment(String(EARLIEST_SEASON - 1))).toBeNull();
    expect(parseSeasonSegment(String(LATEST_DATA_SEASON + 1))).toBeNull();
  });

  it("rejects non-numeric and malformed input", () => {
    for (const bad of ["abc", "", "20o3", "2003.5", "-2003", "02003", " 2003"]) {
      expect(parseSeasonSegment(bad)).toBeNull();
    }
  });

  it("round-trips", () => {
    expect(parseSeasonSegment(seasonPath(2010).split("/").pop()!)).toBe(2010);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run tests/unit/season-path.test.ts`
Expected: FAIL — `Failed to resolve import "@/utils/season-path"`.

- [ ] **Step 3: Implement**

```ts
// src/utils/season-path.ts
import { EARLIEST_SEASON, LATEST_DATA_SEASON } from "./season";

/**
 * TASK-M71a — the season lives in the path, not `?season=`.
 * `/seasons/<year>` is a real prerendered document; the query form only
 * survives as an edge redirect (see next.config.ts).
 */
export function seasonPath(season: number): string {
  return `/seasons/${season}`;
}

/**
 * Parse a `[year]` route segment. Returns null for anything that is not a
 * committed season, so the page can call notFound() on it. Deliberately
 * strict: exactly four digits, no sign, no leading zeros, no whitespace —
 * `/seasons/02003` must 404 rather than silently render 2003 at a second URL.
 */
export function parseSeasonSegment(segment: string): number | null {
  if (!/^\d{4}$/.test(segment)) return null;
  const year = Number(segment);
  if (year < EARLIEST_SEASON || year > LATEST_DATA_SEASON) return null;
  return year;
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node_modules/.bin/vitest run tests/unit/season-path.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/season-path.ts tests/unit/season-path.test.ts
git commit -m "feat(seasons): season path helpers"
```

---

### Task 2: Extract the dashboard body

The dashboard currently lives inline in `src/app/[locale]/page.tsx` and takes its season from `searchParams`. Extract it so two routes can render it with an explicit season. **Pure move — no behaviour change.**

**Files:**
- Create: `src/features/dashboard/components/SeasonDashboard.tsx`
- Modify: `src/app/[locale]/page.tsx`

- [ ] **Step 1: Create the component**

Move the entire returned JSX of `DashboardPage` into a new server component. Signature:

```tsx
// src/features/dashboard/components/SeasonDashboard.tsx
import "server-only";

/**
 * TASK-M71a — the dashboard body, parameterised by season.
 * Rendered by `/` (current season) and `/seasons/[year]`. Neither reads
 * `searchParams`: doing so opts the route into dynamic rendering, which
 * `force-static` cannot override, and the route then prerenders NOTHING.
 * See docs/hosting-cost.md.
 */
export async function SeasonDashboard({
  season,
  locale,
}: {
  season: number;
  locale: string;
}) {
  // ...every `const` and the whole `return (...)` previously in DashboardPage,
  // with `requestedSeason` replaced by the `season` prop.
}
```

Copy the existing body verbatim except:
- delete `const sp = await searchParams;` and `const requestedSeason = parseSeason(sp.season, fallback);`
- delete the now-unused `fallback` const
- every later reference to `requestedSeason` uses the `season` prop
- keep `const season = standings?.league.season ?? season` logic by renaming the prop-derived value: `const effectiveSeason = standings?.league.season ?? season;` and use `effectiveSeason` everywhere the old local `season` was used
- remove `parseSeason` from the import list if now unused

- [ ] **Step 2: Rewrite the page to delegate**

```tsx
// src/app/[locale]/page.tsx — replace the component and its Props
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { dashboardOgImagePath } from "@/app/api/og/ticket";
import { SeasonDashboard } from "@/features/dashboard/components/SeasonDashboard";
import { canonicalPath } from "@/utils/canonical";
import { currentDataSeason } from "@/utils/season";

type Props = { params: Promise<{ locale: string }> };

// ⚠️ HOSTING COST — this route must NOT read `searchParams`.
// Reading it opts the page into dynamic rendering; `force-static` does NOT
// override that, and the route then emits ZERO prerendered pages while the
// build's route table still prints "● (SSG)". Historical seasons live at
// /seasons/<year>; `/?season=` is redirected there at the edge.
export const dynamic = "force-static";
export const revalidate = 86400;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const season = currentDataSeason();
  const t = await getTranslations("dashboard");
  return {
    title: t("metaTitle"),
    alternates: { canonical: canonicalPath(locale, "/") },
    openGraph: {
      images: [
        { url: dashboardOgImagePath(season), width: 1200, height: 630, alt: t("ogAlt") },
      ],
    },
    twitter: { card: "summary_large_image", images: [dashboardOgImagePath(season)] },
  };
}

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SeasonDashboard season={currentDataSeason()} locale={locale} />;
}
```

Note the canonical drops its season argument — `/` is now self-canonical.

- [ ] **Step 3: Verify nothing broke**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/vitest run`
Expected: type-check clean; full unit suite green (1259 passing before this change).

- [ ] **Step 4: Verify `/` now prerenders**

Run: `node_modules/.bin/next build`
Then: `ls .next/server/app/en.html .next/server/app/ar.html`
Expected: both files exist (~330 KB each). **This is the acceptance signal for the cost half of the ticket** — before this change they do not.

> The route is `/[locale]`, so the locale IS the leaf: the output is
> `app/en.html`, **not** `app/en/index.html`. (Nested routes do nest —
> `/[locale]/seasons` emits `app/en/seasons.html`.) Checking the wrong path
> reads as "still broken" when it is working.

> Do NOT judge this by the build's route table. It prints `● (SSG)` for routes that emit nothing. Count emitted `.html` files.

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/components/SeasonDashboard.tsx src/app/[locale]/page.tsx
git commit -m "refactor(dashboard): extract SeasonDashboard, stop reading searchParams on /"
```

---

### Task 3: The `/seasons/[year]` route

**Files:**
- Create: `src/app/[locale]/seasons/[year]/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/app/[locale]/seasons/[year]/page.tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { dashboardOgImagePath } from "@/app/api/og/ticket";
import { getAvailableSeasons } from "@/data/loaders";
import { SeasonDashboard } from "@/features/dashboard/components/SeasonDashboard";
import { canonicalPath } from "@/utils/canonical";
import { formatSeasonLabel } from "@/utils/season";
import { parseSeasonSegment, seasonPath } from "@/utils/season-path";

type Props = { params: Promise<{ locale: string; year: string }> };

// ⚠️ HOSTING COST — force-static is load-bearing. Never add `searchParams`
// to this route: the season comes from `params`, which is static.
export const dynamic = "force-static";
export const revalidate = 86400;
// Every committed season is prerendered, so an unknown year is a real 404
// rather than an on-demand render.
export const dynamicParams = false;

export async function generateStaticParams(): Promise<Array<{ year: string }>> {
  const seasons = await getAvailableSeasons();
  return seasons.map((s) => ({ year: String(s) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, year } = await params;
  setRequestLocale(locale);
  const season = parseSeasonSegment(year);
  const t = await getTranslations("seasons");
  if (season === null) return { title: t("notFoundTitle") };
  const label = formatSeasonLabel(season, locale);
  return {
    title: t("seasonMetaTitle", { season: label }),
    description: t("seasonMetaDescription", { season: label }),
    alternates: { canonical: canonicalPath(locale, seasonPath(season)) },
    openGraph: {
      images: [
        {
          url: dashboardOgImagePath(season),
          width: 1200,
          height: 630,
          alt: t("seasonOgAlt", { season: label }),
        },
      ],
    },
    twitter: { card: "summary_large_image", images: [dashboardOgImagePath(season)] },
  };
}

export default async function SeasonPage({ params }: Props) {
  const { locale, year } = await params;
  setRequestLocale(locale);
  const season = parseSeasonSegment(year);
  if (season === null) notFound();
  return <SeasonDashboard season={season} locale={locale} />;
}
```

- [ ] **Step 2: Build and count the emitted pages**

Run: `node_modules/.bin/next build`
Then: `ls .next/server/app/en/seasons/*.html | wc -l`
Expected: the number of committed seasons (34 today). Same for `ar`.

- [ ] **Step 3: Verify a season renders its own data**

Run: `node_modules/.bin/next start -p 3137` (use `setsid nohup … &` so it survives the tool call), then
`curl -sL "http://localhost:3137/seasons/2003" | grep -c "Invincibles\|2003"`
Expected: non-zero, and the page shows 2003-04 standings rather than the current season. Stop the server by port: `ss -lptn "sport = :3137"` then `kill <pid>` — **never `pkill -f "next start"`**, which matches its own command line and kills the calling shell.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/seasons/[year]/page.tsx"
git commit -m "feat(seasons): prerendered /seasons/[year] season pages"
```

---

### Task 4: Champion lookup for the directory

**Files:**
- Create: `src/features/seasons/season-champions.ts`
- Test: `tests/unit/season-champions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/season-champions.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/data/loaders", () => ({
  getAvailableSeasons: vi.fn(),
  loadStandings: vi.fn(),
}));

import { getAvailableSeasons, loadStandings } from "@/data/loaders";
import { getSeasonChampions } from "@/features/seasons/season-champions";

const row = (id: number, name: string, rank: number) => ({ rank, team: { id, name } });

describe("getSeasonChampions", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the rank-1 team per season, newest first", async () => {
    vi.mocked(getAvailableSeasons).mockResolvedValue([2003, 2002]);
    vi.mocked(loadStandings).mockImplementation(async (season: number) =>
      season === 2003
        ? ({ league: { standings: [[row(42, "Arsenal", 1), row(33, "Man Utd", 2)]] } } as never)
        : ({ league: { standings: [[row(33, "Man Utd", 1)]] } } as never),
    );

    expect(await getSeasonChampions()).toEqual([
      { season: 2003, champion: { id: 42, name: "Arsenal" } },
      { season: 2002, champion: { id: 33, name: "Man Utd" } },
    ]);
  });

  it("keeps the season with a null champion when standings are missing", async () => {
    vi.mocked(getAvailableSeasons).mockResolvedValue([2003]);
    vi.mocked(loadStandings).mockResolvedValue(null as never);

    expect(await getSeasonChampions()).toEqual([{ season: 2003, champion: null }]);
  });

  it("keeps the season with a null champion when no row has rank 1", async () => {
    vi.mocked(getAvailableSeasons).mockResolvedValue([2003]);
    vi.mocked(loadStandings).mockResolvedValue({
      league: { standings: [[row(42, "Arsenal", 2)]] },
    } as never);

    expect(await getSeasonChampions()).toEqual([{ season: 2003, champion: null }]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run tests/unit/season-champions.test.ts`
Expected: FAIL — cannot resolve `@/features/seasons/season-champions`.

- [ ] **Step 3: Implement**

```ts
// src/features/seasons/season-champions.ts
import "server-only";

import { getAvailableSeasons, loadStandings } from "@/data/loaders";

export interface SeasonChampion {
  season: number;
  champion: { id: number; name: string } | null;
}

/**
 * TASK-M71a — season → champion for the /seasons directory.
 * Read at build time only (the directory is prerendered), so the 34 standings
 * reads cost nothing at request time. `champion` is null-tolerant: a season
 * with missing standings still gets a card rather than throwing the build.
 */
export async function getSeasonChampions(): Promise<SeasonChampion[]> {
  const seasons = await getAvailableSeasons(); // newest-first
  return Promise.all(
    seasons.map(async (season) => {
      const standings = await loadStandings(season);
      const winner = standings?.league.standings[0]?.find((r) => r.rank === 1);
      return {
        season,
        champion: winner ? { id: winner.team.id, name: winner.team.name } : null,
      };
    }),
  );
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node_modules/.bin/vitest run tests/unit/season-champions.test.ts`
Expected: PASS, 3 tests.

> If `loadStandings` is not exported from `@/data/loaders`, check the actual export name with
> `grep -n "export async function load" src/data/loaders.ts` and update both the mock and the import. Do not invent a loader.

- [ ] **Step 5: Commit**

```bash
git add src/features/seasons/season-champions.ts tests/unit/season-champions.test.ts
git commit -m "feat(seasons): champion-per-season lookup"
```

---

### Task 5: Edge redirects

**Files:**
- Modify: `next.config.ts`
- Test: `tests/unit/next-config-redirects.test.ts`

- [ ] **Step 1: Write the failing guard test**

```ts
// tests/unit/next-config-redirects.test.ts
import { describe, expect, it } from "vitest";

import { CURRENT_SEASON_FOR_REDIRECT } from "../../next.config";
import { currentDataSeason } from "@/utils/season";

// next.config.ts runs outside the bundler's `@` alias, so it cannot import
// currentDataSeason() and the value is inlined there. This pins the copy in
// sync — the mirror pattern already used for sentry-enabled.
describe("next.config redirect target", () => {
  it("matches currentDataSeason()", () => {
    expect(CURRENT_SEASON_FOR_REDIRECT).toBe(currentDataSeason());
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run tests/unit/next-config-redirects.test.ts`
Expected: FAIL — no such export.

- [ ] **Step 3: Add the export and the redirects**

In `next.config.ts`, above `const nextConfig`:

```ts
/**
 * TASK-M71a — the current season lives at `/`, so `/seasons/<current>`
 * redirects there. next.config runs outside the `@` alias and cannot import
 * `currentDataSeason()`, so the value is inlined and pinned by
 * tests/unit/next-config-redirects.test.ts. Keep in sync.
 */
export const CURRENT_SEASON_FOR_REDIRECT = 2025;
```

and inside `nextConfig`:

```ts
  async redirects() {
    return [
      // The current season is `/`; its path form must not be a second URL.
      { source: "/seasons/:year(2025)", destination: "/", permanent: true },
      { source: "/ar/seasons/:year(2025)", destination: "/ar", permanent: true },
      // Back-compat: `?season=` links already shared, bookmarked or indexed.
      {
        source: "/",
        has: [{ type: "query", key: "season", value: "(?<year>\\d{4})" }],
        destination: "/seasons/:year",
        permanent: true,
      },
      {
        source: "/ar",
        has: [{ type: "query", key: "season", value: "(?<year>\\d{4})" }],
        destination: "/ar/seasons/:year",
        permanent: true,
      },
    ];
  },
```

> The literal `2025` in the `source` patterns must equal `CURRENT_SEASON_FOR_REDIRECT`. Next requires a literal in the path pattern, so this is three copies of one number — the test pins one of them; update all three at rollover.

- [ ] **Step 4: Run it and confirm it passes**

Run: `node_modules/.bin/vitest run tests/unit/next-config-redirects.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the redirects actually fire**

Build and start (see Task 3 Step 3 for safe start/stop), then:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3137/seasons/2025"
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "http://localhost:3137/?season=2010"
```

Expected: `308 http://localhost:3137/` and `308 http://localhost:3137/seasons/2010`.

- [ ] **Step 6: Commit**

```bash
git add next.config.ts tests/unit/next-config-redirects.test.ts
git commit -m "feat(seasons): edge redirects for the current season and ?season= back-compat"
```

---

### Task 6: Depth-arrival reveal variant

**Files:**
- Modify: `src/app/globals.css`
- Test: `tests/unit/motion-audit.test.ts` (must still pass, unchanged)

- [ ] **Step 1: Add the variant**

After the existing reveal block (around `globals.css:443-460`), add:

```css
/* TASK-M71a — depth-arrival variant for the /seasons grid (owner pick #19).
   Opts in via `data-reveal-depth` ALONGSIDE `data-reveal`, so
   <RevealController> still observes it and still stamps `data-revealed` via
   the DOM. Higher specificity than the base soft-rise, so it wins.
   transform/opacity only — motion-audit enforces that allowlist. */
:root[data-reveal-ready] [data-reveal][data-reveal-depth]:not([data-revealed]) {
  opacity: 0;
  transform: translateZ(-300px) translateY(20px);
}
:root[data-reveal-ready] [data-reveal][data-reveal-depth][data-revealed] {
  opacity: 1;
  transform: none;
  transition:
    opacity 0.8s ease,
    transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: calc(var(--rvi, 0) * 45ms);
}
```

`translateZ` needs a perspective ancestor — the grid provides it in Task 7.

- [ ] **Step 2: Confirm the motion audit still passes**

Run: `node_modules/.bin/vitest run tests/unit/motion-audit.test.ts`
Expected: PASS. If it fails, you animated something outside the allowlist — fix the CSS, do not amend the test.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(seasons): depth-arrival reveal variant"
```

---

### Task 7: The season card

**Files:**
- Create: `src/features/seasons/components/SeasonCard.tsx`
- Create: `src/features/seasons/components/SeasonCard.module.css`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/ar.json`

- [ ] **Step 1: Add the message keys**

`en.json`, under a new top-level `"seasons"` object:

```json
"seasons": {
  "kicker": "Premier League",
  "title": "Every season",
  "metaTitle": "Every Premier League season",
  "metaDescription": "Browse all 34 Premier League seasons, 1992-93 to 2025-26.",
  "seasonMetaTitle": "Premier League {season}",
  "seasonMetaDescription": "Standings, top scorers and fixtures for the {season} Premier League season.",
  "seasonOgAlt": "Premier League {season}",
  "notFoundTitle": "Season not found",
  "championLabel": "Champion",
  "noChampion": "No champion recorded"
}
```

`ar.json`, same keys:

```json
"seasons": {
  "kicker": "الدوري الإنجليزي الممتاز",
  "title": "كل المواسم",
  "metaTitle": "كل مواسم الدوري الإنجليزي الممتاز",
  "metaDescription": "تصفح جميع مواسم الدوري الإنجليزي الممتاز الـ34، من 1992-93 إلى 2025-26.",
  "seasonMetaTitle": "الدوري الإنجليزي الممتاز {season}",
  "seasonMetaDescription": "الترتيب والهدافون والمباريات لموسم {season} من الدوري الإنجليزي الممتاز.",
  "seasonOgAlt": "الدوري الإنجليزي الممتاز {season}",
  "notFoundTitle": "الموسم غير موجود",
  "championLabel": "البطل",
  "noChampion": "لا يوجد بطل مسجل"
}
```

- [ ] **Step 2: Write the CSS module**

```css
/* src/features/seasons/components/SeasonCard.module.css */

/* Grid: provides the perspective the depth-arrival variant needs, and the
   neighbours-dim hover (owner pick #10) via :has() — no JS, no per-card state. */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 1rem;
  perspective: 900px;
}

@media (prefers-reduced-motion: no-preference) {
  .grid:has(.card:hover) .card:not(:hover) {
    opacity: 0.28;
  }
  .card {
    transition: opacity 0.25s ease;
  }
}

.card {
  display: block;
  padding: 1rem 1.15rem;
  border-radius: 0.75rem;
  background: var(--card);
  color: inherit;
  text-decoration: none;
  position: relative;
  overflow: hidden;
  isolation: isolate;
}

/* Club-colour bleed (owner pick #4) — radial fill following the cursor.
   --bleed-x/y are set by the pointer handler; --club is the champion colour. */
.card::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: radial-gradient(
    12rem circle at var(--bleed-x, 50%) var(--bleed-y, 50%),
    color-mix(in oklch, var(--club, var(--chart-1)) 45%, transparent),
    transparent 70%
  );
  opacity: 0;
  transition: opacity 0.25s ease;
}
@media (prefers-reduced-motion: no-preference) {
  .card:hover::before,
  .card:focus-visible::before {
    opacity: 1;
  }
}

.kicker {
  font-size: 0.5625rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.5;
}
/* Per-letter spread (owner pick #14, reworked). letter-spacing animates
   layout and the motion audit rejects it, so each letter translates instead.
   `--i` is the letter index, set in the component. */
.kicker span {
  display: inline-block;
  white-space: pre;
}
@media (prefers-reduced-motion: no-preference) {
  .kicker span {
    transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .card:hover .kicker span,
  .card:focus-visible .kicker span {
    transform: translateX(calc(var(--i) * 1.6px));
  }
}

.year {
  font-size: 2.375rem;
  font-weight: 800;
  letter-spacing: -0.025em;
  line-height: 1;
  margin: 0.3rem 0 0.5rem;
}
.dash {
  color: var(--chart-1);
  display: inline-block;
}

.club {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  /* Manchester United is the longest name — keep it on one line. */
  min-width: 0;
}
.crest {
  flex: none;
  width: 1.375rem;
  height: 1.375rem;
}
.name {
  font-size: 0.8125rem;
  font-weight: 600;
  opacity: 0.86;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 3: Write the component**

```tsx
// src/features/seasons/components/SeasonCard.tsx
"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import type { PointerEvent } from "react";

import { Link } from "@/i18n/navigation";
import { formatSeasonLabel } from "@/utils/season";
import { seasonPath } from "@/utils/season-path";
import { revealProps } from "@/utils/reveal";

import styles from "./SeasonCard.module.css";

/**
 * TASK-M71a — one season in the /seasons directory (gallery concept A8 + logo).
 * The year is the anchor and the club is supporting: that ordering is what
 * makes Blackburn 1994-95 read as considered as Arsenal 2003-04.
 *
 * Client component because the hover motion is cursor-driven. The reveal uses
 * revealProps()/<RevealController> — the existing mechanism. NEVER render
 * `data-revealed`; the controller sets it via the DOM.
 */
export function SeasonCard({
  season,
  champion,
  clubColor,
  index,
}: {
  season: number;
  champion: { id: number; name: string } | null;
  clubColor: string | null;
  index: number;
}) {
  const t = useTranslations("seasons");
  const locale = useLocale();
  const label = formatSeasonLabel(season, locale);
  const [start, end] = label.split("–");

  // Arabic joins its letters — spreading them is typographically wrong, so the
  // per-letter split is English-only. Every other hover effect still applies.
  const kicker = t("kicker");
  const isAr = locale === "ar";

  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--bleed-x", `${((e.clientX - r.left) / r.width) * 100}%`);
    e.currentTarget.style.setProperty("--bleed-y", `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <Link
      href={seasonPath(season)}
      className={styles.card}
      onPointerMove={onMove}
      style={clubColor ? ({ "--club": clubColor } as React.CSSProperties) : undefined}
      data-reveal-depth=""
      {...revealProps(index)}
    >
      <span className={styles.kicker}>
        {isAr
          ? kicker
          : [...kicker].map((ch, i) => (
              <span key={i} style={{ "--i": i } as React.CSSProperties}>
                {ch}
              </span>
            ))}
      </span>
      <span className={styles.year}>
        {start}
        <span className={styles.dash}>–</span>
        {end}
      </span>
      <span className={styles.club}>
        {champion ? (
          <>
            <Image
              src={`/logos/${champion.id}.png`}
              alt=""
              width={22}
              height={22}
              className={styles.crest}
              unoptimized
            />
            <span className={styles.name}>{champion.name}</span>
          </>
        ) : (
          <span className={styles.name}>{t("noChampion")}</span>
        )}
      </span>
    </Link>
  );
}
```

> `revealProps(index)` must be spread **after** `data-reveal-depth` so it cannot be overwritten. Merging inline `style` with `revealProps` is only needed when index > 12; the cap makes that safe here, but if you raise the cap, merge manually per the JSDoc in `reveal.ts`.

- [ ] **Step 4: Confirm the guards pass**

Run: `node_modules/.bin/vitest run tests/unit/motion-audit.test.ts tests/unit/no-hardcoded-strings.test.ts`
Expected: PASS. The card renders no literal user-facing text — every string comes from `t()`.

- [ ] **Step 5: Commit**

```bash
git add src/features/seasons/components/ src/i18n/messages/en.json src/i18n/messages/ar.json
git commit -m "feat(seasons): season card with A8 layout and cursor-driven hover"
```

---

### Task 7b: Card entrance cascade, magnetic drift, crest spin

Task 7 covered the club-colour bleed and the kicker spread. This adds the rest of the spec's motion: the card's internal entrance (cascade → year flip → dash draw) and the two remaining hover effects.

**Files:**
- Modify: `src/features/seasons/components/SeasonCard.module.css`
- Modify: `src/features/seasons/components/SeasonCard.tsx`

- [ ] **Step 1: Add the entrance and remaining hover CSS**

Append to `SeasonCard.module.css`:

```css
/* ---- Card entrance (owner picks #25 cascade + #7 year flip + #12 dash) ----
   Driven by the card gaining `data-revealed`, which <RevealController> stamps
   via the DOM. Wrapped in the reduced-motion query and the `data-reveal-ready`
   gate is already handled by the attribute only existing when JS + motion are
   available. transform/opacity only. */
@media (prefers-reduced-motion: no-preference) {
  .card[data-revealed] .kicker {
    animation: seasonFade 0.4s both;
  }
  .card[data-revealed] .year {
    animation: seasonFlip 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .card[data-revealed] .dash {
    animation: seasonDash 0.45s 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;
    transform-origin: left center;
  }
  .card[data-revealed] .club {
    animation: seasonRise 0.45s 0.2s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
}

@keyframes seasonFade {
  from {
    opacity: 0;
  }
  to {
    opacity: 0.5;
  }
}
@keyframes seasonFlip {
  from {
    opacity: 0;
    transform: perspective(600px) rotateX(-72deg);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes seasonDash {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
@keyframes seasonRise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* ---- Magnetic drift (owner pick #2) ----
   --drift-x/y are set by the pointer handler and cleared on leave. */
.card {
  transform: translate(var(--drift-x, 0), var(--drift-y, 0));
}
@media (prefers-reduced-motion: no-preference) {
  .card {
    transition:
      opacity 0.25s ease,
      transform 0.18s cubic-bezier(0.2, 0.9, 0.2, 1);
  }
}

/* ---- Crest spin (owner pick #9) ---- */
@media (prefers-reduced-motion: no-preference) {
  .card:hover .crest,
  .card:focus-visible .crest {
    animation: seasonSpin 0.7s cubic-bezier(0.5, 0, 0.2, 1);
  }
}
@keyframes seasonSpin {
  to {
    transform: rotate(360deg);
  }
}
```

> ⚠️ **Ordering matters.** The `.card { transform: translate(...) }` rule above must come **after** the `.card` block in Task 7, and the depth-arrival variant in `globals.css` sets `transform` on the same element. The reveal variant wins while revealing (it is a `:root[...]`-scoped selector, higher specificity); once `data-revealed` is set its `transform: none` no longer applies because this rule is more specific on the element. **Verify visually** that a card both arrives with depth and drifts on hover — if they conflict, move the drift onto an inner wrapper element instead of the link.

- [ ] **Step 2: Set the drift variables from the pointer handler**

Replace `onMove` in `SeasonCard.tsx` with:

```tsx
  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    // Club-colour bleed origin (#4).
    el.style.setProperty("--bleed-x", `${px * 100}%`);
    el.style.setProperty("--bleed-y", `${py * 100}%`);
    // Magnetic drift (#2) — max 16px x, 12px y.
    el.style.setProperty("--drift-x", `${(px - 0.5) * 16}px`);
    el.style.setProperty("--drift-y", `${(py - 0.5) * 12}px`);
  };

  const onLeave = (e: PointerEvent<HTMLAnchorElement>) => {
    const el = e.currentTarget;
    el.style.removeProperty("--drift-x");
    el.style.removeProperty("--drift-y");
  };
```

and add `onPointerLeave={onLeave}` to the `<Link>`.

- [ ] **Step 3: Confirm the motion audit still passes**

Run: `node_modules/.bin/vitest run tests/unit/motion-audit.test.ts`
Expected: PASS. Every keyframe above animates only `transform` and `opacity`.

- [ ] **Step 4: Verify visually**

Build, start (Task 3 Step 3), open `/seasons`, and check by hand:
- cards arrive with the depth effect as you scroll, staggered
- the year flips, the dash draws after it, the club row rises
- hovering drifts the card toward the cursor, bleeds the club colour, spins the crest, spreads the kicker
- hovering one card dims the rest
- with OS "reduce motion" on, everything is present and static

- [ ] **Step 5: Commit**

```bash
git add src/features/seasons/components/
git commit -m "feat(seasons): card entrance cascade, magnetic drift, crest spin"
```

---

### Task 8: The `/seasons` directory page

**Files:**
- Create: `src/app/[locale]/seasons/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/app/[locale]/seasons/page.tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { loadTeamColors } from "@/data/loaders";
import { getSeasonChampions } from "@/features/seasons/season-champions";
import { SeasonCard } from "@/features/seasons/components/SeasonCard";
import styles from "@/features/seasons/components/SeasonCard.module.css";
import { canonicalPath } from "@/utils/canonical";
import { revealProps } from "@/utils/reveal";

type Props = { params: Promise<{ locale: string }> };

// ⚠️ HOSTING COST — force-static is load-bearing; no `searchParams` here.
export const dynamic = "force-static";
export const revalidate = 86400;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("seasons");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: canonicalPath(locale, "/seasons") },
  };
}

export default async function SeasonsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("seasons");
  const [champions, colors] = await Promise.all([getSeasonChampions(), loadTeamColors()]);

  return (
    <main className="container-page py-6 lg:py-10">
      <h1 className="mb-6 text-3xl font-bold tracking-tight lg:text-4xl" {...revealProps()}>
        {t("title")}
      </h1>
      <div className={styles.grid}>
        {champions.map((entry, i) => (
          <SeasonCard
            key={entry.season}
            season={entry.season}
            champion={entry.champion}
            clubColor={entry.champion ? (colors?.[entry.champion.id] ?? null) : null}
            index={i}
          />
        ))}
      </div>
    </main>
  );
}
```

> `loadTeamColors` is used by `src/app/[locale]/map/page.tsx` — confirm its return shape with
> `grep -n "loadTeamColors" -A 10 src/data/loaders.ts` and adapt the `colors?.[id]` access if it is not a plain id→colour record. If no colour map exists for a club, `clubColor` stays null and the CSS falls back to `--chart-1`.

- [ ] **Step 2: Build and verify it prerenders**

Run: `node_modules/.bin/next build`
Then: `ls .next/server/app/en/seasons.html .next/server/app/ar/seasons.html`
Expected: both exist.

- [ ] **Step 3: Verify all 34 cards render and link correctly**

Start the server (Task 3 Step 3), then:

```bash
curl -sL http://localhost:3137/seasons | grep -o 'href="/seasons/[0-9]*"' | sort -u | wc -l
```

Expected: 33 — every committed season except the current one, whose card links to `/seasons/2025` and is redirected to `/` at the edge. If you get 34, that is correct too; the redirect handles it.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/seasons/page.tsx"
git commit -m "feat(seasons): the /seasons directory page"
```

---

### Task 9: Season switcher navigates to paths

**Files:**
- Modify: `src/components/layout/SeasonSwitcher.tsx`

- [ ] **Step 1: Make the navigation route-aware**

`SeasonSwitcher` currently writes `?season=` through `useSeason()`. On `/` and `/seasons/*` it must navigate to the path form instead. Add:

```tsx
"use client";

import { usePathname, useRouter } from "@/i18n/navigation";

import { seasonPath } from "@/utils/season-path";
// ...existing imports
```

and inside the component, replace the plain `setSeason` call in the select's `onValueChange` with:

```tsx
  const pathname = usePathname();
  const router = useRouter();
  // TASK-M71a — the dashboard's season lives in the path. Section indexes
  // still use `?season=` until TASK-M71b; DELETE this branch when they move.
  const seasonIsInPath = pathname === "/" || pathname.startsWith("/seasons");

  const onPick = (next: number) => {
    if (seasonIsInPath) {
      router.push(next === currentDataSeason() ? "/" : seasonPath(next));
      return;
    }
    setSeason(next);
  };
```

Use `onPick(Number(value))` as the select handler. Keep `useSeason()` for the current value on non-path routes; on path routes derive the value from `pathname`.

- [ ] **Step 2: Verify the type-check and existing tests**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/vitest run`
Expected: clean and green.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/SeasonSwitcher.tsx
git commit -m "feat(seasons): switcher navigates to /seasons/<year> on the dashboard"
```

---

### Task 10: Sitemap

**Files:**
- Modify: `src/app/sitemap.ts`
- Modify: `tests/unit/sitemap.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/sitemap.test.ts`:

```ts
it("lists the seasons hub and every committed season", async () => {
  const entries = await sitemap();
  const urls = entries.map((e) => e.url);
  expect(urls).toContain("https://pitchiq-pl.vercel.app/seasons");
  expect(urls).toContain("https://pitchiq-pl.vercel.app/seasons/2003");
  // The current season lives at `/` and its path form redirects there, so it
  // must NOT be listed — a sitemap lists canonical URLs only.
  expect(urls).not.toContain("https://pitchiq-pl.vercel.app/seasons/2025");
});
```

> Match the base URL to whatever the existing tests in this file use — read them first rather than assuming.

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run tests/unit/sitemap.test.ts`
Expected: FAIL on the first `toContain`.

- [ ] **Step 3: Add the entries**

In `src/app/sitemap.ts`, import `getAvailableSeasons` from `@/data/loaders` and `currentDataSeason` (already imported), then add to `staticRoutes`:

```ts
    {
      url: `${base}/seasons`,
      alternates: langs("/seasons"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
```

and after it:

```ts
  // TASK-M71a — every historical season is now a real indexable page. The
  // current season is excluded: it lives at `/` and `/seasons/<current>`
  // 308-redirects there.
  const seasonRoutes: MetadataRoute.Sitemap = (await getAvailableSeasons())
    .filter((s) => s !== season)
    .map((s) => ({
      url: `${base}/seasons/${s}`,
      alternates: langs(`/seasons/${s}`),
      changeFrequency: "yearly" as const,
      priority: 0.5,
    }));
```

Include `seasonRoutes` in the returned array.

- [ ] **Step 4: Run it and confirm it passes**

Run: `node_modules/.bin/vitest run tests/unit/sitemap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/sitemap.ts tests/unit/sitemap.test.ts
git commit -m "feat(seasons): list the seasons hub and historical seasons in the sitemap"
```

---

### Task 11: End-to-end coverage

**Files:**
- Create: `tests/e2e/seasons.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { expect, test } from "@playwright/test";

test("the seasons directory lists every season and links to it", async ({ page }) => {
  await page.goto("/seasons");
  const links = page.locator('a[href^="/seasons/"]');
  expect(await links.count()).toBeGreaterThanOrEqual(33);
  await links.first().click();
  await expect(page).toHaveURL(/\/seasons\/\d{4}$/);
});

test("a season page renders that season's standings", async ({ page }) => {
  await page.goto("/seasons/2003");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("2003");
});

test("?season= redirects to the path form", async ({ page }) => {
  await page.goto("/?season=2010");
  await expect(page).toHaveURL(/\/seasons\/2010$/);
});

test("the current season's path form redirects to /", async ({ page }) => {
  await page.goto("/seasons/2025");
  await expect(page).toHaveURL(/\/$/);
});

// ⚠️ This asserts the not-found PAGE, not a 404 STATUS. Measured 2026-07-29:
// this app serves soft 404s app-wide — `/players/999999999` and
// `/this-does-not-exist` both return HTTP **200** with the not-found page,
// even though `src/app/[locale]/[...rest]/page.tsx` correctly calls
// notFound(). The cause is not established and it predates TASK-M71a, so do
// not "fix" it here and do not assert 404 — the test would fail for a reason
// unrelated to this ticket. Tracked separately (soft-404s are an SEO problem
// worth its own ticket, especially on an SEO-motivated change like this one).
test("an unknown season renders the not-found page", async ({ page }) => {
  await page.goto("/seasons/1985");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The dashboard must NOT render for a non-existent season.
  await expect(page.locator("#standings")).toHaveCount(0);
});

test("/ar renders a season page RTL with Arabic content", async ({ page }) => {
  await page.goto("/ar/seasons/2003");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  // Assert on rendered text, never by grepping HTML: next-intl serialises the
  // whole message catalog into every page, so a grep matches regardless.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `node_modules/.bin/playwright test tests/e2e/seasons.spec.ts --reporter=line`

The Playwright config starts `pnpm dev` unless `PLAYWRIGHT_BASE_URL` is set. **Redirects come from `next.config`, so they work in dev**, but `force-static` behaviour does not — for a production-accurate run, build, `next start`, and pass `PLAYWRIGHT_BASE_URL=http://localhost:3137`.

Expected: 6 passed.

- [ ] **Step 3: Run the whole suite for regressions**

Run: `node_modules/.bin/playwright test --reporter=line`
Expected: no new failures. Pay attention to `tests/e2e/season-nav.spec.ts` — it asserts `?season=` is carried across navigation, which Task 9 deliberately preserves for non-migrated routes.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/seasons.spec.ts
git commit -m "test(seasons): e2e coverage for the season path model"
```

---

### Task 12: Promote `/` in the cache guard

Do this **only after the change is deployed and verified**, otherwise you make `main` red.

**Files:**
- Modify: `.github/workflows/cache-guard.yml`

- [ ] **Step 1: Verify production first**

After merge and deploy, confirm the deploy is live and then probe twice:

```bash
curl -s -o /dev/null -D - "https://pitchiq-pl.vercel.app/api/health" | grep -i x-vercel
curl -sS -o /dev/null -D /tmp/h "https://pitchiq-pl.vercel.app/"; sleep 3
curl -sS -o /dev/null -D /tmp/h "https://pitchiq-pl.vercel.app/"; grep -i "x-vercel-cache\|cache-control" /tmp/h
```

Expected: second request `x-vercel-cache: HIT` and `cache-control: public`. Also check `/seasons` and `/seasons/2003`. Confirm `/api/health` reports the merge commit before trusting any reading — probing a stale deploy is how earlier sessions reached two wrong conclusions.

- [ ] **Step 2: Move `/` from report-only to enforced**

Delete the `note "dashboard" "/" "TASK-M71"` line and add `/` to the enforced list:

```bash
          check "dashboard"                    "/"
          check "seasons directory"             "/seasons"
          check "a historical season"           "/seasons/2003"
```

- [ ] **Step 3: Run the guard**

Trigger the `Cache guard` workflow via `workflow_dispatch` and confirm it passes.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/cache-guard.yml
git commit -m "ci: enforce CDN caching on / and the season pages"
```

---

## Done when

- `.next/server/app/{en,ar}.html` exists (the dashboard — note the locale is the leaf, not a directory), plus `{en,ar}/seasons.html` and 34 `{en,ar}/seasons/*.html`.
- `/` and `/seasons/2003` return `x-vercel-cache: HIT` + `cache-control: public` on production.
- `/?season=2010` → `/seasons/2010`; `/seasons/2025` → `/`; `/seasons/1985` renders the not-found page (status is 200 app-wide — see the soft-404 note in Task 11, which predates this ticket).
- The switcher navigates to paths on the dashboard and still writes `?season=` on section indexes.
- `motion-audit`, `no-hardcoded-strings`, the unit suite and the full E2E suite are green.
- The cache guard enforces `/`.

## Follow-ups (not this plan)

- **TASK-M71b** — move `/teams`, `/players`, `/fixtures`, `/leaderboards`, `/managers` under the namespace and delete the dual switcher branch from Task 9.
- **TASK-M71c** — `/teams/[id]` and `/managers/[id]`. Note the 2026-07-25 spec measured these at ~1% of CPU, so justify that work on consistency and SEO, not cost.
