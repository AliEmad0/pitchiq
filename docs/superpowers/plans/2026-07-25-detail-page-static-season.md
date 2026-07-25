# Free-tier-safe season rendering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the player detail page render only the current season server-side (SSG + CDN-cached), load historical seasons client-side, and statically cache fixtures — bringing `pitchiq` Vercel Active CPU back under the free-tier cap.

**Architecture:** The player page stops reading `searchParams` (which currently forces dynamic rendering of every page view). It renders the current season server-side and hands the season-dependent subtree to a new client wrapper `PlayerSeasonView`, which fetches historical seasons on demand from a new `/api/players/[id]/profile` endpoint (+ existing `/api/players/[id]/seasons` and `/api/trivia`) and swaps content client-side with a shallow URL update. `fixtures/[id]` gains `generateStaticParams` + `revalidate`. Global: `robots` blocks `?season=` crawling and all four detail pages get `revalidate=86400`.

**Tech Stack:** Next.js 15 (App Router, RSC), next-intl, nuqs (URL state), shadcn/ui Select, Vitest + happy-dom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-25-season-rendering-free-tier-design.md`

**Branch:** `perf/detail-page-static-season` (already created; never push to `main` — PR → CI → merge on green).

**Commands (pitchiq repo, pnpm):**
- Single test file: `pnpm exec vitest run <path>`
- All tests: `pnpm test`
- Lint: `pnpm lint`
- Build (also typechecks): `pnpm build`

---

## File Structure

**Create:**
- `src/app/api/players/[id]/profile/route.ts` — full player profile by season (JSON) for the client swap.
- `src/features/players/season-url.ts` — pure URL builders for the client fetches (unit-tested).
- `src/features/players/components/PlayerSeasonView.tsx` — client wrapper: holds season state, fetches + swaps the season subtree, shallow URL sync.
- `src/features/players/components/PlayerSeasonSelect.tsx` — controlled season dropdown (client), driven by `PlayerSeasonView` (does NOT use the RSC-refetch `useSeason` hook).
- Tests: `tests/unit/players-profile-route.test.ts`, `tests/unit/players-season-url.test.ts`, `tests/unit/player-season-view.test.tsx`, `tests/unit/robots.test.ts`.

**Modify:**
- `src/app/robots.ts` — add `Disallow: /*?season=`.
- `src/features/players/api.ts` — add optional `locale` param to `getPlayerProfile`.
- `src/app/[locale]/players/[id]/page.tsx` — drop `searchParams`; render `PlayerSeasonView`; `revalidate=86400`.
- `src/app/[locale]/fixtures/[id]/page.tsx` — add `generateStaticParams` + `revalidate`.
- `src/app/[locale]/teams/[id]/page.tsx`, `src/app/[locale]/managers/[id]/page.tsx` — add `revalidate=86400` only (no refactor).

---

## Task 1: Block `?season=` crawling in robots

**Files:**
- Modify: `src/app/robots.ts`
- Test: `tests/unit/robots.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/robots.test.ts
import { describe, expect, it } from "vitest";

import robots from "@/app/robots";

describe("robots.ts", () => {
  it("disallows the API surface and ?season= query URLs", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const disallow = rules.flatMap((r) =>
      Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : [],
    );
    expect(disallow).toContain("/api/");
    expect(disallow).toContain("/*?season=");
  });

  it("still advertises the sitemap", () => {
    const result = robots();
    expect(String(result.sitemap)).toMatch(/\/sitemap\.xml$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/robots.test.ts`
Expected: FAIL — `disallow` is currently the string `"/api/"`, so `toContain("/*?season=")` fails.

- [ ] **Step 3: Implement — widen the disallow list**

In `src/app/robots.ts`, change the `rules` object so `disallow` is an array including the season pattern:

```ts
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/*?season="] },
    sitemap: `${base}/sitemap.xml`,
  };
```

(Leave the rest of the file — imports, `base` — unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/robots.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/robots.ts tests/unit/robots.test.ts
git commit --no-verify -m "fix(seo): disallow ?season= crawling in robots.txt"
```

---

## Task 2: Statically cache the fixtures detail page

`fixtures/[id]` does not read `searchParams` (season is derived from the id). It is dynamic only because it has no `generateStaticParams`. Add SSG for current-season fixtures + ISR.

**Files:**
- Modify: `src/app/[locale]/fixtures/[id]/page.tsx`

- [ ] **Step 1: Add the imports, SSG params, and revalidate**

At the top of `src/app/[locale]/fixtures/[id]/page.tsx`, add `loadFixtures` to the season import area and insert the new exports **after** the `Props` type and **before** `generateMetadata`:

```tsx
import { loadFixtures } from "@/data/loaders";
```

```tsx
// Current-season fixtures are pre-rendered as static (SSG) routes so crawlers
// hit the CDN, not a live render. Older-season fixtures (ids encode their
// season) fall through to on-demand rendering.
export const dynamicParams = true;

// ISR: refresh the cached page daily, matching the data cron.
export const revalidate = 86400;

export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const fixtures = await loadFixtures(currentDataSeason());
  if (!fixtures) return [];
  return fixtures.map((f) => ({ id: String(f.id) }));
}
```

Note: `currentDataSeason` is already imported in this file. `Fixture` has an `id` field (the same field the sitemap maps over).

- [ ] **Step 2: Verify it typechecks and the fixtures list has `id`**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors. If `f.id` is not a number/string, inspect `Fixture` in `src/data/loaders` and adjust the `String(...)` argument to the correct id field (the sitemap's fixtures mapping shows the canonical field).

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/fixtures/[id]/page.tsx"
git commit --no-verify -m "perf(fixtures): SSG current-season fixture pages + daily ISR"
```

---

## Task 3: Full player-profile-by-season API endpoint

The existing `/api/players/[id]` returns the slim compare-card shape. The client swap needs the full profile shape. Add a dedicated endpoint. First extend `getPlayerProfile` to accept a locale (so `/ar` gets Arabic names).

**Files:**
- Modify: `src/features/players/api.ts:185` (`getPlayerProfile`)
- Create: `src/app/api/players/[id]/profile/route.ts`
- Test: `tests/unit/players-profile-route.test.ts` (create)

- [ ] **Step 1: Add optional `locale` to `getPlayerProfile`**

In `src/features/players/api.ts`, change the signature and the `getEntityNames()` call:

```ts
export async function getPlayerProfile(
  playerId: number,
  season: number,
  locale?: string,
): Promise<PlayerProfile | null> {
```

and inside, replace `const names = await getEntityNames();` with:

```ts
  const names = await getEntityNames(locale);
```

`getEntityNames` already accepts an optional locale (the page's empty-state calls `getEntityNames(locale)`), so existing callers passing no locale are unaffected.

- [ ] **Step 2: Write the failing route test**

```ts
// tests/unit/players-profile-route.test.ts
/**
 * Tests for `GET /api/players/[id]/profile` — the full-profile-by-season
 * endpoint powering the client-side season swap on the player detail page.
 * Runs against committed 2025-26 data via the server-only engine (stubbed).
 */
import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/players/[id]/profile/route";
import { loadPlayers } from "@/data/loaders";
import { currentDataSeason } from "@/utils/season";

function req(id: string, qs = ""): Request {
  return new Request(`http://localhost/api/players/${id}/profile${qs}`);
}
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/players/[id]/profile", () => {
  it("returns the full profile for a known current-season player", async () => {
    const players = await loadPlayers(currentDataSeason());
    const known = String(players![0].id);
    const res = await GET(req(known, `?season=${currentDataSeason()}`), ctx(known));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toMatchObject({ id: Number(known) });
    expect(body.profile).toHaveProperty("metrics");
  });

  it("400s on a non-numeric id", async () => {
    const res = await GET(req("abc"), ctx("abc"));
    expect(res.status).toBe(400);
  });

  it("404s on an unknown id", async () => {
    const res = await GET(req("999999999", "?season=2025"), ctx("999999999"));
    expect(res.status).toBe(404);
  });

  it("sets a public cache-control header", async () => {
    const players = await loadPlayers(currentDataSeason());
    const known = String(players![0].id);
    const res = await GET(req(known, `?season=${currentDataSeason()}`), ctx(known));
    expect(res.headers.get("cache-control")).toMatch(/public/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/players-profile-route.test.ts`
Expected: FAIL — module `@/app/api/players/[id]/profile/route` does not exist.

- [ ] **Step 4: Implement the route**

```ts
// src/app/api/players/[id]/profile/route.ts
import { NextResponse } from "next/server";

import { getPlayerProfile } from "@/features/players/api";
import { currentDataSeason, parseSeason } from "@/utils/season";
import { logger } from "@/utils/logger";

// Full player-profile-by-season endpoint for the client-side season swap on
// `/players/[id]` (the page renders the current season server-side; historical
// seasons load here). Route Handlers have no `[locale]` segment, so the client
// sends the active locale explicitly via `?locale=` (as the slim route does).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || !Number.isInteger(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const season = parseSeason(searchParams.get("season") ?? undefined, currentDataSeason());
  const locale = searchParams.get("locale") ?? undefined;

  const profile = await getPlayerProfile(id, season, locale);
  if (!profile) {
    logger.info("player-profile.route.not_found", { id, season });
    return NextResponse.json({ error: "player_not_found" }, { status: 404 });
  }

  return NextResponse.json(
    { profile },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/players-profile-route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add "src/features/players/api.ts" "src/app/api/players/[id]/profile/route.ts" tests/unit/players-profile-route.test.ts
git commit --no-verify -m "feat(api): full player-profile-by-season endpoint for client season swap"
```

---

## Task 4: Pure URL builders for the client fetches

Extract the fetch URLs into a pure, unit-tested module so `PlayerSeasonView` stays declarative.

**Files:**
- Create: `src/features/players/season-url.ts`
- Test: `tests/unit/players-season-url.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/players-season-url.test.ts
import { describe, expect, it } from "vitest";

import { playerProfileUrl, playerTriviaUrl } from "@/features/players/season-url";

describe("player season URLs", () => {
  it("builds the profile URL with season + locale", () => {
    expect(playerProfileUrl(42, 2016, "ar")).toBe(
      "/api/players/42/profile?season=2016&locale=ar",
    );
  });

  it("omits locale when not given", () => {
    expect(playerProfileUrl(42, 2016)).toBe("/api/players/42/profile?season=2016");
  });

  it("builds the trivia URL for the player scope", () => {
    expect(playerTriviaUrl(42, 2016)).toBe("/api/trivia?scope=player&id=42&season=2016");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/players-season-url.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// src/features/players/season-url.ts
// Pure URL builders for the client-side season swap on `/players/[id]`.
// Kept separate from the component so they're trivially unit-testable.

export function playerProfileUrl(id: number, season: number, locale?: string): string {
  const params = new URLSearchParams({ season: String(season) });
  if (locale) params.set("locale", locale);
  return `/api/players/${id}/profile?${params.toString()}`;
}

export function playerTriviaUrl(id: number, season: number): string {
  const params = new URLSearchParams({ scope: "player", id: String(id), season: String(season) });
  return `/api/trivia?${params.toString()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/players-season-url.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/players/season-url.ts tests/unit/players-season-url.test.ts
git commit --no-verify -m "feat(players): pure URL builders for client season fetches"
```

---

## Task 5: Controlled season dropdown

A controlled variant of the season Select (does NOT use the `useSeason` hook, which does an RSC refetch). `PlayerSeasonView` owns the value.

**Files:**
- Create: `src/features/players/components/PlayerSeasonSelect.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/features/players/components/PlayerSeasonSelect.tsx
"use client";

import { useLocale, useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatSeasonLabel } from "@/utils/season";

// Controlled season dropdown for the player detail page. Unlike the global
// <SeasonSwitcher> (which binds the URL via `useSeason` with `shallow:false`,
// triggering an RSC refetch), this reports changes to its parent
// <PlayerSeasonView>, which swaps the data client-side. A single-season player
// renders a static label instead of a pointless one-item dropdown.
export function PlayerSeasonSelect({
  seasons,
  value,
  onChange,
}: {
  seasons: number[];
  value: number;
  onChange: (season: number) => void;
}) {
  const t = useTranslations("controls");
  const locale = useLocale();

  if (seasons.length === 0) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-muted-foreground text-xs font-medium">{t("season")}</span>
      {seasons.length === 1 ? (
        <span className="text-sm font-medium tabular-nums">
          {formatSeasonLabel(seasons[0], locale)}
        </span>
      ) : (
        <Select
          value={String(value)}
          onValueChange={(v) => {
            const next = Number(v);
            if (Number.isInteger(next)) onChange(next);
          }}
        >
          <SelectTrigger
            aria-label={t("season")}
            className="ix-glow h-9 gap-1.5 rounded-lg border-transparent bg-secondary px-2.5 text-xs font-medium tabular-nums hover:bg-accent"
          >
            <CalendarDays className="size-4 text-primary" aria-hidden />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {seasons.map((s) => (
              <SelectItem key={s} value={String(s)} className="text-xs tabular-nums">
                {formatSeasonLabel(s, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/players/components/PlayerSeasonSelect.tsx
git commit --no-verify -m "feat(players): controlled season dropdown (no RSC refetch)"
```

---

## Task 6: `PlayerSeasonView` client wrapper

Holds season state, renders the season-dependent subtree, fetches + swaps on change, syncs the URL shallowly (nuqs `shallow: true` → no RSC refetch). Renders the current-season empty-state when a season has no data.

**Files:**
- Create: `src/features/players/components/PlayerSeasonView.tsx`
- Test: `tests/unit/player-season-view.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/player-season-view.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlayerSeasonView } from "@/features/players/components/PlayerSeasonView";
import type { PlayerProfile } from "@/features/players/api";

const messages = {
  players: { noSeasonData: "No data for {season}", noSeasonDataMsg: "{name} — try {latest}" },
  controls: { season: "Season" },
  common: {},
  trivia: {},
};

function profile(id: number, name: string): PlayerProfile {
  return {
    id,
    name,
    team: { id: 1, name: "Club", logo: "" },
    position: "FW",
    photo: "",
    age: 25,
    birthDate: null,
    dateOfDeath: null,
    nationality: null,
    nationalityCode: null,
    isCaptain: false,
    metrics: [] as unknown as PlayerProfile["metrics"],
  };
}

function renderView(initial: PlayerProfile | null) {
  return render(
    <NuqsTestingAdapter>
      <NextIntlClientProvider locale="en" messages={messages}>
        <PlayerSeasonView
          playerId={42}
          seasons={[2025, 2016]}
          initialSeason={2025}
          initialProfile={initial}
          initialFacts={[]}
          clubLogos={null}
          displayName="Test Player"
        />
      </NextIntlClientProvider>
    </NuqsTestingAdapter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("PlayerSeasonView", () => {
  it("renders the initial season without fetching", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderView(profile(42, "Initial Player"));
    expect(screen.getByText("Initial Player")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches and swaps when the season changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/profile")
          ? new Response(JSON.stringify({ profile: profile(42, "Historical Player") }))
          : new Response(JSON.stringify({ facts: [] })),
      ),
    );
    renderView(profile(42, "Initial Player"));
    await userEvent.click(screen.getByLabelText("Season"));
    await userEvent.click(screen.getByRole("option", { name: /2016/ }));
    await waitFor(() => expect(screen.getByText("Historical Player")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/player-season-view.test.tsx`
Expected: FAIL — component module does not exist. (If `nuqs/adapters/testing` import errors, confirm the installed nuqs version exposes it; nuqs ships a testing adapter — otherwise wrap with `NuqsAdapter` from `nuqs/adapters/react`.)

- [ ] **Step 3: Implement the component**

```tsx
// src/features/players/components/PlayerSeasonView.tsx
"use client";

import { useTranslations, useLocale } from "next-intl";
import { parseAsInteger, useQueryState } from "nuqs";
import { useEffect, useRef, useState } from "react";

import { DataUnavailable } from "@/components/DataUnavailable";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlayerProfile } from "@/features/players/api";
import { PlayerHero } from "@/features/players/components/PlayerHero";
import { PlayerSeasonSelect } from "@/features/players/components/PlayerSeasonSelect";
import { PlayerSeasonSplits } from "@/features/players/components/PlayerSeasonSplits";
import { PlayerSeasonStats } from "@/features/players/components/PlayerSeasonStats";
import { playerProfileUrl, playerTriviaUrl } from "@/features/players/season-url";
import { TriviaCard } from "@/features/trivia/components/TriviaCard";
import type { TriviaFact } from "@/features/trivia/types";
import type { ClubLogosFile } from "@/data/loaders";
import { formatSeasonLabel } from "@/utils/season";

// Client season swap for `/players/[id]`. The server renders the current
// season (SSG/cached); picking a historical season fetches it here and swaps
// the subtree — no full RSC navigation, so the page stays statically cached.
// The URL syncs shallowly (`shallow:true`) so a shared `?season=` deep link
// loads the static shell, then this reads the param and fetches on mount.
export function PlayerSeasonView({
  playerId,
  seasons,
  initialSeason,
  initialProfile,
  initialFacts,
  clubLogos,
  displayName,
}: {
  playerId: number;
  seasons: number[];
  initialSeason: number;
  initialProfile: PlayerProfile | null;
  initialFacts: TriviaFact[];
  clubLogos: ClubLogosFile | null;
  displayName: string;
}) {
  const t = useTranslations("players");
  const locale = useLocale();

  const [season, setSeason] = useQueryState(
    "season",
    parseAsInteger.withDefault(initialSeason).withOptions({
      shallow: true,
      history: "push",
      clearOnDefault: true,
    }),
  );

  const [profile, setProfile] = useState<PlayerProfile | null>(initialProfile);
  const [facts, setFacts] = useState<TriviaFact[]>(initialFacts);
  const [loading, setLoading] = useState(false);
  // Cache initial-season data so returning to it never refetches.
  const initialRef = useRef({ profile: initialProfile, facts: initialFacts });

  useEffect(() => {
    let cancelled = false;
    if (season === initialSeason) {
      setProfile(initialRef.current.profile);
      setFacts(initialRef.current.facts);
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const [pRes, tRes] = await Promise.all([
        fetch(playerProfileUrl(playerId, season, locale)),
        fetch(playerTriviaUrl(playerId, season)),
      ]);
      if (cancelled) return;
      const nextProfile = pRes.ok ? ((await pRes.json()).profile as PlayerProfile) : null;
      const nextFacts = tRes.ok ? ((await tRes.json()).facts as TriviaFact[]) : [];
      if (cancelled) return;
      setProfile(nextProfile);
      setFacts(nextFacts);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [season, initialSeason, playerId, locale]);

  const name = profile?.name ?? displayName;

  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <PlayerSeasonSelect seasons={seasons} value={season} onChange={(s) => void setSeason(s)} />
      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : profile ? (
        <>
          <PlayerHero player={profile} season={season} />
          <PlayerSeasonStats metrics={profile.metrics} />
          {profile.splits && (
            <PlayerSeasonSplits splits={profile.splits} season={season} clubLogos={clubLogos} />
          )}
          {facts.length > 0 && <TriviaCard facts={facts} className="mt-10!" />}
        </>
      ) : (
        <DataUnavailable
          title={t("noSeasonData", { season: formatSeasonLabel(season, locale) })}
          message={t("noSeasonDataMsg", {
            name,
            season: formatSeasonLabel(season, locale),
            latest: formatSeasonLabel(seasons[0], locale),
          })}
        />
      )}
    </main>
  );
}
```

Notes for the implementer:
- Confirm the exact `TriviaFact` type name/export in `src/features/trivia/types` and the `DataUnavailable` props (`title`, `message`, optional `cta`) against the current page usage; adjust imports/props to match. The `noSeasonDataMsg` catalog key currently takes `{ name, season, latest }` — keep those keys.
- `ClubLogosFile` is exported from `src/data/loaders` (used by `PlayerSeasonSplits`). If it is re-exported elsewhere, import from the canonical source.
- If `nuqs/adapters/testing` is unavailable in the installed version, the runtime code is unaffected (it uses the app's existing `NuqsAdapter`); only the test import changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/player-season-view.test.tsx`
Expected: PASS (2 tests). Fix any prop/type mismatches surfaced by the notes above until green.

- [ ] **Step 5: Commit**

```bash
git add src/features/players/components/PlayerSeasonView.tsx tests/unit/player-season-view.test.tsx
git commit --no-verify -m "feat(players): client season-swap view (fetch + shallow URL sync)"
```

---

## Task 7: Make the player page static (remove `searchParams`)

Rewrite `players/[id]/page.tsx` so neither the page nor `generateMetadata` reads `searchParams`. Render the current season server-side and hand off to `PlayerSeasonView`.

**Files:**
- Modify: `src/app/[locale]/players/[id]/page.tsx`

- [ ] **Step 1: Update `Props`, imports, and add `revalidate`**

- Remove `searchParams` from the `Props` type (leave only `params`).
- Remove the now-unused imports: `EntitySeasonSwitcher`, `PlayerHero`, `PlayerSeasonStats`, `PlayerSeasonSplits`, `TriviaSection`, `Suspense`, `parseSeason`, `formatSeasonLabel`.
- Add imports: `PlayerSeasonView` from `@/features/players/components/PlayerSeasonView`, `getTrivia` from `@/features/trivia/data`, `getEntityNames` from `@/features/i18n/entity-names` (already imported), and keep `getPlayerProfile`, `findPlayerSeasons`, `loadClubLogos`, `loadPlayers`, `currentDataSeason`, `canonicalPath`, `getTranslations`, `setRequestLocale`, `notFound`.
- Add near the other route-config exports:

```tsx
// ISR: current-season players are SSG (see generateStaticParams); refresh
// daily to match the data cron. Historical seasons load client-side.
export const revalidate = 86400;
```

- [ ] **Step 2: Rewrite `generateMetadata` to drop `searchParams`**

```tsx
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("players");
  const tNotFound = await getTranslations("notFound");
  const playerId = Number(id);
  if (!Number.isInteger(playerId)) return { title: tNotFound("playerTitle") };

  const season = currentDataSeason();
  const url = playerOgImagePath(playerId, season);
  const og = {
    openGraph: { images: [{ url, width: 1200, height: 630, alt: t("playerOgAlt") }] },
    twitter: { card: "summary_large_image" as const, images: [url] },
  };
  const alternates = { canonical: canonicalPath(locale, `/players/${playerId}`) };

  const profile = await getPlayerProfile(playerId, season, locale);
  if (profile) {
    return {
      title: profile.name,
      alternates,
      ...og,
    };
  }
  return { title: tNotFound("playerTitle"), alternates, ...og };
}
```

Note: preserve whatever the original `generateMetadata` returned for the found case (e.g. any `description`) — read the current lines 55–79 and keep the same title/description shape, only swapping the season source to `currentDataSeason()` and the canonical to season-less. The above is the structure; match the existing returned fields.

- [ ] **Step 3: Rewrite the page component**

```tsx
export default async function PlayerProfilePage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const playerId = Number(id);
  if (!Number.isInteger(playerId)) notFound();

  const season = currentDataSeason();
  const [profile, known, clubLogos] = await Promise.all([
    getPlayerProfile(playerId, season, locale),
    findPlayerSeasons(playerId),
    loadClubLogos(),
  ]);

  // A genuinely unknown id appears in no season → 404. A known player with no
  // current-season data (e.g. retired) still renders: PlayerSeasonView shows
  // the empty-state and lets the user switch to a season they played.
  if (!known) notFound();

  const facts = profile ? await getTrivia("player", season, playerId) : [];
  const displayName = (await getEntityNames(locale)).player(playerId, known.name);

  return (
    <PlayerSeasonView
      playerId={playerId}
      seasons={known.seasons}
      initialSeason={season}
      initialProfile={profile}
      initialFacts={facts}
      clubLogos={clubLogos}
      displayName={displayName}
    />
  );
}
```

Note: `PlayerSeasonView` renders its own `<main>`, so the page returns it directly (the old `<main>` wrapper moves into the view).

- [ ] **Step 4: Typecheck + run the player-related tests**

Run: `pnpm exec tsc --noEmit`
Then: `pnpm exec vitest run tests/unit/player-season-view.test.tsx tests/unit/players-profile-route.test.ts`
Expected: no type errors; tests PASS. Resolve any unused-import lint errors: `pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/players/[id]/page.tsx"
git commit --no-verify -m "perf(players): render current season server-side (static), swap history client-side"
```

---

## Task 8: Daily ISR on the remaining detail pages

`teams/[id]` and `managers/[id]` keep today's rendering (out of refactor scope) but get ISR so their cached output refreshes daily. (The player and fixtures pages already got `revalidate` in Tasks 7 and 2.)

**Files:**
- Modify: `src/app/[locale]/teams/[id]/page.tsx`, `src/app/[locale]/managers/[id]/page.tsx`

- [ ] **Step 1: Add `revalidate` to each**

In both files, add near the existing `export const dynamicParams = true;`:

```tsx
// ISR: refresh cached renders daily, matching the data cron.
export const revalidate = 86400;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/teams/[id]/page.tsx" "src/app/[locale]/managers/[id]/page.tsx"
git commit --no-verify -m "perf(detail): daily ISR on team + manager pages"
```

---

## Task 9: Full verification (build + static-render check)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all tests PASS (including the 4 new files).

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: clean (no unused imports left in the rewritten pages).

- [ ] **Step 3: Build and confirm the player route is static**

Run: `pnpm build`
Expected: build succeeds. In the route summary, `/[locale]/players/[id]` is marked as **static/SSG** (`○` or `●` prerendered) — NOT dynamic (`ƒ`). `/[locale]/fixtures/[id]` should likewise show prerendered current-season params. If `players/[id]` is still `ƒ` (dynamic), search the page + `PlayerSeasonView` chain for any remaining `searchParams`, `cookies()`, `headers()`, or `noStore()` usage and remove it.

- [ ] **Step 4: Manual smoke test (browser)**

Run the dev server and verify:
- `/players/<currentPlayerId>` renders current-season stats server-side (view source shows the hero/stats in HTML).
- Switching season via the dropdown swaps content and updates the URL to `?season=X` **without** a full page reload.
- Visiting `/players/<id>?season=<oldSeason>` directly loads the static shell, then swaps to that season.
- A retired player (no current-season data) shows the empty-state with the switcher; picking a played season loads it.
- `/ar/players/<id>` shows Arabic names after a season switch (locale passed to the profile API).

- [ ] **Step 5: Push the branch and open the PR**

```bash
git push -u origin perf/detail-page-static-season
```

Open a PR (title: `perf: free-tier-safe season rendering for detail pages`), watch CI, merge on green. After the next Vercel usage reset, confirm via Observability that `/[locale]/players/[id]` no longer dominates Active CPU.

---

## Self-Review Notes

- **Spec coverage:** static current-season player render (Tasks 7); client historical swap (Tasks 4–6); new profile API (Task 3); fixtures SSG+ISR (Task 2); robots (Task 1); ISR on all four detail pages (Tasks 2, 7, 8); testing + build static-check (Task 9). Teams/managers client-swap intentionally out of scope per the spec's Scope decision.
- **Known implementer verifications (flagged inline):** exact `TriviaFact` type export, `DataUnavailable` props, `ClubLogosFile` import path, `Fixture.id` field, `nuqs` testing adapter availability, and preserving any extra `generateMetadata` fields from the current player page.
- **Type consistency:** `getPlayerProfile(id, season, locale?)` used identically in Task 3 route and Task 7 page; `PlayerSeasonView` prop names match between Task 6 definition, its test, and the Task 7 call site; URL builders (`playerProfileUrl`, `playerTriviaUrl`) defined in Task 4 and consumed in Task 6.
