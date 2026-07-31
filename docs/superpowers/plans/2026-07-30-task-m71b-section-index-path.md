# TASK-M71b — Section indexes in the season path: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The five section indexes (`/teams`, `/players`, `/fixtures`, `/leaderboards`, `/managers`) stop reading the server `searchParams` prop and prerender; each historical season becomes a real crawlable page at `/seasons/<year>/<section>`, with the bare `/<section>` serving the current season. The switcher and nav become path-aware, retiring the transitional `?season=` behavior.

**Architecture:** Each index body extracts into a shared season-parameterized async Server Component (`<XIndex season locale />`). The existing bare page renders it `force-static` for the current season; a single new `[section]` registry route renders all five for the 33 historical seasons. Edge redirects (mirroring M71a) keep the current season single-URL and preserve `?season=` links. A client-safe `SECTION_SLUGS` module is the single source of truth for the switcher, nav, and sitemap.

**Tech Stack:** Next 15 App Router (`force-static` + ISR + `generateStaticParams`), next-intl, the existing per-section fetchers + client components (`TeamFilter`, `PlayersTable`, `FixtureBrowser`, `StatLeaderboard`, `ManagersTable`, …).

**Read before starting:**

- The spec: `docs/superpowers/specs/2026-07-30-task-m71b-section-index-path-design.md`.
- `src/app/[locale]/seasons/[year]/page.tsx` — the M71a season-dashboard route this mirrors (force-static + `generateStaticParams` + `parseSeasonSegment` + `notFound`).
- `next.config.ts` `redirects()` — extend it, don't rewrite; the current-season literal is `CURRENT_SEASON_FOR_REDIRECT`, pinned by `tests/unit/next-config-redirects.test.ts`.
- ⚠️ **`force-static` does NOT override a server `searchParams` read** — dropping the prop is the fix. Verify by counting emitted `.html` with **Python** (`wsl.exe` mangles `ls`/`find` globs — see [[pitchiq-wsl-toolchain]]), never the build route table's `● (SSG)`.
- ⚠️ **Never add a `loading.tsx`** above a segment that can `notFound()` (TASK-M72 — resurrects soft 404s).
- ⚠️ Don't grep rendered HTML for i18n copy (whole catalog serialises into every page). Local Playwright timing is untrustworthy — judge scoped `--workers=1` runs, rely on CI. Never pipe `next build` through `tail`.

**File structure:**

```
Create: src/features/seasons/section-slugs.ts               (client-safe SECTION_SLUGS + SectionSlug type)
Create: src/features/teams/components/TeamsIndex.tsx         (<TeamsIndex season locale />)
Create: src/features/players/components/PlayersIndex.tsx
Create: src/features/leagues/components/FixturesIndex.tsx
Create: src/features/players/components/LeaderboardsIndex.tsx
Create: src/features/managers/components/ManagersIndex.tsx
Create: src/features/seasons/section-registry.tsx           (server: slug -> {Index, metadata fields})
Create: src/app/[locale]/seasons/[year]/[section]/page.tsx  (the one nested route, 330 pages)
Modify: src/app/[locale]/{teams,players,fixtures,leaderboards,managers}/page.tsx  (force-static, render <XIndex season=current>)
Modify: next.config.ts                                       (extend redirects() over SECTION_SLUGS)
Modify: src/components/layout/SeasonSwitcher.tsx             (path-aware on indexes; delete ?season= branch)
Modify: src/components/layout/PrimaryNav.tsx, MobileNav.tsx, NavLink.tsx  (path-building; drop withSeason)
Modify: src/app/sitemap.ts                                   (add /seasons/<year>/<section>)
Test:   tests/unit/section-slugs.test.ts, tests/unit/teams-index.test.tsx (+ per-section),
        tests/unit/next-config-redirects.test.ts (extend), tests/unit/season-switcher.test.tsx (extend),
        tests/unit/sitemap.test.ts (extend)
Test:   tests/e2e/season-nav.spec.ts (rewrite to path model), tests/e2e/seasons.spec.ts (add section coverage)
```

---

### Task 1: `SECTION_SLUGS` — the shared registry of section slugs

**Files:**

- Create: `src/features/seasons/section-slugs.ts`
- Test: `tests/unit/section-slugs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/section-slugs.test.ts
import { describe, expect, it } from "vitest";

import { SECTION_SLUGS, isSectionSlug } from "@/features/seasons/section-slugs";

describe("section slugs", () => {
  it("lists the five season-path section indexes in nav order", () => {
    expect(SECTION_SLUGS).toEqual(["teams", "players", "fixtures", "leaderboards", "managers"]);
  });

  it("type-guards a slug", () => {
    expect(isSectionSlug("teams")).toBe(true);
    expect(isSectionSlug("compare")).toBe(false);
    expect(isSectionSlug("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run tests/unit/section-slugs.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// src/features/seasons/section-slugs.ts
// TASK-M71b — the sections that live under the season path
// (/seasons/<year>/<slug>, bare /<slug> = current). Single source of truth for
// the nested route, the switcher, the nav and the sitemap. Client-safe (plain
// strings, no server imports) so client components can import it. `/compare`
// is NOT here — it genuinely reads searchParams and stays dynamic.
export const SECTION_SLUGS = ["teams", "players", "fixtures", "leaderboards", "managers"] as const;

export type SectionSlug = (typeof SECTION_SLUGS)[number];

export function isSectionSlug(value: string): value is SectionSlug {
  return (SECTION_SLUGS as readonly string[]).includes(value);
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node_modules/.bin/vitest run tests/unit/section-slugs.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/seasons/section-slugs.ts tests/unit/section-slugs.test.ts
git commit -m "feat(seasons): SECTION_SLUGS registry for the section-index path model"
```

---

### Task 2: Extract `<TeamsIndex>` and make bare `/teams` force-static

The reference extraction. The current `/teams/page.tsx` body moves verbatim into
`<TeamsIndex season locale />`; the page becomes a thin force-static wrapper.

**Files:**

- Create: `src/features/teams/components/TeamsIndex.tsx`
- Modify: `src/app/[locale]/teams/page.tsx`
- Test: `tests/unit/teams-index.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/teams-index.test.tsx
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/features/teams/api", () => ({
  getPLTeams: vi.fn(async (season: number) => [
    { team: { id: 42, name: `Club-${season}` }, venue: {} },
  ]),
}));
vi.mock("@/data/loaders", () => ({ loadTeamColors: vi.fn(async () => null) }));

import { TeamsIndex } from "@/features/teams/components/TeamsIndex";

describe("TeamsIndex", () => {
  it("fetches the passed season (not the current one)", async () => {
    const { getPLTeams } = await import("@/features/teams/api");
    // Render the async server component to markup to force the fetch to run.
    renderToStaticMarkup(await TeamsIndex({ season: 2003, locale: "en" }));
    expect(vi.mocked(getPLTeams)).toHaveBeenCalledWith(2003);
  });
});
```

> `renderToStaticMarkup(await Component(props))` is how the repo unit-tests async
> Server Components — check an existing example (`grep -rl "renderToStaticMarkup" tests/unit`)
> and match its intl-provider wrapper if the component calls `getTranslations` (it does;
> wrap with the test's intl helper, e.g. reuse `tests/unit/_helpers`).

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run tests/unit/teams-index.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Create the component** (move the current page body in; it now takes `season`/`locale` as props instead of reading `params`/`searchParams`)

```tsx
// src/features/teams/components/TeamsIndex.tsx
import { Shield } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { loadTeamColors } from "@/data/loaders";
import { TeamFilter } from "@/features/teams/components/TeamFilter";
import { getPLTeams } from "@/features/teams/api";
import { revealProps } from "@/utils/reveal";
import { formatSeasonLabel } from "@/utils/season";

// TASK-M71b — the season-parameterized teams index, shared by the bare
// /teams page (current season, force-static) and /seasons/<year>/teams. The
// season is a prop, NOT read from searchParams — reading searchParams would
// opt the route into dynamic rendering (the 2026-07 Active-CPU regression).
export async function TeamsIndex({ season, locale }: { season: number; locale: string }) {
  const t = await getTranslations("teams");
  const [teams, teamColors] = await Promise.all([getPLTeams(season), loadTeamColors()]);

  if (!teams || teams.length === 0) {
    return (
      <main className="container-page py-6 lg:py-10">
        <h1 className="text-3xl font-semibold tracking-tight">{t("clubs")}</h1>
        <p className="text-muted-foreground mt-4 text-sm">{t("listUnavailable")}</p>
      </main>
    );
  }

  const colors: Record<number, string> = {};
  if (teamColors) {
    for (const [id, c] of Object.entries(teamColors)) colors[Number(id)] = c.home;
  }

  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <header {...revealProps()}>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <Shield className="text-primary size-7" aria-hidden />
          {t("clubs")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("everyClub", { season: formatSeasonLabel(season, locale) })}
        </p>
      </header>
      <TeamFilter teams={teams} season={season} colors={colors} />
    </main>
  );
}
```

- [ ] **Step 4: Rewrite the bare page** to render it force-static

```tsx
// src/app/[locale]/teams/page.tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { teamsOgImagePath } from "@/app/api/og/teams-card";
import { TeamsIndex } from "@/features/teams/components/TeamsIndex";
import { currentDataSeason } from "@/utils/season";
import { canonicalPath } from "@/utils/canonical";

type Props = { params: Promise<{ locale: string }> };

// ⚠️ HOSTING COST — force-static is load-bearing (TASK-M71b). NEVER read the
// server `searchParams` prop here again: it opts the route into dynamic
// rendering, `force-static` can't override it, and the route then emits ZERO
// prerendered pages (the 2026-07 Active-CPU pause). Historical seasons live at
// /seasons/<year>/teams; `/teams?season=YYYY` 308-redirects there in
// next.config.ts. See docs/hosting-cost.md.
export const dynamic = "force-static";
export const revalidate = 86400;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const url = teamsOgImagePath(currentDataSeason());
  const t = await getTranslations("teams");
  return {
    title: t("clubs"),
    // Season-less canonical: the bare URL is the current season's single URL.
    alternates: { canonical: canonicalPath(locale, "/teams") },
    description: t("metaDescription"),
    openGraph: { images: [{ url, width: 1200, height: 630, alt: t("ogAlt") }] },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function TeamsIndexPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TeamsIndex season={currentDataSeason()} locale={locale} />;
}
```

- [ ] **Step 5: Run the test + typecheck**

Run: `node_modules/.bin/vitest run tests/unit/teams-index.test.tsx && node_modules/.bin/tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/teams/components/TeamsIndex.tsx "src/app/[locale]/teams/page.tsx" tests/unit/teams-index.test.tsx
git commit -m "feat(teams): extract <TeamsIndex>, make bare /teams prerender"
```

---

### Task 3: Extract `<PlayersIndex>` + force-static `/players`

**Files:**

- Create: `src/features/players/components/PlayersIndex.tsx`
- Modify: `src/app/[locale]/players/page.tsx`

- [ ] **Step 1: Create the component** (page body → props; the empty-state CTA changes `/players?season=<current>` → bare `/players`, since the current season is the bare URL)

```tsx
// src/features/players/components/PlayersIndex.tsx
import { getTranslations } from "next-intl/server";

import { DataUnavailable } from "@/components/DataUnavailable";
import { PlayersTable } from "@/features/players/components/PlayersTable";
import { TopPlayersStrip } from "@/features/players/components/TopPlayersStrip";
import { getSeasonPlayers } from "@/features/players/players-index.api";
import { localizeDigits } from "@/utils/format";
import { revealProps } from "@/utils/reveal";
import { formatSeasonLabel } from "@/utils/season";

export async function PlayersIndex({ season, locale }: { season: number; locale: string }) {
  const rows = await getSeasonPlayers(season);
  const t = await getTranslations("players");
  const tc = await getTranslations("common");

  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <div {...revealProps()}>
        <h1 className="text-3xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {formatSeasonLabel(season, locale)} ·{" "}
          {rows
            ? t("playersCount", {
                count: rows.length,
                countFmt: localizeDigits(rows.length, locale),
              })
            : t("rankedBy")}
        </p>
      </div>
      {rows && rows.length > 0 ? (
        <>
          <TopPlayersStrip rows={rows} season={season} />
          <PlayersTable rows={rows} season={season} />
        </>
      ) : (
        <DataUnavailable
          title={t("noData")}
          message={t("noDataMsg")}
          cta={{ href: "/players", label: tc("viewLatestSeason") }}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Rewrite the bare page** (same shape as Task 2 Step 4: `force-static`, drop searchParams, season-less canonical, `<PlayersIndex season={currentDataSeason()} locale={locale} />`)

```tsx
// src/app/[locale]/players/page.tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { playersOgImagePath } from "@/app/api/og/players-card";
import { PlayersIndex } from "@/features/players/components/PlayersIndex";
import { currentDataSeason } from "@/utils/season";
import { canonicalPath } from "@/utils/canonical";

type Props = { params: Promise<{ locale: string }> };

// ⚠️ HOSTING COST — force-static; NEVER read searchParams (see /teams).
export const dynamic = "force-static";
export const revalidate = 86400;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const url = playersOgImagePath(currentDataSeason());
  const t = await getTranslations("players");
  return {
    title: t("pageTitle"),
    alternates: { canonical: canonicalPath(locale, "/players") },
    description: t("metaDescription"),
    openGraph: { images: [{ url, width: 1200, height: 630, alt: t("ogAlt") }] },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function PlayersIndexPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PlayersIndex season={currentDataSeason()} locale={locale} />;
}
```

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/features/players/components/PlayersIndex.tsx "src/app/[locale]/players/page.tsx"
git commit -m "feat(players): extract <PlayersIndex>, make bare /players prerender"
```

---

### Task 4: Extract `<FixturesIndex>` + force-static `/fixtures`

**Files:**

- Create: `src/features/leagues/components/FixturesIndex.tsx`
- Modify: `src/app/[locale]/fixtures/page.tsx`

- [ ] **Step 1: Create the component** (move the body; note fixtures uses a `<div className="container-page">` wrapper, not `<main>` — keep it)

```tsx
// src/features/leagues/components/FixturesIndex.tsx
import { getTranslations } from "next-intl/server";

import { loadTeamColors } from "@/data/loaders";
import { FixtureBrowser } from "@/features/leagues/components/FixtureBrowser";
import { groupFixturesByDay } from "@/features/leagues/fixtures-by-day";
import { getSeasonFixtures } from "@/features/leagues/fixtures.api";
import { pickClubAccent } from "@/features/players/players-index.api";
import { localizeDigits } from "@/utils/format";
import { revealProps } from "@/utils/reveal";
import { formatSeasonLabel } from "@/utils/season";

export async function FixturesIndex({ season, locale }: { season: number; locale: string }) {
  const [fixtures, teamColors, t] = await Promise.all([
    getSeasonFixtures({ season }),
    loadTeamColors(),
    getTranslations("fixtures"),
  ]);
  const groups = fixtures ? groupFixturesByDay(fixtures, { order: "desc", locale }) : [];

  const accentByTeam: Record<number, string | null> = {};
  if (fixtures) {
    for (const fx of fixtures) {
      const id = fx.teams.home.id;
      if (id in accentByTeam) continue;
      const kit = teamColors?.[String(id)];
      accentByTeam[id] = pickClubAccent(kit?.home, kit?.away);
    }
  }

  return (
    <div className="container-page py-6 lg:py-10">
      <header className="mb-6 lg:mb-8" {...revealProps()}>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          {t("pageHeading")} · {formatSeasonLabel(season, locale)}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {fixtures && fixtures.length > 0
            ? t("allMatchesNewest", { count: localizeDigits(fixtures.length, locale) })
            : t("seasonSubtitle")}
        </p>
      </header>
      {groups.length === 0 ? (
        <div className="text-muted-foreground bg-card rounded-md border p-6 text-sm" role="status">
          {t("noFixtures")}
        </div>
      ) : (
        <FixtureBrowser
          groups={groups}
          season={season}
          accentByTeam={accentByTeam}
          totalCount={fixtures?.length ?? 0}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the bare page** (force-static; fixtures title interpolates the season, so keep that; season-less canonical)

```tsx
// src/app/[locale]/fixtures/page.tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { fixturesOgImagePath } from "@/app/api/og/fixtures-card";
import { FixturesIndex } from "@/features/leagues/components/FixturesIndex";
import { currentDataSeason, formatSeasonLabel } from "@/utils/season";
import { canonicalPath } from "@/utils/canonical";

type Props = { params: Promise<{ locale: string }> };

// ⚠️ HOSTING COST — force-static; NEVER read searchParams (see /teams).
export const dynamic = "force-static";
export const revalidate = 86400;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const season = currentDataSeason();
  const url = fixturesOgImagePath(season);
  const t = await getTranslations("fixtures");
  return {
    title: t("metaTitle", { season: formatSeasonLabel(season) }),
    alternates: { canonical: canonicalPath(locale, "/fixtures") },
    openGraph: { images: [{ url, width: 1200, height: 630, alt: t("ogAlt") }] },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function FixturesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <FixturesIndex season={currentDataSeason()} locale={locale} />;
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `node_modules/.bin/tsc --noEmit`

```bash
git add src/features/leagues/components/FixturesIndex.tsx "src/app/[locale]/fixtures/page.tsx"
git commit -m "feat(fixtures): extract <FixturesIndex>, make bare /fixtures prerender"
```

---

### Task 5: Extract `<LeaderboardsIndex>` + force-static `/leaderboards`

**Files:**

- Create: `src/features/players/components/LeaderboardsIndex.tsx`
- Modify: `src/app/[locale]/leaderboards/page.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/features/players/components/LeaderboardsIndex.tsx
import { getTranslations } from "next-intl/server";

import { DataUnavailable } from "@/components/DataUnavailable";
import { loadPlayers } from "@/data/loaders";
import { StatLeaderboard } from "@/features/players/components/StatLeaderboard";
import { buildBoards } from "@/features/players/leaderboards-index";
import { revealProps } from "@/utils/reveal";
import { formatSeasonLabel } from "@/utils/season";

export async function LeaderboardsIndex({ season, locale }: { season: number; locale: string }) {
  const players = await loadPlayers(season);
  const boards = players ? buildBoards(players) : [];
  const t = await getTranslations("leaderboard");
  const tc = await getTranslations("common");
  const tp = await getTranslations("players");

  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <div {...revealProps()}>
        <h1 className="text-3xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{formatSeasonLabel(season, locale)}</p>
      </div>
      {boards.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map(({ cat, rows }) => (
            <StatLeaderboard
              key={cat.key}
              title={t(cat.titleKey)}
              valueLabel={t(cat.valueLabelKey)}
              entries={rows}
              accent={cat.accent}
              season={season}
              limit={10}
              variant="badge"
            />
          ))}
        </div>
      ) : (
        <DataUnavailable
          title={t("noData2")}
          message={tp("noDataMsg")}
          cta={{ href: "/leaderboards", label: tc("viewLatestSeason") }}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Rewrite the bare page**

```tsx
// src/app/[locale]/leaderboards/page.tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { leaderboardsOgImagePath } from "@/app/api/og/leaderboards-card";
import { LeaderboardsIndex } from "@/features/players/components/LeaderboardsIndex";
import { currentDataSeason } from "@/utils/season";
import { canonicalPath } from "@/utils/canonical";

type Props = { params: Promise<{ locale: string }> };

// ⚠️ HOSTING COST — force-static; NEVER read searchParams (see /teams).
export const dynamic = "force-static";
export const revalidate = 86400;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const url = leaderboardsOgImagePath(currentDataSeason());
  const t = await getTranslations("leaderboard");
  return {
    title: t("metaTitle"),
    alternates: { canonical: canonicalPath(locale, "/leaderboards") },
    description: t("metaDescription"),
    openGraph: { images: [{ url, width: 1200, height: 630, alt: t("ogAlt") }] },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function LeaderboardsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LeaderboardsIndex season={currentDataSeason()} locale={locale} />;
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
git add src/features/players/components/LeaderboardsIndex.tsx "src/app/[locale]/leaderboards/page.tsx"
git commit -m "feat(leaderboards): extract <LeaderboardsIndex>, make bare /leaderboards prerender"
```

---

### Task 6: Extract `<ManagersIndex>` + force-static `/managers`

**Files:**

- Create: `src/features/managers/components/ManagersIndex.tsx`
- Modify: `src/app/[locale]/managers/page.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/features/managers/components/ManagersIndex.tsx
import { getTranslations } from "next-intl/server";

import { DataUnavailable } from "@/components/DataUnavailable";
import { ManagerStatHighlights } from "@/features/managers/components/ManagerStatHighlights";
import { ManagersTable } from "@/features/managers/components/ManagersTable";
import { getSeasonManagers } from "@/features/managers/managers-index.api";
import { revealProps } from "@/utils/reveal";
import { formatSeasonLabel } from "@/utils/season";

export async function ManagersIndex({ season, locale }: { season: number; locale: string }) {
  const rows = await getSeasonManagers(season);
  const t = await getTranslations("managers");
  const tc = await getTranslations("common");

  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <div {...revealProps()}>
        <h1 className="text-3xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {formatSeasonLabel(season, locale)} · {t("rankedByPoints")}
        </p>
      </div>
      {rows && rows.length > 0 ? (
        <>
          <ManagerStatHighlights rows={rows} />
          <ManagersTable rows={rows} season={season} />
        </>
      ) : (
        <DataUnavailable
          title={t("noData")}
          message={t("noDataMsg")}
          cta={{ href: "/managers", label: tc("viewLatestSeason") }}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Rewrite the bare page**

```tsx
// src/app/[locale]/managers/page.tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { managersOgImagePath } from "@/app/api/og/managers-card";
import { ManagersIndex } from "@/features/managers/components/ManagersIndex";
import { currentDataSeason } from "@/utils/season";
import { canonicalPath } from "@/utils/canonical";

type Props = { params: Promise<{ locale: string }> };

// ⚠️ HOSTING COST — force-static; NEVER read searchParams (see /teams).
export const dynamic = "force-static";
export const revalidate = 86400;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const url = managersOgImagePath(currentDataSeason());
  const t = await getTranslations("managers");
  return {
    title: t("pageTitle"),
    alternates: { canonical: canonicalPath(locale, "/managers") },
    description: t("metaDescription"),
    openGraph: { images: [{ url, width: 1200, height: 630, alt: t("ogAlt") }] },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function ManagersIndexPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ManagersIndex season={currentDataSeason()} locale={locale} />;
}
```

- [ ] **Step 3: Typecheck + full unit suite + commit**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/vitest run`
Expected: clean + green.

```bash
git add src/features/managers/components/ManagersIndex.tsx "src/app/[locale]/managers/page.tsx"
git commit -m "feat(managers): extract <ManagersIndex>, make bare /managers prerender"
```

---

### Task 7: The nested `[section]` route — all five, historical seasons

One route renders every `/seasons/<year>/<section>` via a server-side registry.

**Files:**

- Create: `src/features/seasons/section-registry.tsx`
- Create: `src/app/[locale]/seasons/[year]/[section]/page.tsx`

- [ ] **Step 1: Create the server registry** (maps slug → the index component + its metadata fields; server-only because it imports the Server Components + OG helpers)

```tsx
// src/features/seasons/section-registry.tsx
import "server-only";

import { fixturesOgImagePath } from "@/app/api/og/fixtures-card";
import { leaderboardsOgImagePath } from "@/app/api/og/leaderboards-card";
import { managersOgImagePath } from "@/app/api/og/managers-card";
import { playersOgImagePath } from "@/app/api/og/players-card";
import { teamsOgImagePath } from "@/app/api/og/teams-card";
import { FixturesIndex } from "@/features/leagues/components/FixturesIndex";
import { LeaderboardsIndex } from "@/features/players/components/LeaderboardsIndex";
import { PlayersIndex } from "@/features/players/components/PlayersIndex";
import { ManagersIndex } from "@/features/managers/components/ManagersIndex";
import { TeamsIndex } from "@/features/teams/components/TeamsIndex";
import type { SectionSlug } from "@/features/seasons/section-slugs";

type SectionEntry = {
  Index: (props: { season: number; locale: string }) => Promise<React.JSX.Element>;
  og: (season: number) => string;
  ns: string; // getTranslations namespace
  titleKey: string;
  titleNeedsSeason?: boolean; // fixtures interpolates {season}
  descKey?: string; // fixtures has no description
  ogAltKey: string;
};

export const SECTION_REGISTRY: Record<SectionSlug, SectionEntry> = {
  teams: {
    Index: TeamsIndex,
    og: teamsOgImagePath,
    ns: "teams",
    titleKey: "clubs",
    descKey: "metaDescription",
    ogAltKey: "ogAlt",
  },
  players: {
    Index: PlayersIndex,
    og: playersOgImagePath,
    ns: "players",
    titleKey: "pageTitle",
    descKey: "metaDescription",
    ogAltKey: "ogAlt",
  },
  fixtures: {
    Index: FixturesIndex,
    og: fixturesOgImagePath,
    ns: "fixtures",
    titleKey: "metaTitle",
    titleNeedsSeason: true,
    ogAltKey: "ogAlt",
  },
  leaderboards: {
    Index: LeaderboardsIndex,
    og: leaderboardsOgImagePath,
    ns: "leaderboard",
    titleKey: "metaTitle",
    descKey: "metaDescription",
    ogAltKey: "ogAlt",
  },
  managers: {
    Index: ManagersIndex,
    og: managersOgImagePath,
    ns: "managers",
    titleKey: "pageTitle",
    descKey: "metaDescription",
    ogAltKey: "ogAlt",
  },
};
```

> Verify each OG helper's exact export name (`grep -rn "OgImagePath" src/app/api/og/`) and each
> `Index` component's prop signature matches `{ season, locale }` from Tasks 2–6.

- [ ] **Step 2: Create the route**

```tsx
// src/app/[locale]/seasons/[year]/[section]/page.tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { getAvailableSeasons } from "@/data/loaders";
import { SECTION_REGISTRY } from "@/features/seasons/section-registry";
import { SECTION_SLUGS, isSectionSlug } from "@/features/seasons/section-slugs";
import { canonicalPath } from "@/utils/canonical";
import { currentDataSeason, formatSeasonLabel } from "@/utils/season";
import { parseSeasonSegment } from "@/utils/season-path";

type Props = { params: Promise<{ locale: string; year: string; section: string }> };

// ⚠️ HOSTING COST — force-static; the season is in `params`, never searchParams.
export const dynamic = "force-static";
export const revalidate = 86400;
// Every valid (year, section) is prerendered; anything else is a real 404.
export const dynamicParams = false;

// The 33 NON-current committed seasons × 5 sections. The current season's
// nested form 308-redirects to the bare `/<section>` at the edge (next.config),
// so it is excluded here — no wasted prerender.
export async function generateStaticParams(): Promise<Array<{ year: string; section: string }>> {
  const seasons = (await getAvailableSeasons()).filter((s) => s !== currentDataSeason());
  return seasons.flatMap((season) =>
    SECTION_SLUGS.map((section) => ({ year: String(season), section })),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, year, section } = await params;
  setRequestLocale(locale);
  const season = parseSeasonSegment(year);
  if (season === null || !isSectionSlug(section)) return {};
  const reg = SECTION_REGISTRY[section];
  const t = await getTranslations(reg.ns);
  const url = reg.og(season);
  return {
    title: reg.titleNeedsSeason
      ? t(reg.titleKey, { season: formatSeasonLabel(season) })
      : t(reg.titleKey),
    description: reg.descKey ? t(reg.descKey) : undefined,
    // Self-canonical: this season-section is its own indexable URL.
    alternates: { canonical: canonicalPath(locale, `/seasons/${season}/${section}`) },
    openGraph: { images: [{ url, width: 1200, height: 630, alt: t(reg.ogAltKey) }] },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function SeasonSectionPage({ params }: Props) {
  const { locale, year, section } = await params;
  setRequestLocale(locale);
  const season = parseSeasonSegment(year);
  if (season === null || !isSectionSlug(section)) notFound();
  const { Index } = SECTION_REGISTRY[section];
  return <Index season={season} locale={locale} />;
}
```

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: clean. (If TS complains about the `Index` return type, align `SectionEntry.Index` with the components' actual `Promise<JSX.Element>` return — read one component's inferred type.)

- [ ] **Step 4: Build and confirm the nested pages EMIT** (count with Python — `wsl.exe` mangles shell globs)

Run: `node_modules/.bin/next build` then a Python count of `.next/server/app/en/seasons/<year>/<section>.html`.
Expected: `en/seasons` contains 33 `<year>` dirs each with 5 section `.html` files → 165/locale; and each bare `/{teams,players,...}.html` exists (not 0). Note counts for the PR.

- [ ] **Step 5: Commit**

```bash
git add src/features/seasons/section-registry.tsx "src/app/[locale]/seasons/[year]/[section]/page.tsx"
git commit -m "feat(seasons): nested /seasons/[year]/[section] route prerenders all five indexes"
```

---

### Task 8: Edge redirects for the section paths

**Files:**

- Modify: `next.config.ts`
- Modify: `tests/unit/next-config-redirects.test.ts`

- [ ] **Step 1: Extend the guard test** (add, after the existing assertions)

```ts
// in tests/unit/next-config-redirects.test.ts, inside the describe block
it("redirects each section's current-season path form to the bare URL", async () => {
  const redirects = (await nextConfig.redirects?.()) ?? [];
  const sources = redirects.map((r) => r.source);
  for (const s of ["teams", "players", "fixtures", "leaderboards", "managers"]) {
    expect(sources).toContain(`/seasons/:year(${CURRENT_SEASON_FOR_REDIRECT})/${s}`);
    expect(sources).toContain(`/ar/seasons/:year(${CURRENT_SEASON_FOR_REDIRECT})/${s}`);
  }
});

it("redirects each section's legacy ?season= links to the path form", async () => {
  const redirects = (await nextConfig.redirects?.()) ?? [];
  for (const s of ["teams", "players", "fixtures", "leaderboards", "managers"]) {
    expect(redirects).toContainEqual(
      expect.objectContaining({ source: `/${s}`, destination: `/seasons/:season/${s}` }),
    );
    expect(redirects).toContainEqual(
      expect.objectContaining({ source: `/ar/${s}`, destination: `/ar/seasons/:season/${s}` }),
    );
  }
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run tests/unit/next-config-redirects.test.ts`
Expected: FAIL — the section redirects don't exist yet.

- [ ] **Step 3: Extend `redirects()`** — after the existing four dashboard redirects, generate the section ones in a loop. `next.config.ts` cannot import `@/features/...`, so inline the slug list (kept in sync with `SECTION_SLUGS` by the guard test above).

```ts
  async redirects() {
    // Kept in sync with src/features/seasons/section-slugs.ts by
    // tests/unit/next-config-redirects.test.ts (next.config can't import `@/`).
    const SECTIONS = ["teams", "players", "fixtures", "leaderboards", "managers"];
    const sectionRedirects = SECTIONS.flatMap((s) => [
      // Current season's nested form → the bare section URL (both locales).
      { source: `/seasons/:year(${CURRENT_SEASON_FOR_REDIRECT})/${s}`, destination: `/${s}`, permanent: true },
      { source: `/ar/seasons/:year(${CURRENT_SEASON_FOR_REDIRECT})/${s}`, destination: `/ar/${s}`, permanent: true },
      // Legacy ?season= → the path form (both locales). Next forwards the
      // query onto the destination; harmless (the page self-canonicalises).
      {
        source: `/${s}`,
        has: [{ type: "query", key: "season", value: "(?<season>\\d{4})" }],
        destination: `/seasons/:season/${s}`,
        permanent: true,
      },
      {
        source: `/ar/${s}`,
        has: [{ type: "query", key: "season", value: "(?<season>\\d{4})" }],
        destination: `/ar/seasons/:season/${s}`,
        permanent: true,
      },
    ]);

    return [
      // ...the existing four dashboard redirects, unchanged...
      ...sectionRedirects,
    ];
  },
```

Paste `...sectionRedirects` into the existing `return [ ... ]` array (keep the four dashboard entries).

- [ ] **Step 4: Run it and confirm it passes**

Run: `node_modules/.bin/vitest run tests/unit/next-config-redirects.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add next.config.ts tests/unit/next-config-redirects.test.ts
git commit -m "feat(seasons): edge redirects for the section-index season paths"
```

---

### Task 9: Season switcher — path-aware on the indexes, delete the `?season=` branch

**Files:**

- Modify: `src/components/layout/SeasonSwitcher.tsx`
- Modify: `tests/unit/season-switcher.test.tsx`

Current behavior (M71a): `seasonIsInPath = pathname === "/" || pathname.startsWith("/seasons")`; on those it navigates to `/seasons/<year>` (or `/`), else it writes `?season=` via `useSeason`. Now every section index is path-model too.

- [ ] **Step 1: Add a helper to build the target path** (new export in `src/utils/season-path.ts`, with a test)

```ts
// append to src/utils/season-path.ts
import { SECTION_SLUGS } from "@/features/seasons/section-slugs";

// TASK-M71b — the URL to navigate to when the switcher/nav picks `season` while
// viewing `pathname`. Path model for the dashboard, the seasons directory, and
// the section indexes; returns null for routes that don't carry a season (the
// caller then leaves the link untouched). Current season → the bare URL.
export function seasonNavTarget(
  pathname: string,
  season: number,
  currentSeason: number,
): string | null {
  const bare = pathname.replace(/^\/ar/, "");
  const arPrefix = pathname.startsWith("/ar") ? "/ar" : "";
  // Dashboard: `/` <-> `/seasons/<year>`.
  if (bare === "" || bare === "/") {
    return season === currentSeason ? `${arPrefix}/` : `${arPrefix}/seasons/${season}`;
  }
  // A section index: `/teams` or `/seasons/<year>/teams`.
  const section = sectionOf(bare);
  if (section) {
    return season === currentSeason
      ? `${arPrefix}/${section}`
      : `${arPrefix}/seasons/${season}/${section}`;
  }
  // The seasons dashboard `/seasons/<year>` (no section).
  if (/^\/seasons\/\d{4}$/.test(bare)) {
    return season === currentSeason ? `${arPrefix}/` : `${arPrefix}/seasons/${season}`;
  }
  return null;
}

function sectionOf(bare: string): string | null {
  const m = /^\/(?:seasons\/\d{4}\/)?([a-z]+)$/.exec(bare);
  if (m && (SECTION_SLUGS as readonly string[]).includes(m[1])) return m[1];
  return null;
}
```

> Test `seasonNavTarget` in `tests/unit/season-path.test.ts`: `("/teams", 2003, 2025) → "/seasons/2003/teams"`; `("/seasons/2003/teams", 2025, 2025) → "/teams"`; `("/ar/players", 2010, 2025) → "/ar/seasons/2010/players"`; `("/", 2003, 2025) → "/seasons/2003"`; `("/compare", 2003, 2025) → null`. Write these first (red), then confirm green.

- [ ] **Step 2: Rewrite the switcher to use it and drop `useSeason`**

```tsx
// src/components/layout/SeasonSwitcher.tsx — the onValueChange + value logic
"use client";
// imports: useLocale/useTranslations, Select..., usePathname/useRouter from "@/i18n/navigation",
// currentDataSeason/formatSeasonLabel, seasonFromPathname/seasonNavTarget from "@/utils/season-path"
export function SeasonSwitcher({ seasons }: { seasons: number[] }) {
  const t = useTranslations("controls");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const current = currentDataSeason();

  // Every season-bearing route is path-model now (TASK-M71b removed the
  // ?season= branch). Derive the viewed season from the path.
  const value = seasonFromPathname(pathname) ?? current;

  return (
    <Select
      value={String(value)}
      onValueChange={(picked) => {
        const next = Number(picked);
        if (!Number.isInteger(next)) return;
        const target = seasonNavTarget(pathname, next, current);
        if (target) router.push(target);
      }}
    >
      {/* ...unchanged trigger + content... */}
    </Select>
  );
}
```

Delete the `useSeason` import and its usage. `seasonFromPathname` must also recognise the bare section indexes as current-season (it returns null for them → falls back to `current`, correct) and extract the year from `/seasons/<year>/<section>` — extend it if it only matched `/seasons/<year>$`:

```ts
// src/utils/season-path.ts — seasonFromPathname
export function seasonFromPathname(pathname: string): number | null {
  const m = /^\/(?:ar\/)?seasons\/(\d{4})(?:\/[a-z]+)?$/.exec(pathname);
  return m ? parseSeasonSegment(m[1]) : null;
}
```

- [ ] **Step 3: Update the switcher unit test** — the M71a test mocked `next/navigation` `useRouter`; extend/adjust so a pick on `/teams` pushes `/seasons/<year>/teams` and on `/seasons/2003/players` the trigger shows 2003-04. Remove assertions tied to the deleted `?season=` branch.

- [ ] **Step 4: Run the affected unit tests + typecheck**

Run: `node_modules/.bin/vitest run tests/unit/season-path.test.ts tests/unit/season-switcher.test.tsx && node_modules/.bin/tsc --noEmit`
Expected: green + clean.

- [ ] **Step 5: Commit**

```bash
git add src/utils/season-path.ts src/components/layout/SeasonSwitcher.tsx tests/unit/season-path.test.ts tests/unit/season-switcher.test.tsx
git commit -m "feat(seasons): switcher navigates the section-index path; drop the ?season= branch"
```

---

### Task 10: Nav — carry the season in the path, drop `withSeason`

**Files:**

- Modify: `src/components/layout/PrimaryNav.tsx`, `src/components/layout/MobileNav.tsx`, `src/components/layout/NavLink.tsx`

Currently these read the viewed season and append `?season=` via `withSeason()` to every nav link. Now: on a `/seasons/<year>/*` (or bare index) page, a nav link to section X becomes `/seasons/<year>/X` (or bare `/X` for the current season). Reuse `seasonNavTarget`: for a target href `/teams`, the season-carried form is `seasonNavTarget("/seasons/<year>/anything", season, current)` — but simpler, build directly from the viewed season.

- [ ] **Step 1: Add a nav-link builder** (in `src/utils/season-path.ts`, tested)

```ts
// append to src/utils/season-path.ts
// The nav href for a bare section/dashboard `href` when the viewed season is
// `season`. Current season → bare href; else the /seasons/<year>/... form.
// `href` is one of "/", "/teams", "/players", ... (the NAV_ITEMS hrefs).
export function navHrefForSeason(
  href: string,
  season: number | null,
  currentSeason: number,
): string {
  if (season === null || season === currentSeason) return href;
  if (href === "/") return `/seasons/${season}`;
  const slug = href.replace(/^\//, "");
  if ((SECTION_SLUGS as readonly string[]).includes(slug)) return `/seasons/${season}/${slug}`;
  return href; // non-season routes (e.g. /compare, /map) stay bare
}
```

> Test in `tests/unit/season-path.test.ts`: `("/teams", 2003, 2025) → "/seasons/2003/teams"`; `("/", 2003, 2025) → "/seasons/2003"`; `("/teams", 2025, 2025) → "/teams"`; `("/compare", 2003, 2025) → "/compare"`; `("/map", null, 2025) → "/map"`.

- [ ] **Step 2: Rewrite the three nav components** to derive the viewed season from the pathname (via `seasonFromPathname`) instead of `useSearchParams().get("season")`, and build each link with `navHrefForSeason(item.href, viewedSeason, currentDataSeason())` instead of `withSeason(...)`. Delete the `withSeason` import in each. Keep the active-state matching on the bare `href`.

For example, in `PrimaryNav.tsx`, `NavListWithSeason` becomes:

```tsx
function NavListWithSeason() {
  const pathname = usePathname();
  const season = seasonFromPathname(pathname);
  return <NavList season={season} />;
}
// and inside NavList, replace linkFor():
function linkFor(href: string, season: number | null): string {
  return navHrefForSeason(href, season, currentDataSeason());
}
```

Apply the equivalent change in `MobileNav.tsx`. `NavLink.tsx` (if it independently appends `withSeason`) takes the viewed season as a `number | null` and calls `navHrefForSeason`. Remove `useSearchParams` where it was only feeding `withSeason` (keep `<Suspense>` only if still needed for another `useSearchParams`).

> `withSeason` may still be used elsewhere (`grep -rn "withSeason" src/`). Only remove the import from files that no longer use it; leave the helper's definition if anything else references it.

- [ ] **Step 3: Typecheck + affected unit tests**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/vitest run tests/unit/season-path.test.ts tests/unit/primary-nav.test.tsx tests/unit/mobile-nav.test.tsx tests/unit/nav-link.test.tsx`
Expected: clean + green (update the nav unit tests' season assertions from `?season=` to the path form).

- [ ] **Step 4: Commit**

```bash
git add src/utils/season-path.ts src/components/layout/PrimaryNav.tsx src/components/layout/MobileNav.tsx src/components/layout/NavLink.tsx tests/unit/primary-nav.test.tsx tests/unit/mobile-nav.test.tsx tests/unit/nav-link.test.tsx
git commit -m "feat(seasons): nav carries the viewed season in the path, not ?season="
```

---

### Task 11: Sitemap — the season-section URLs

**Files:**

- Modify: `src/app/sitemap.ts`
- Modify: `tests/unit/sitemap.test.ts`

- [ ] **Step 1: Extend the sitemap test**

```ts
// in tests/unit/sitemap.test.ts, inside the "sitemap" describe
it("lists each historical season's section indexes and excludes the current season's", async () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://pitchiq-pl.vercel.app");
  const urls = (await sitemap()).map((e) => e.url);
  expect(urls).toContain("https://pitchiq-pl.vercel.app/seasons/2003/teams");
  expect(urls).toContain("https://pitchiq-pl.vercel.app/seasons/2010/players");
  // Current season lives at the bare /teams; its path form redirects.
  expect(urls).not.toContain("https://pitchiq-pl.vercel.app/seasons/2025/teams");
  // The bare section index stays listed once.
  expect(urls).toContain("https://pitchiq-pl.vercel.app/teams");
});
```

> The M71a sitemap test mocks `getAvailableSeasons` — ensure its mock returns a set
> including 2003 and 2010 and the current 2025 (adjust the existing mock if needed).

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run tests/unit/sitemap.test.ts`
Expected: FAIL on the `/seasons/2003/teams` assertion.

- [ ] **Step 3: Add the section routes** to `sitemap.ts`. After the existing `seasonRoutes` block, add — importing `SECTION_SLUGS`:

```ts
// TASK-M71b — each historical season's five section indexes. Current season
// excluded (it lives at the bare /<section>, and /seasons/<current>/<section>
// redirects). ~33 × 5 = 165 URLs, each with its /ar alternate.
const seasonSectionRoutes: MetadataRoute.Sitemap = (await getAvailableSeasons())
  .filter((s) => s !== season)
  .flatMap((s) =>
    SECTION_SLUGS.map((sec) => ({
      url: `${base}/seasons/${s}/${sec}`,
      alternates: langs(`/seasons/${s}/${sec}`),
      changeFrequency: "yearly" as const,
      priority: 0.4,
    })),
  );
```

Include `...seasonSectionRoutes` in the returned array. (`season`, `base`, `langs`, `getAvailableSeasons` are already in scope from M71a.)

- [ ] **Step 4: Run it and confirm it passes**

Run: `node_modules/.bin/vitest run tests/unit/sitemap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/sitemap.ts tests/unit/sitemap.test.ts
git commit -m "feat(seasons): list the historical season-section indexes in the sitemap"
```

---

### Task 12: E2E — the section path model

**Files:**

- Modify: `tests/e2e/season-nav.spec.ts` (rewrite to the path model)
- Modify: `tests/e2e/seasons.spec.ts` (add section coverage)

- [ ] **Step 1: Rewrite `season-nav.spec.ts`.** It currently asserts nav carries `?season=` across sections. Under the path model, from `/seasons/2003/teams` the nav must carry the PATH:

```ts
import { expect, test } from "@playwright/test";

test.describe("Season carried across nav (path model, TASK-M71b)", () => {
  test("a section index carries the season in the path across nav", async ({ page }) => {
    await page.goto("/seasons/2003/teams");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Players", exact: true }).click();
    await expect(page).toHaveURL(/\/seasons\/2003\/players$/);
  });

  test("the current season keeps bare section URLs", async ({ page }) => {
    await page.goto("/teams");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Players", exact: true }).click();
    await expect(page).toHaveURL(/\/players$/);
  });
});
```

> Confirm the exact accessible nav name + link labels against the current `PrimaryNav`
> (the M71a `season-nav.spec.ts` had them — reuse). If "Players" is in the "More" dropdown
> rather than a primary pill, mirror the dropdown interaction from the old spec.

- [ ] **Step 2: Add section coverage to `seasons.spec.ts`**

```ts
test("a historical season-section page renders and redirects the current season's", async ({
  page,
}) => {
  await page.goto("/seasons/2003/teams");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Current season's nested form redirects to the bare index.
  await page.goto("/seasons/2025/teams");
  await expect(page).toHaveURL(/\/teams$/);
  // Legacy ?season= redirects to the path form.
  await page.goto("/players?season=2010");
  await expect(page).toHaveURL(/\/seasons\/2010\/players(\?season=2010)?$/);
});

test("/ar renders a season-section page RTL", async ({ page }) => {
  await page.goto("/ar/seasons/2003/managers");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
```

- [ ] **Step 3: Run against a production build** (serial; parallel runs are unreliable on this machine)

Build + `next start` on a spare port, then:
Run: `PLAYWRIGHT_BASE_URL=http://localhost:<port> node_modules/.bin/playwright test tests/e2e/season-nav.spec.ts tests/e2e/seasons.spec.ts tests/e2e/not-found.spec.ts --workers=1 --reporter=line`
Expected: green. (`not-found.spec.ts` guards M72 — `/seasons/1985/teams` and `/seasons/2003/nonsense` must 404.)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/season-nav.spec.ts tests/e2e/seasons.spec.ts
git commit -m "test(e2e): section indexes carry the season in the path"
```

---

### Task 13: Full verification before the PR

- [ ] **Step 1:** `node_modules/.bin/vitest run && node_modules/.bin/next lint --dir src --dir tests && node_modules/.bin/tsc --noEmit` — all green/clean.

- [ ] **Step 2: Production build — count emissions with Python** (never trust the route table; never pipe the build through `tail`).
      Expect: each bare `/{teams,players,fixtures,leaderboards,managers}.html` exists per locale; `seasons/<year>/<section>.html` = 165/locale (33 × 5); total build ≈ prior + ~340 new index pages.

- [ ] **Step 3: Serve + probe the cost fingerprint** on a spare port: `/teams`, `/seasons/2003/teams`, `/ar/seasons/2003/players` return `x-nextjs-prerender: 1` + a `public`/`s-maxage` cache-control (NOT `private, no-store`). `/seasons/2025/teams` → 308 → `/teams`. `/teams?season=2003` → 308 → `/seasons/2003/teams`. `/seasons/1985/teams` → 404.

- [ ] **Step 4: Full serial e2e** against the prod server: `PLAYWRIGHT_BASE_URL=… node_modules/.bin/playwright test --workers=1 --reporter=line` → 0 failed (lone environmental `load`-timeouts are CI's call — see [[pitchiq-m71c-entity-pages]]).

- [ ] **Step 5: Push + PR.** PR body: emitted-page counts (5 bare dynamic→static + 330 new nested/locale-pair), the redirect model, that the `?season=` switcher/nav behavior is deleted, and that `/ar` + redirects + 404s were verified. Watch checks, squash-merge on green.

---

### Task 14: Post-deploy (separate PR, only after production verified)

Doing this before production is verified makes `main` red (the guard probes production).

- [ ] **Step 1:** After merge + deploy (gate on `/api/health` reporting the merge sha), probe production twice: `/teams`, `/seasons/2003/teams`, `/ar/seasons/2003/players` → `x-vercel-cache: HIT` + `public`; `/seasons/2025/teams` → 308 → `/teams`; `/seasons/1985/teams` → 404.

- [ ] **Step 2:** Add to the enforced `check()` list in `.github/workflows/cache-guard.yml`:

```bash
          check "teams index"                  "/teams"
          check "a historical season-section"  "/seasons/2003/teams"
```

- [ ] **Step 3:** Flip the M71 board — M71b row → ✅ SHIPPED with the emitted counts + production results; and since M71b was the last sub-project, mark TASK-M71 itself ✅ Done (all of `/`, the seasons pages, every detail route, and every section index are now prerendered + CDN-served).

- [ ] **Step 4:** PR the guard + TASKS.md change, dispatch the guard on the branch as proof, watch, merge on green.

---

## Done when

- The five bare indexes are `force-static` and emit static pages; `/seasons/<year>/<section>` emits 165/locale (counted via Python, not the route table).
- `/teams`, `/seasons/2003/teams` + `/ar` twins return `x-vercel-cache: HIT` + `public` on production; `/seasons/2025/teams` → `/teams`; `/teams?season=2003` → `/seasons/2003/teams`; `/seasons/1985/teams` → 404.
- The switcher + nav carry the season in the path everywhere; the `?season=` switcher branch and the nav `withSeason` usage are gone.
- The sitemap lists the historical season-sections and excludes the current season's path form.
- Unit + lint + tsc + the full E2E suite are green on CI; the cache guard enforces `/teams` + a season-section.
- After this lands, no route reads the server `searchParams` prop except `/compare`.

## Follow-ups (not this plan)

- The index→detail crossing is accepted (owner decision): clicking an entity on `/seasons/2003/teams` links to `/teams/42?season=2003` (M71c deep-link). A future ticket could evaluate `/seasons/<year>/<section>/<id>` detail nesting for full path consistency — a large, separate re-architecture.
