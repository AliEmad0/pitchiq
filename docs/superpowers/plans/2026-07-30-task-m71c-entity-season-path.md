# TASK-M71c — Prerender /teams/[id] + /managers/[id]: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/teams/[id]` and `/managers/[id]` stop reading the server `searchParams` prop, prerender for every entity (CDN-served, `x-vercel-cache: HIT`), and swap historical seasons client-side — the exact pattern `/players/[id]` shipped in PR #59.

**Architecture:** Each page renders its entity's _initial_ season (current if played, else its latest) as RSC and passes it into a client `<TeamSeasonView>` / `<ManagerSeasonView>` that holds the season state, honours `?season=` deep links via `window.location` (never `useSearchParams` — it bails prerender), syncs with `history.pushState`, and fetches season swaps from two new JSON endpoints. Canonicals collapse to the season-less URL (the `/players/[id]` precedent, PR #59 — flagged in the ticket as "confirm intended": we follow the shipped precedent).

**Tech Stack:** Next 15 App Router (force-static + ISR), next-intl (locale via explicit `?locale=` on API routes), existing presentational components (`TeamHero`, `TeamStatsTiles`, `RecentFormStrip`, `SquadGrid`, `ManagerSection`, `ManagerHero`, `ManagerHonours`, `ManagerCareerTable`), `PlayerSeasonSelect` reused as the season control.

**Read before starting:**

- `TASK-M71` in `TASKS.md` — the root cause ("force-static does NOT override a server `searchParams` read") and the three watch-outs.
- `src/features/players/components/PlayerSeasonView.tsx` — the pattern being ported, comment by comment.
- `src/app/api/players/[id]/profile/route.ts` — the Route Handler template (explicit `?locale=`, `Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800`).
- ⚠️ TASK-M72 rule: **never add a `loading.tsx`** — a boundary above a `notFound()`-throwing segment turns every unknown URL into a soft 404. Skeletons only via per-page `<Suspense>` below the existence check.
- ⚠️ Verify UI via rendered-text/`data-*` assertions, never by grepping HTML — next-intl serialises the whole catalog into every page.

**File structure (whole change):**

```
Modify: src/features/teams/api.ts                    (getTeam/getSquad take locale)
Modify: src/features/teams/managers.api.ts           (getTeamManagers takes locale)
Modify: src/features/managers/manager-profile.api.ts (getManagerProfile takes locale)
Create: src/app/api/teams/[id]/season-view/route.ts
Create: src/app/api/managers/[id]/profile/route.ts
Create: src/features/teams/season-url.ts
Create: src/features/managers/season-url.ts
Create: src/features/teams/components/TeamSeasonView.tsx
Create: src/features/managers/components/ManagerSeasonView.tsx
Modify: src/app/[locale]/teams/[id]/page.tsx
Modify: src/app/[locale]/managers/[id]/page.tsx
Delete: src/components/layout/EntitySeasonSwitcher.tsx (+ its unit test)
Tests:  tests/unit/api-teams-season-view-route.test.ts
        tests/unit/api-managers-profile-route.test.ts
        tests/unit/team-season-view.test.tsx
        tests/unit/manager-season-view.test.tsx
Modify: tests/e2e/teams.spec.ts, tests/e2e/managers.spec.ts
```

---

### Task 1: Thread `locale` through the entity fetchers

The new Route Handlers have no `[locale]` segment, so `getEntityNames()`'s
`getLocale()` fallback returns English there. Every fetcher the routes call
must accept an explicit locale and pass it down — exactly what
`getPlayerProfile(id, season, locale)` already does.

**Files:**

- Modify: `src/features/teams/api.ts` (`getTeam`, `getSquad`)
- Modify: `src/features/teams/managers.api.ts` (`getTeamManagers`)
- Modify: `src/features/managers/manager-profile.api.ts` (`getManagerProfile`)
- Test: extend `tests/unit/data-loaders.test.ts`-adjacent fetcher tests — find them with `grep -rln "getTeam\b" tests/unit/` and add the locale-pass-through case to the existing team-api test file.

- [ ] **Step 1: Write the failing test** (in the existing team fetcher test file; if none tests `getTeam` directly, create `tests/unit/teams-api-locale.test.ts`)

```ts
// tests/unit/teams-api-locale.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/i18n/entity-names", () => ({
  getEntityNames: vi.fn(async () => ({
    team: (_id: number, fallback: string) => `AR:${fallback}`,
    player: (_id: number, fallback: string) => `AR:${fallback}`,
    manager: (_id: string, fallback: string) => `AR:${fallback}`,
    venue: (fallback: string) => fallback,
    city: (fallback: string) => fallback,
    referee: (fallback: string) => fallback,
    position: (fallback: string) => fallback,
    nationality: (fallback: string) => fallback,
  })),
}));

import { getEntityNames } from "@/features/i18n/entity-names";
import { getTeam } from "@/features/teams/api";

describe("entity fetchers thread the explicit locale", () => {
  it("getTeam passes the locale override to getEntityNames", async () => {
    await getTeam(42, 2024, "ar");
    expect(vi.mocked(getEntityNames)).toHaveBeenCalledWith("ar");
  });
});
```

> The `EntityNames` mock shape above must match `src/features/i18n/entity-names.ts` —
> check its exported type first and adjust the stub's members to the real interface.

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run tests/unit/teams-api-locale.test.ts`
Expected: FAIL — `getTeam` has no third parameter; `getEntityNames` called with no args.

- [ ] **Step 3: Add the parameter to all four fetchers**

In `src/features/teams/api.ts` (same shape for `getSquad`):

```ts
export async function getTeam(
  id: number,
  season: number = currentDataSeason(),
  locale?: string,
): Promise<TeamDetail | null> {
  // ...unchanged body...
  return toTeamDetail(
    team,
    season,
    clubLogos,
    clubMeta?.[String(team.id)],
    await getEntityNames(locale),
  );
}
```

`getSquad(id, season, locale?)` → `getEntityNames(locale)`.
`getTeamManagers(season, teamId, locale?)` → thread to its `getEntityNames()` call (read the function first; if it never localizes names, leave it and note that in the commit message instead).
`getManagerProfile(id, season?, locale?)` → `getEntityNames(locale)`.

RSC callers pass nothing — behavior unchanged on pages.

- [ ] **Step 4: Run the test + the full unit suite**

Run: `node_modules/.bin/vitest run`
Expected: new test PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/features/teams/api.ts src/features/teams/managers.api.ts src/features/managers/manager-profile.api.ts tests/unit/teams-api-locale.test.ts
git commit -m "refactor(i18n): entity fetchers accept an explicit locale for Route Handlers"
```

---

### Task 2: `/api/teams/[id]/season-view` — the consolidated swap endpoint

One round trip returns everything the team page's season subtree needs.
Trivia stays on the existing `/api/trivia?scope=team` route (the players
precedent — two fetches).

**Files:**

- Create: `src/app/api/teams/[id]/season-view/route.ts`
- Test: `tests/unit/api-teams-season-view-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/api-teams-season-view-route.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/teams/api", () => ({
  getTeam: vi.fn(async () => ({ team: { id: 42, name: "Arsenal" }, venue: {} })),
  getSquad: vi.fn(async () => [{ id: 1, name: "P" }]),
  getTeamStats: vi.fn(async () => ({ goals: {} })),
}));
vi.mock("@/features/teams/managers.api", () => ({
  getTeamManagers: vi.fn(async () => []),
}));
vi.mock("@/features/teams/fixtures.api", () => ({
  getTeamRecentFixtures: vi.fn(async () => []),
}));
vi.mock("@/features/leagues/api", () => ({
  getStandings: vi.fn(async () => ({
    league: { standings: [[{ rank: 2, team: { id: 42 } }]] },
  })),
}));

import { getTeam } from "@/features/teams/api";
import { GET } from "@/app/api/teams/[id]/season-view/route";

const req = (url: string) => new Request(url);
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/teams/[id]/season-view", () => {
  it("returns the consolidated season payload with the standings rank", async () => {
    const res = await GET(
      req("http://x/api/teams/42/season-view?season=2003&locale=ar"),
      params("42"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.detail.team.id).toBe(42);
    expect(body.rank).toBe(2);
    expect(Array.isArray(body.squad)).toBe(true);
    expect(vi.mocked(getTeam)).toHaveBeenCalledWith(42, 2003, "ar");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=86400");
  });

  it("404s when the team has no data for the season", async () => {
    vi.mocked(getTeam).mockResolvedValueOnce(null);
    const res = await GET(req("http://x/api/teams/42/season-view?season=1993"), params("42"));
    expect(res.status).toBe(404);
  });

  it("400s a non-integer id", async () => {
    const res = await GET(req("http://x/api/teams/abc/season-view"), params("abc"));
    expect(res.status).toBe(400);
  });
});
```

> Adjust the `getTeamRecentFixtures` mock's module path if it lives elsewhere —
> confirm with `grep -rn "getTeamRecentFixtures" src/features/teams/`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run tests/unit/api-teams-season-view-route.test.ts`
Expected: FAIL — cannot resolve the route module.

- [ ] **Step 3: Implement the route** (model: `src/app/api/players/[id]/profile/route.ts`)

```ts
// src/app/api/teams/[id]/season-view/route.ts
import { NextResponse } from "next/server";

import { getStandings } from "@/features/leagues/api";
import { getSquad, getTeam, getTeamStats } from "@/features/teams/api";
import { getTeamRecentFixtures } from "@/features/teams/fixtures.api";
import { getTeamManagers } from "@/features/teams/managers.api";
import { currentDataSeason, parseSeason } from "@/utils/season";
import { logger } from "@/utils/logger";

// TASK-M71c — everything the /teams/[id] season subtree needs, in one round
// trip, for the client-side season swap (<TeamSeasonView>). The page renders
// the initial season server-side; other seasons load here. Route Handlers
// have no [locale] segment, so the client sends `?locale=` explicitly.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || !Number.isInteger(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const season = parseSeason(searchParams.get("season") ?? undefined, currentDataSeason());
  const locale = searchParams.get("locale") ?? undefined;

  const [detail, standings, managers, stats, fixtures, squad] = await Promise.all([
    getTeam(id, season, locale),
    getStandings({ season }),
    getTeamManagers(season, id, locale),
    getTeamStats(season, id),
    getTeamRecentFixtures(season, id),
    getSquad(id, season, locale),
  ]);

  if (!detail) {
    logger.info("team-season-view.route.not_found", { id, season });
    return NextResponse.json({ error: "team_not_found" }, { status: 404 });
  }

  const rank = standings?.league.standings[0]?.find((row) => row.team.id === id)?.rank ?? null;

  return NextResponse.json(
    { detail, rank, managers, stats, fixtures: fixtures ?? [], squad },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
```

> If `getTeamManagers`'s real signature ended up without a locale param in
> Task 1, drop the third argument here to match.

- [ ] **Step 4: Run it and confirm it passes**

Run: `node_modules/.bin/vitest run tests/unit/api-teams-season-view-route.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/teams/[id]/season-view/route.ts" tests/unit/api-teams-season-view-route.test.ts
git commit -m "feat(teams): consolidated season-view endpoint for the client season swap"
```

---

### Task 3: `/api/managers/[id]/profile` endpoint

**Files:**

- Create: `src/app/api/managers/[id]/profile/route.ts`
- Test: `tests/unit/api-managers-profile-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/api-managers-profile-route.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/managers/manager-profile.api", () => ({
  getManagerProfile: vi.fn(async () => ({
    id: "arsene-wenger",
    name: "Arsène Wenger",
    seasons: [2003],
  })),
}));

import { getManagerProfile } from "@/features/managers/manager-profile.api";
import { GET } from "@/app/api/managers/[id]/profile/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/managers/[id]/profile", () => {
  it("returns the profile for the requested season + locale", async () => {
    const res = await GET(
      new Request("http://x/api/managers/arsene-wenger/profile?season=2003&locale=ar"),
      params("arsene-wenger"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).profile.name).toBe("Arsène Wenger");
    expect(vi.mocked(getManagerProfile)).toHaveBeenCalledWith("arsene-wenger", 2003, "ar");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=86400");
  });

  it("404s an unknown manager", async () => {
    vi.mocked(getManagerProfile).mockResolvedValueOnce(null);
    const res = await GET(new Request("http://x/api/managers/nobody/profile"), params("nobody"));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run tests/unit/api-managers-profile-route.test.ts`
Expected: FAIL — cannot resolve the route module.

- [ ] **Step 3: Implement**

```ts
// src/app/api/managers/[id]/profile/route.ts
import { NextResponse } from "next/server";

import { getManagerProfile } from "@/features/managers/manager-profile.api";
import { currentDataSeason, parseSeason } from "@/utils/season";
import { logger } from "@/utils/logger";

// TASK-M71c — season-scoped manager profile for the client season swap on
// /managers/[id] (the page renders the initial season server-side).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const season = parseSeason(searchParams.get("season") ?? undefined, currentDataSeason());
  const locale = searchParams.get("locale") ?? undefined;

  const profile = await getManagerProfile(id, season, locale);
  if (!profile) {
    logger.info("manager-profile.route.not_found", { id, season });
    return NextResponse.json({ error: "manager_not_found" }, { status: 404 });
  }

  return NextResponse.json(
    { profile },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node_modules/.bin/vitest run tests/unit/api-managers-profile-route.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/managers/[id]/profile/route.ts" tests/unit/api-managers-profile-route.test.ts
git commit -m "feat(managers): season-scoped profile endpoint for the client season swap"
```

---

### Task 4: URL helpers

**Files:**

- Create: `src/features/teams/season-url.ts`
- Create: `src/features/managers/season-url.ts`
- Test: `tests/unit/entity-season-urls.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/entity-season-urls.test.ts
import { describe, expect, it } from "vitest";

import { managerProfileUrl } from "@/features/managers/season-url";
import { teamSeasonViewUrl, teamTriviaUrl } from "@/features/teams/season-url";

describe("entity season-swap URLs", () => {
  it("builds the team season-view url with season + locale", () => {
    expect(teamSeasonViewUrl(42, 2003, "ar")).toBe(
      "/api/teams/42/season-view?season=2003&locale=ar",
    );
    expect(teamSeasonViewUrl(42, 2003)).toBe("/api/teams/42/season-view?season=2003");
  });
  it("builds the team trivia url", () => {
    expect(teamTriviaUrl(42, 2003)).toBe("/api/trivia?scope=team&id=42&season=2003");
  });
  it("builds the manager profile url", () => {
    expect(managerProfileUrl("arsene-wenger", 2003, "ar")).toBe(
      "/api/managers/arsene-wenger/profile?season=2003&locale=ar",
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run tests/unit/entity-season-urls.test.ts`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement** (mirror `src/features/players/season-url.ts` — read it first and copy its exact query-building style)

```ts
// src/features/teams/season-url.ts
export function teamSeasonViewUrl(id: number, season: number, locale?: string): string {
  const qs = new URLSearchParams({ season: String(season) });
  if (locale) qs.set("locale", locale);
  return `/api/teams/${id}/season-view?${qs}`;
}

export function teamTriviaUrl(id: number, season: number): string {
  return `/api/trivia?scope=team&id=${id}&season=${season}`;
}
```

```ts
// src/features/managers/season-url.ts
export function managerProfileUrl(id: string, season: number, locale?: string): string {
  const qs = new URLSearchParams({ season: String(season) });
  if (locale) qs.set("locale", locale);
  return `/api/managers/${encodeURIComponent(id)}/profile?${qs}`;
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node_modules/.bin/vitest run tests/unit/entity-season-urls.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/teams/season-url.ts src/features/managers/season-url.ts tests/unit/entity-season-urls.test.ts
git commit -m "feat(seasons): url helpers for the entity season swaps"
```

---

### Task 5: `<TeamSeasonView>` client component

A direct port of `PlayerSeasonView.tsx` — read that file side by side; every
comment there applies. Slots: `hero` (server-rendered initial season),
`children` (the four server section blocks for the initial season).

**Files:**

- Create: `src/features/teams/components/TeamSeasonView.tsx`
- Test: `tests/unit/team-season-view.test.tsx`

- [ ] **Step 1: Write the failing test** (mirror the existing PlayerSeasonView unit test — find it with `grep -rln "PlayerSeasonView" tests/unit/` and copy its mount/deep-link structure; if none exists, use this)

```tsx
// tests/unit/team-season-view.test.tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithIntl } from "./_helpers/intl";

import { TeamSeasonView } from "@/features/teams/components/TeamSeasonView";

afterEach(() => cleanup());

describe("TeamSeasonView", () => {
  it("renders the server-provided hero + children for the initial season", () => {
    renderWithIntl(
      <TeamSeasonView
        teamId={42}
        seasons={[2025, 2024]}
        initialSeason={2025}
        teamName="Arsenal"
        hero={<div data-testid="hero" />}
      >
        <div data-testid="subtree" />
      </TeamSeasonView>,
    );
    expect(screen.getByTestId("hero")).toBeInTheDocument();
    expect(screen.getByTestId("subtree")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run tests/unit/team-season-view.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```tsx
// src/features/teams/components/TeamSeasonView.tsx
"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";

import { DataUnavailable } from "@/components/DataUnavailable";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerSeasonSelect } from "@/features/players/components/PlayerSeasonSelect";
import type { TeamDetail, TeamStats, SquadPlayer } from "@/features/teams/api";
import type { ManagerProfile } from "@/features/teams/managers.api";
import { ManagerSection } from "@/features/teams/components/ManagerSection";
import { RecentFormStrip } from "@/features/teams/components/RecentFormStrip";
import { SquadGrid } from "@/features/teams/components/SquadGrid";
import { TeamHero } from "@/features/teams/components/TeamHero";
import { TeamStatsTiles } from "@/features/teams/components/TeamStatsTiles";
import { teamSeasonViewUrl, teamTriviaUrl } from "@/features/teams/season-url";
import { TriviaCard } from "@/features/trivia/components/TriviaCard";
import type { TriviaFact } from "@/features/trivia/types";
import { formatSeasonLabel } from "@/utils/season";

// Client season swap for /teams/[id] — the PlayerSeasonView pattern (read that
// file's comments; they all apply). The INITIAL season's content is
// server-rendered and passed in as `hero` + `children` (RSC, not re-executed on
// the client), which keeps the page statically prerenderable. Only a different
// season (picker or ?season= deep link) fetches client-side and swaps.
// Season syncs via window.location + history.pushState — NEVER useSearchParams.
type SwapPayload = {
  detail: TeamDetail;
  rank: number | null;
  managers: ManagerProfile[];
  stats: TeamStats | null;
  fixtures: Parameters<typeof RecentFormStrip>[0]["fixtures"];
  squad: SquadPlayer[] | null;
};

export function TeamSeasonView({
  teamId,
  seasons,
  initialSeason,
  teamName,
  hero,
  children,
}: {
  teamId: number;
  seasons: number[];
  initialSeason: number;
  teamName: string;
  hero: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("teams");
  const locale = useLocale();

  const [season, setSeason] = useState(initialSeason);
  const [swapped, setSwapped] = useState<{ view: SwapPayload | null; facts: TriviaFact[] } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("season");
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isInteger(parsed) && parsed !== initialSeason) setSeason(parsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (season === initialSeason) {
      setSwapped(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const [vRes, tRes] = await Promise.all([
        fetch(teamSeasonViewUrl(teamId, season, locale)),
        fetch(teamTriviaUrl(teamId, season)),
      ]);
      if (cancelled) return;
      const view = vRes.ok ? ((await vRes.json()) as SwapPayload) : null;
      const facts = tRes.ok ? ((await tRes.json()).facts as TriviaFact[]) : [];
      if (cancelled) return;
      setSwapped({ view, facts });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [season, initialSeason, teamId, locale]);

  function changeSeason(next: number) {
    setSeason(next);
    const path = window.location.pathname;
    window.history.pushState(null, "", next === initialSeason ? path : `${path}?season=${next}`);
  }

  const swapping = season !== initialSeason;
  const view = swapped?.view ?? null;

  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <PlayerSeasonSelect seasons={seasons} value={season} onChange={changeSeason} />

      {!swapping ? (
        <>
          {hero}
          {children}
        </>
      ) : loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : view ? (
        <>
          <TeamHero team={view.detail.team} venue={view.detail.venue} rank={view.rank} />
          <ManagerSection managers={view.managers} season={season} />
          {view.stats ? (
            <TeamStatsTiles stats={view.stats} />
          ) : (
            <p className="text-muted-foreground text-sm">{t("statsUnavailable")}</p>
          )}
          <RecentFormStrip fixtures={view.fixtures} teamId={teamId} />
          {view.squad && view.squad.length > 0 ? (
            <SquadGrid players={view.squad} season={season} />
          ) : (
            <DataUnavailable
              title={t("squadUnavailable")}
              message={t("squadUnavailableMsg", { season: formatSeasonLabel(season, locale) })}
            />
          )}
          {swapped && swapped.facts.length > 0 && <TriviaCard facts={swapped.facts} />}
        </>
      ) : (
        <DataUnavailable
          title={t("noSeasonData", { season: formatSeasonLabel(season, locale), name: teamName })}
          message={t("noSeasonDataMsg", {
            name: teamName,
            season: formatSeasonLabel(season, locale),
            latest: formatSeasonLabel(seasons[0], locale),
          })}
          cta={{
            href: `/teams/${teamId}?season=${seasons[0]}`,
            label: t("viewSeasonStats", { season: formatSeasonLabel(seasons[0], locale) }),
          }}
        />
      )}
    </main>
  );
}
```

> Three things to verify while implementing, not assume:
>
> 1. The exact `teams.*` i18n keys — `noSeasonData`/`noSeasonDataMsg`/`viewSeasonStats`
>    may not exist for teams (they're `players.*` keys). Add the team variants to
>    BOTH `en.json` and `ar.json` (i18n-catalog-parity enforces parity), or reuse
>    a generic key if one exists. Grep `"statsUnavailable"` to find the teams block.
> 2. `PlayerSeasonSelect`'s props and aria-label — if its label copy is
>    player-specific, give it an optional `label` prop rather than cloning it.
> 3. `RecentFormStrip`'s `fixtures` element type — import the real type instead
>    of the `Parameters<...>` trick if it's exported.

- [ ] **Step 4: Run the test + guards**

Run: `node_modules/.bin/vitest run tests/unit/team-season-view.test.tsx tests/unit/no-hardcoded-strings.test.ts tests/unit/i18n-catalog-parity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/teams/components/TeamSeasonView.tsx tests/unit/team-season-view.test.tsx src/i18n/messages/en.json src/i18n/messages/ar.json
git commit -m "feat(teams): client season swap component (PlayerSeasonView pattern)"
```

---

### Task 6: Rewire `/teams/[id]/page.tsx` — drop `searchParams`, force-static

**Files:**

- Modify: `src/app/[locale]/teams/[id]/page.tsx`

- [ ] **Step 1: Rewrite the page**

```tsx
// src/app/[locale]/teams/[id]/page.tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { teamOgImagePath } from "@/app/api/og/team-card";
import { findTeamSeasons, getAvailableSeasons, loadTeams } from "@/data/loaders";
import { getStandings } from "@/features/leagues/api";
import { ManagerSectionLoader } from "@/features/teams/components/ManagerSectionLoader";
import { RecentFormSection } from "@/features/teams/components/RecentFormSection";
import { RecentFormStripSkeleton } from "@/features/teams/components/RecentFormStrip";
import { SquadGridSkeleton } from "@/features/teams/components/SquadGrid";
import { SquadSection } from "@/features/teams/components/SquadSection";
import { TeamHero } from "@/features/teams/components/TeamHero";
import { TeamSeasonView } from "@/features/teams/components/TeamSeasonView";
import { TeamStatsSection } from "@/features/teams/components/TeamStatsSection";
import { TeamStatsTilesSkeleton } from "@/features/teams/components/TeamStatsTiles";
import { getTeam } from "@/features/teams/api";
import { TriviaSection } from "@/features/trivia/components/TriviaSection";
import { currentDataSeason } from "@/utils/season";
import { canonicalPath } from "@/utils/canonical";

type Props = { params: Promise<{ locale: string; id: string }> };

// ⚠️ HOSTING COST — force-static is load-bearing. This route must NEVER read
// the server `searchParams` prop again: that opts it into dynamic rendering,
// force-static does NOT override it, and the route then emits ZERO prerendered
// pages while the build table still prints "● (SSG)" (the 2026-07 Active-CPU
// pause). Season switching is client-side in <TeamSeasonView>; ?season= deep
// links are honoured on the client. See docs/hosting-cost.md.
export const dynamic = "force-static";
export const revalidate = 86400;
export const dynamicParams = true;

// Every club that ever appeared in a committed season gets a prerendered page
// (the union across seasons — historical clubs included, ~50 ids), not just
// the current 20. New ids in future data refreshes render on demand.
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const seasons = await getAvailableSeasons();
  const ids = new Set<number>();
  for (const season of seasons) for (const t of (await loadTeams(season)) ?? []) ids.add(t.id);
  return [...ids].map((id) => ({ id: String(id) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const teamId = Number(id);
  const tNotFound = await getTranslations("notFound");
  if (!Number.isInteger(teamId)) return { title: tNotFound("teamTitle") };

  const teamSeasons = await findTeamSeasons(teamId);
  if (teamSeasons.length === 0) return { title: tNotFound("teamTitle") };
  const initialSeason = teamSeasons.includes(currentDataSeason())
    ? currentDataSeason()
    : teamSeasons[0];
  const detail = await getTeam(teamId, initialSeason);
  if (!detail) return { title: tNotFound("teamTitle") };

  const url = teamOgImagePath(teamId, initialSeason);
  const t = await getTranslations("teams");
  return {
    title: detail.team.name,
    // Season-less canonical: one indexable URL per club (the /players/[id]
    // precedent, PR #59). ?season= variants are robots-blocked anyway.
    alternates: { canonical: canonicalPath(locale, `/teams/${teamId}`) },
    openGraph: {
      images: [{ url, width: 1200, height: 630, alt: t("teamOgAlt", { name: detail.team.name }) }],
    },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function TeamProfilePage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const teamId = Number(id);
  if (!Number.isInteger(teamId)) notFound();

  // Existence first (cheap registry read) — decided before anything streams,
  // so unknown ids are REAL 404s (TASK-M72). A historical-only club renders
  // its latest played season instead of 404ing at its bare URL.
  const teamSeasons = await findTeamSeasons(teamId);
  if (teamSeasons.length === 0) notFound();
  const initialSeason = teamSeasons.includes(currentDataSeason())
    ? currentDataSeason()
    : teamSeasons[0];

  const [detail, standings] = await Promise.all([
    getTeam(teamId, initialSeason),
    getStandings({ season: initialSeason }),
  ]);
  if (!detail) notFound();

  const rank = standings?.league.standings[0]?.find((row) => row.team.id === teamId)?.rank ?? null;

  return (
    <TeamSeasonView
      teamId={teamId}
      seasons={teamSeasons}
      initialSeason={initialSeason}
      teamName={detail.team.name}
      hero={<TeamHero team={detail.team} venue={detail.venue} rank={rank} />}
    >
      <Suspense fallback={null}>
        <ManagerSectionLoader teamId={teamId} season={initialSeason} />
      </Suspense>
      <Suspense fallback={<TeamStatsTilesSkeleton />}>
        <TeamStatsSection teamId={teamId} season={initialSeason} />
      </Suspense>
      <Suspense fallback={<RecentFormStripSkeleton />}>
        <RecentFormSection teamId={teamId} season={initialSeason} />
      </Suspense>
      <Suspense fallback={<SquadGridSkeleton />}>
        <SquadSection teamId={teamId} season={initialSeason} />
      </Suspense>
      <Suspense fallback={null}>
        <TriviaSection scope="team" id={teamId} season={initialSeason} />
      </Suspense>
    </TeamSeasonView>
  );
}
```

> Verify while implementing: `findTeamSeasons`'s return contract (`number[]`,
> newest-first? — read it in `src/data/loaders.ts`; if it can return null,
> guard with `?? []`). The old page rendered `<main className="container-page ...">`
> itself — that wrapper now lives inside `<TeamSeasonView>`; make sure it isn't
> doubled. `<EntitySeasonSwitcher>` is gone from this page (deleted in Task 9).

- [ ] **Step 2: Typecheck + affected unit tests**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/vitest run`
Expected: clean, green (team page unit tests may need their fixture updated if they render the page — check `grep -rln "TeamProfilePage" tests/`).

- [ ] **Step 3: Build and verify pages EMIT** (the route table lies — count files)

Run: `node_modules/.bin/next build` then `ls .next/server/app/en/teams/*.html | wc -l`
Expected: ≥ 40 (union of all clubs across 34 seasons), not 0, not 20. Also `ls .next/server/app/ar/teams/*.html | wc -l` equal.

- [ ] **Step 4: Serve + spot-check**

Start (Task 11 has the script), then:

```bash
curl -s -o /dev/null -D - http://localhost:3144/teams/42 | grep -iE "^HTTP|cache-control"
```

Expected: 200 with `cache-control` NOT `private, no-store` (i.e. `s-maxage=86400`-style — the static path).

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/teams/[id]/page.tsx"
git commit -m "feat(teams): /teams/[id] prerenders — season switching moves client-side"
```

---

### Task 7: `<ManagerSeasonView>` client component

**Files:**

- Create: `src/features/managers/components/ManagerSeasonView.tsx`
- Test: `tests/unit/manager-season-view.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/manager-season-view.test.tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithIntl } from "./_helpers/intl";

import { ManagerSeasonView } from "@/features/managers/components/ManagerSeasonView";

afterEach(() => cleanup());

describe("ManagerSeasonView", () => {
  it("renders the server-provided children for the initial season", () => {
    renderWithIntl(
      <ManagerSeasonView
        managerId="arsene-wenger"
        seasons={[2003, 2002]}
        initialSeason={2003}
        managerName="Arsène Wenger"
      >
        <div data-testid="subtree" />
      </ManagerSeasonView>,
    );
    expect(screen.getByTestId("subtree")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node_modules/.bin/vitest run tests/unit/manager-season-view.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement** (same skeleton as `TeamSeasonView`; the whole season
      subtree — hero, honours, career table — swaps as one block since it all comes
      from one `ManagerProfile`)

```tsx
// src/features/managers/components/ManagerSeasonView.tsx
"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";

import { DataUnavailable } from "@/components/DataUnavailable";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerSeasonSelect } from "@/features/players/components/PlayerSeasonSelect";
import { ManagerCareerTable } from "@/features/managers/components/ManagerCareerTable";
import { ManagerHero } from "@/features/managers/components/ManagerHero";
import { ManagerHonours } from "@/features/managers/components/ManagerHonours";
import type { ManagerProfile } from "@/features/managers/manager-profile.api";
import { managerProfileUrl } from "@/features/managers/season-url";
import { formatSeasonLabel } from "@/utils/season";

// Client season swap for /managers/[id] — PlayerSeasonView pattern; see
// TeamSeasonView for the port notes. The manager's whole season subtree comes
// from one ManagerProfile payload, so the swap is a single fetch + re-render.
export function ManagerSeasonView({
  managerId,
  seasons,
  initialSeason,
  managerName,
  children,
}: {
  managerId: string;
  seasons: number[];
  initialSeason: number;
  managerName: string;
  children: ReactNode;
}) {
  const t = useTranslations("managers");
  const locale = useLocale();

  const [season, setSeason] = useState(initialSeason);
  const [swapped, setSwapped] = useState<ManagerProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("season");
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isInteger(parsed) && parsed !== initialSeason) setSeason(parsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (season === initialSeason) {
      setSwapped(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const res = await fetch(managerProfileUrl(managerId, season, locale));
      if (cancelled) return;
      const profile = res.ok ? ((await res.json()).profile as ManagerProfile) : null;
      if (cancelled) return;
      setSwapped(profile);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [season, initialSeason, managerId, locale]);

  function changeSeason(next: number) {
    setSeason(next);
    const path = window.location.pathname;
    window.history.pushState(null, "", next === initialSeason ? path : `${path}?season=${next}`);
  }

  const swapping = season !== initialSeason;

  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <PlayerSeasonSelect seasons={seasons} value={season} onChange={changeSeason} />

      {!swapping ? (
        children
      ) : loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : swapped ? (
        <>
          <ManagerHero profile={swapped} />
          <ManagerHonours honours={swapped.honours} season={season} />
          <ManagerCareerTable
            byClub={swapped.byClub}
            season={season}
            highlightSeason={swapped.targetSeason?.season ?? null}
          />
        </>
      ) : (
        <DataUnavailable
          title={t("noSeasonData", {
            season: formatSeasonLabel(season, locale),
            name: managerName,
          })}
          message={t("noSeasonDataMsg", {
            name: managerName,
            season: formatSeasonLabel(season, locale),
            latest: formatSeasonLabel(seasons[0], locale),
          })}
        />
      )}
    </main>
  );
}
```

> Same i18n caveat as Task 5: the `managers.noSeasonData*` keys likely don't
> exist — add en + ar together. Check whether `ManagerHero`/`ManagerCareerTable`
> are server components with server-only imports; if any is RSC-only, it needs
> the client-safe split (they're presentational per the current page usage, so
> expect plain components — verify by reading their imports).

- [ ] **Step 4: Run it and confirm it passes**

Run: `node_modules/.bin/vitest run tests/unit/manager-season-view.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/managers/components/ManagerSeasonView.tsx tests/unit/manager-season-view.test.tsx src/i18n/messages/en.json src/i18n/messages/ar.json
git commit -m "feat(managers): client season swap component"
```

---

### Task 8: Rewire `/managers/[id]/page.tsx`

**Files:**

- Modify: `src/app/[locale]/managers/[id]/page.tsx`

- [ ] **Step 1: Rewrite the page** (keep `generateStaticParams` as-is — it already enumerates every committed manager)

```tsx
// src/app/[locale]/managers/[id]/page.tsx — replace the config, metadata and page body
export const dynamic = "force-static";
export const revalidate = 86400;
export const dynamicParams = true;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("managers");
  const profile = await getManagerProfile(id);
  if (!profile) return { title: t("profileTitleFallback") };
  const initialSeason = profile.seasons.includes(currentDataSeason())
    ? currentDataSeason()
    : (profile.seasons[0] ?? currentDataSeason());
  const url = managerOgImagePath(id, initialSeason);
  return {
    title: profile.name,
    // Season-less canonical (the /players precedent).
    alternates: { canonical: canonicalPath(locale, `/managers/${id}`) },
    description: t("metaDescriptionProfile", { name: profile.name }),
    openGraph: {
      images: [{ url, width: 1200, height: 630, alt: t("profileOgAlt", { name: profile.name }) }],
    },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function ManagerProfilePage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const profile = await getManagerProfile(id);
  if (!profile) notFound();
  const initialSeason = profile.seasons.includes(currentDataSeason())
    ? currentDataSeason()
    : (profile.seasons[0] ?? currentDataSeason());
  const initial = (await getManagerProfile(id, initialSeason)) ?? profile;

  return (
    <ManagerSeasonView
      managerId={id}
      seasons={profile.seasons}
      initialSeason={initialSeason}
      managerName={profile.name}
    >
      <ManagerHero profile={initial} />
      <ManagerHonours honours={initial.honours} season={initialSeason} />
      <ManagerCareerTable
        byClub={initial.byClub}
        season={initialSeason}
        highlightSeason={initial.targetSeason?.season ?? null}
      />
    </ManagerSeasonView>
  );
}
```

> Update the Props type: `searchParams` is REMOVED from it. Remove the
> `EntitySeasonSwitcher` import + the `seasons.length > 0 &&` line — the season
> control now lives in `<ManagerSeasonView>`. Keep (adapt) the hosting-cost
> comment: the route is now force-static because it no longer reads
> `searchParams`; leave a "never add searchParams back" warning matching
> /players/[id]'s.

- [ ] **Step 2: Typecheck + build + verify pages emit**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/next build`
Then: `ls .next/server/app/en/managers/*.html | wc -l`
Expected: > 0 (was 0 before this change). Note the count for the PR body.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/managers/[id]/page.tsx"
git commit -m "feat(managers): /managers/[id] prerenders — season switching moves client-side"
```

---

### Task 9: Delete `EntitySeasonSwitcher`

Both consumers are gone; a dead season control that writes `?season=` on
entity pages would resurrect the dynamic-rendering bug if ever re-adopted.

**Files:**

- Delete: `src/components/layout/EntitySeasonSwitcher.tsx`
- Delete: `tests/unit/entity-season-switcher.test.tsx`

- [ ] **Step 1: Confirm zero remaining imports**

Run: `grep -rn "EntitySeasonSwitcher" src/ tests/ --include="*.ts*" | grep -v entity-season-switcher.test`
Expected: no hits outside the two files being deleted (the header's
`HeaderSeasonSwitcher` hide-on-entity-routes regex stays — the pages still
have their own season control, just a different one).

- [ ] **Step 2: Delete + run the full unit suite**

```bash
git rm src/components/layout/EntitySeasonSwitcher.tsx tests/unit/entity-season-switcher.test.tsx
node_modules/.bin/vitest run
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(seasons): delete EntitySeasonSwitcher — both consumers moved to client season views"
```

---

### Task 10: E2E updates

**Files:**

- Modify: `tests/e2e/teams.spec.ts` (the season-interaction tests)
- Modify: `tests/e2e/managers.spec.ts`

- [ ] **Step 1: Read both specs end-to-end.** The tests that pick a season
      through the OLD Radix `EntitySeasonSwitcher` must now drive
      `PlayerSeasonSelect` instead — copy the interaction from the player specs that
      already do (`grep -n "SeasonSelect\|season" tests/e2e/players.spec.ts
tests/e2e/empty-states.spec.ts`). Assertions on `?season=` URLs after a pick
      still hold (pushState writes them). `teams.spec.ts:65` ("preserves a
      historical season when navigating from a squad to a player") should pass
      unchanged — squad links still carry `?season=` — but re-read it against the
      new flow.

- [ ] **Step 2: Add the two cost-guard e2e assertions**

```ts
// append to tests/e2e/teams.spec.ts
test("a ?season= deep link renders that season client-side (ar too)", async ({ page }) => {
  await page.goto("/ar/teams/42?season=2003");
  // The swap fetches /api/teams/42/season-view — wait for the season's content,
  // asserting on RENDERED text (never raw HTML greps).
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/season=2003/);
});
```

- [ ] **Step 3: Run the affected e2e serially against a production build**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:3144 node_modules/.bin/playwright test tests/e2e/teams.spec.ts tests/e2e/managers.spec.ts tests/e2e/not-found.spec.ts --workers=1 --reporter=line`
Expected: green. (`not-found.spec.ts` guards the M72 statuses — the new
existence checks must keep unknown ids at 404.)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/teams.spec.ts tests/e2e/managers.spec.ts
git commit -m "test(e2e): entity pages drive the client season select"
```

---

### Task 11: Full verification before the PR

- [ ] **Step 1: Full unit suite + lint + tsc**

Run: `node_modules/.bin/vitest run && node_modules/.bin/next lint --dir src --dir tests && node_modules/.bin/tsc --noEmit`
Expected: all green.

- [ ] **Step 2: Production build — count the emissions** (NEVER trust the route table's `● (SSG)`)

```bash
node_modules/.bin/next build > /tmp/m71c-build.log 2>&1; echo "exit: $?"
ls .next/server/app/en/teams/*.html | wc -l      # expect ~40-60
ls .next/server/app/en/managers/*.html | wc -l   # expect > 0 (was 0)
find .next/server/app -name "*.html" | wc -l     # expect ≈ 1909 + new teams/managers pages
```

⚠️ Never pipe the build through `tail` — a masked failure once left `.next`
with 8 of 1,909 pages and produced 43 phantom e2e failures.

- [ ] **Step 3: Serve + probe the cost fingerprint**

```bash
setsid nohup node_modules/.bin/next start -p 3144 > /tmp/m71c.log 2>&1 < /dev/null & disown
sleep 3
for p in /teams/42 /managers/$(ls .next/server/app/en/managers/*.html | head -1 | xargs basename | sed 's/.html//') /ar/teams/42; do
  curl -s -o /dev/null -D - "http://localhost:3144$p" | grep -iE "^HTTP|cache-control"
done
```

Expected: every `cache-control` is the static/ISR form (`s-maxage=86400...`),
NONE are `private, no-cache, no-store`.

- [ ] **Step 4: Full serial e2e against the prod server**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:3144 node_modules/.bin/playwright test --workers=1 --reporter=line > /tmp/m71c-e2e.log 2>&1; grep -E "^  [0-9]+ (failed|passed)" /tmp/m71c-e2e.log`
Expected: 0 failed. (Local parallel runs lie on this machine — serial only.)

- [ ] **Step 5: Commit any stragglers, push, PR**

PR body must include: emitted-page counts before/after (teams 0 → N/locale,
managers 0 → M/locale), the canonical-collapse note, and that `?season=` deep
links + `ar` were e2e-verified.

---

### Task 12: Post-deploy (separate PR, only after production verified)

Same discipline as M71a's Task 12 — doing this early makes `main` red.

- [ ] **Step 1: After merge + deploy, probe production** (gate on `/api/health` reporting the merge sha first):

```bash
curl -sS -o /dev/null -D /tmp/h "https://pitchiq-pl.vercel.app/teams/42"; sleep 3
curl -sS -o /dev/null -D /tmp/h "https://pitchiq-pl.vercel.app/teams/42"; grep -iE "x-vercel-cache|cache-control" /tmp/h
```

Expected: `x-vercel-cache: HIT` (or PRERENDER on first touch) + `public`.
Repeat for a manager URL and the `/ar` twins.

- [ ] **Step 2: Promote both routes in the cache guard** — in
      `.github/workflows/cache-guard.yml` add to the enforced list:

```bash
          check "team profile"                 "/teams/42"
          check "manager profile"              "/managers/<a-real-id>"
```

- [ ] **Step 3: Flip TASK-M71's START-HERE table** — M71c row → ✅ with the
      emitted counts and production probe results. TASK-M71 itself → ✅ Done if M71b
      is the only remainder and the owner agrees it's separable (it has its own row).

- [ ] **Step 4: PR the guard + TASKS.md change, watch checks, merge on green.**

---

## Done when (from the ticket, verbatim + M72 guard)

- Both routes emit prerendered pages per locale (counted, not read off the route table).
- `/teams/42` and a manager profile return `x-vercel-cache: HIT` + `public` on production.
- The season switcher works on both — including a `?season=` deep link, in `ar` as well as `en`.
- Unknown ids still return real 404s (`tests/e2e/not-found.spec.ts` green).
- The full E2E suite is green on CI.
