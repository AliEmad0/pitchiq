# TASK-1802 — Era-Aware Player Rating Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the `ratings`/`provenance` seams TASK-1801 left `null`: one pure `rate(player, ctx) → { ratings, provenance }` entry point with two pipelines (rich = percentile-normalised advanced stats; sparse = basic rates + real team-season context), honestly labelled by a 2-tier provenance plus an xG-honesty basis.

**Architecture:** Pure `domain/` rating model (no I/O — takes an already-loaded `Player`, the season cohort, and the standings table as inputs); a thin `server-only` `adapter/` loads those and produces rated `GamePlayer` cards. Era is detected **from the data itself** (advanced metrics present?), not hardcoded years. `rate()` returns `{ ratings, provenance }` whose keys match `GamePlayer`, so a rated card is `{ ...toGamePlayer(p, s), ...rate(p, ctx) }`.

**Tech Stack:** TypeScript (strict), Zod types from `@/data/schemas` (type-only imports into domain — no runtime I/O), Vitest (`tests/unit/`, `server-only` stubbed), `@/`→`src/`. WSL via `wsl -d Ubuntu -- bash -lc '…'`.

---

## Decisions locked (owner, 2026-08-03)

- **Provenance = 2 tiers + honesty detail.** `tier: "rich" | "sparse"` (which pipeline ran) **plus** `basis: { hasAdvanced, hasXg }` so a 2003–2016 advanced-but-pre-xG card is honestly distinguishable in the UI. 1813's "sparse-era" predicate is `tier === "sparse"`.
- **Era detection is data-driven, not year-based:** `hasAdvanced = metrics.passAccuracy != null`, `hasXg = metrics.xg != null`. `tier = hasAdvanced ? "rich" : "sparse"`. This auto-handles the ~2% of 2003+ players missing advanced stats (they run sparse) with no magic constants.
- **Rating dimensions (0–100):** `attack, creation, defense, physical, discipline, overall`. `overall` is a role-weighted blend. The 1803 engine consumes these.
- **Percentile cohort = per-season, role-filtered** (fall back to the whole-season pool when the role peer-group is thin), so a rating means "vs same-role peers that year."

## Data facts (from exploration — assume true)

- `metrics` (`ComparisonMetricsSchema`): basic = `appearances, goals, assists, yellowCards, redCards, cleanSheets?, subAppearances?`; advanced = `passAccuracy, keyPasses, tackles, interceptions, duelsWon, dribblesCompleted, shotsOnTarget`, plus `xg?`/`xa?` (2017+ only) and a big `extended?` bag (unused here). All metric fields are `number | null`.
- Advanced core appears **exactly at season 2003**; `xg`/`xa` only from **2017**. Pre-2003 = basic only.
- Team context: `loadStandings(season) → Standing[]` covers **1992–2025**; each row = `{ rank, teamId, teamName, played, won, drawn, lost, goalsFor, goalsAgainst, goalsDiff, points }`. (Do **not** use `loadTeamStats` — it drops `rank`/`points`.)
- `minutesPlayed` lives only in `extended`, absent pre-2003 → the sparse pipeline uses `appearances` for playing-time share, never minutes.
- Loaders (all `@/data/loaders`): `loadPlayer(id, season)`, `loadPlayers(season)`, `loadSquad(teamId, season)`, `loadStandings(season)`. Types: `Player`, `Standing`, `ComparisonMetrics`, `PlayerRole` from `@/data/schemas`.
- Stable test fixtures in committed data: **sparse** Alan Shearer `1003185` @ `1995` (Blackburn `67`, 31 goals); **rich, pre-xG** Sergio Agüero `1001412` @ `2015` (Man City); **rich, xG** any 2020 player.

## Toolchain notes (WSL / PitchIQ)

- Pin node PATH before test/typecheck: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"`.
- Run binaries directly: `./node_modules/.bin/vitest run <path>`, `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/eslint <paths>`. Not `pnpm run`.
- Commit with `git commit --no-verify`. Branch `feat/task-1802-era-aware-ratings`; never `main`.

## File Structure

**Modify — `src/features/game/domain/`:**
- `ratings.ts` — replace the placeholders with the real types: `RatingTier`, `RatingBasis`, `Provenance`, `PlayerRatings` (typed interface), `RatingContext`, `RatedResult`.

**New — `src/features/game/domain/`:**
- `percentile.ts` — `percentileRank(value, pool)` pure math + `poolOf(cohort, role, pick)` cohort helper.
- `rating-weights.ts` — `ROLE_WEIGHTS` (per-role attack/creation/defense/physical blend) + `DEFAULT_WEIGHTS`.
- `rating-rich.ts` — `rateRich(player, ctx)`.
- `rating-sparse.ts` — `rateSparse(player, ctx)`.
- `rate.ts` — `rate(player, ctx)` orchestrator (era detection + dispatch + provenance).

**New — `src/features/game/adapter/`:**
- `ratings.ts` — `buildRatingContext(season)`, `rateGamePlayer(playerId, season)`, `loadRatedSquad(teamId, season)`.

**Modify:** `domain/index.ts` (new exports resolve through `export * from "./ratings"` already; add the new files), `adapter/index.ts` (add `./ratings`), `TASKS.md` (1802 → Done).

**New tests — `tests/unit/`:** `game-percentile.test.ts`, `game-rating-rich.test.ts`, `game-rating-sparse.test.ts`, `game-rate.test.ts`, `game-adapter-ratings.test.ts`.

---

## Task 1: Rating types (replace placeholders)

**Files:**
- Modify: `src/features/game/domain/ratings.ts`

- [ ] **Step 1: Replace the file contents**

```ts
// src/features/game/domain/ratings.ts
import type { Player, Standing } from "@/data/schemas";

/** Which pipeline produced the rating. */
export type RatingTier = "rich" | "sparse";

/** Honest detail about what data backed the rating (owner: 2-tier + basis). */
export interface RatingBasis {
  hasAdvanced: boolean; // advanced core present (passAccuracy != null) → 2003+
  hasXg: boolean; // xG present (xg != null) → 2017+
}

export interface Provenance {
  tier: RatingTier;
  season: number;
  basis: RatingBasis;
}

/** 0–100 sub-ratings the match engine (TASK-1803) consumes. */
export interface PlayerRatings {
  attack: number;
  creation: number;
  defense: number;
  physical: number;
  discipline: number;
  overall: number;
}

/** Everything a pure pipeline needs, supplied by the adapter (no I/O in domain). */
export interface RatingContext {
  season: number;
  cohort: Player[]; // all players that season (for percentile ranking)
  standings: Standing[]; // the full league table that season (team context)
}

export interface RatedResult {
  ratings: PlayerRatings;
  provenance: Provenance;
}
```

- [ ] **Step 2: Verify the whole project still typechecks (GamePlayer now has a typed PlayerRatings)**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/tsc --noEmit'`
Expected: PASS. (`toGamePlayer` sets `ratings: null` — still valid. Existing `game-*` tests build cards with `ratings: null` — still valid.)

- [ ] **Step 3: Run the existing game suite to confirm no regression**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-*.test.ts'`
Expected: PASS (the 20 existing tests).

- [ ] **Step 4: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/ratings.ts && git commit --no-verify -m "feat(game): real rating/provenance types (TASK-1802)"'
```

---

## Task 2: Percentile utility

**Files:**
- Create: `src/features/game/domain/percentile.ts`
- Test: `tests/unit/game-percentile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-percentile.test.ts
import { describe, expect, it } from "vitest";
import { percentileRank } from "@/features/game/domain/percentile";

describe("percentileRank", () => {
  it("ranks the max at 1 and the min low", () => {
    const pool = [0, 10, 20, 30, 40];
    expect(percentileRank(40, pool)).toBe(1); // 5/5 ≤ 40
    expect(percentileRank(0, pool)).toBeCloseTo(0.2); // 1/5 ≤ 0
  });

  it("is the fraction of the pool ≤ value", () => {
    expect(percentileRank(25, [10, 20, 30, 40])).toBeCloseTo(0.5); // 2/4
  });

  it("returns 0 for an empty pool", () => {
    expect(percentileRank(5, [])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-percentile.test.ts'`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/domain/percentile.ts
import type { ComparisonMetrics, Player } from "@/data/schemas";
import type { PlayerRole } from "@/data/schemas";

/** Fraction of the pool ≤ value (max → 1). Empty pool → 0. */
export function percentileRank(value: number, pool: number[]): number {
  if (pool.length === 0) return 0;
  const le = pool.reduce((n, x) => (x <= value ? n + 1 : n), 0);
  return le / pool.length;
}

const MIN_ROLE_PEERS = 8;

/**
 * Non-null values of one metric across the role-peer cohort that season.
 * Falls back to the whole-season pool when the role group is thin or role is null.
 */
export function poolOf(
  cohort: Player[],
  role: PlayerRole | null,
  pick: (m: ComparisonMetrics) => number | null,
): number[] {
  const rolePeers =
    role == null ? [] : cohort.filter((p) => p.role === role);
  const base = rolePeers.length >= MIN_ROLE_PEERS ? rolePeers : cohort;
  const out: number[] = [];
  for (const p of base) {
    const v = pick(p.metrics);
    if (v != null) out.push(v);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-percentile.test.ts'`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/percentile.ts tests/unit/game-percentile.test.ts && git commit --no-verify -m "feat(game): percentile-rank util + role cohort pool (TASK-1802)"'
```

---

## Task 3: Role weights (shared model constants)

**Files:**
- Create: `src/features/game/domain/rating-weights.ts`

Pure data consumed by both pipelines for the `overall` blend. No standalone test (exercised by Tasks 4–6); verified by typecheck.

- [ ] **Step 1: Write the file**

```ts
// src/features/game/domain/rating-weights.ts
import type { PlayerRole } from "@/data/schemas";

/** How the four core dimensions blend into `overall`, per role (each sums to 1). */
export interface RoleWeights {
  attack: number;
  creation: number;
  defense: number;
  physical: number;
}

export const DEFAULT_WEIGHTS: RoleWeights = {
  attack: 0.25,
  creation: 0.25,
  defense: 0.25,
  physical: 0.25,
};

export const ROLE_WEIGHTS: Record<PlayerRole, RoleWeights> = {
  GK: { attack: 0.0, creation: 0.05, defense: 0.75, physical: 0.2 },
  RB: { attack: 0.1, creation: 0.2, defense: 0.5, physical: 0.2 },
  LB: { attack: 0.1, creation: 0.2, defense: 0.5, physical: 0.2 },
  CB: { attack: 0.05, creation: 0.05, defense: 0.7, physical: 0.2 },
  CDM: { attack: 0.1, creation: 0.25, defense: 0.45, physical: 0.2 },
  CM: { attack: 0.2, creation: 0.4, defense: 0.25, physical: 0.15 },
  CAM: { attack: 0.35, creation: 0.45, defense: 0.1, physical: 0.1 },
  RM: { attack: 0.3, creation: 0.4, defense: 0.15, physical: 0.15 },
  LM: { attack: 0.3, creation: 0.4, defense: 0.15, physical: 0.15 },
  RW: { attack: 0.45, creation: 0.35, defense: 0.05, physical: 0.15 },
  LW: { attack: 0.45, creation: 0.35, defense: 0.05, physical: 0.15 },
  SS: { attack: 0.55, creation: 0.3, defense: 0.05, physical: 0.1 },
  CF: { attack: 0.6, creation: 0.25, defense: 0.05, physical: 0.1 },
};

export function weightsFor(role: PlayerRole | null): RoleWeights {
  return role == null ? DEFAULT_WEIGHTS : ROLE_WEIGHTS[role];
}
```

- [ ] **Step 2: Verify it compiles**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/tsc --noEmit'`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/rating-weights.ts && git commit --no-verify -m "feat(game): per-role rating weights (TASK-1802)"'
```

---

## Task 4: Rich pipeline

**Files:**
- Create: `src/features/game/domain/rating-rich.ts`
- Test: `tests/unit/game-rating-rich.test.ts`

Percentile-ranks each dimension's metrics within the role cohort, weighted-averages present metrics, scales to 0–100. `discipline` inverts cards. `overall` = role-weighted blend of the four core dims.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-rating-rich.test.ts
import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import { rateRich } from "@/features/game/domain/rating-rich";
import type { RatingContext } from "@/features/game/domain/ratings";

function striker(id: number, goals: number): Player {
  return {
    id, name: `S${id}`, role: "CF", altRoles: [],
    metrics: {
      appearances: 30, goals, assists: 5, yellowCards: 2, redCards: 0,
      cleanSheets: 0, passAccuracy: 80, keyPasses: 20, tackles: 5,
      interceptions: 3, duelsWon: 100, dribblesCompleted: 40, shotsOnTarget: goals * 2,
    },
  } as unknown as Player;
}

describe("rateRich", () => {
  const cohort: Player[] = [striker(1, 2), striker(2, 8), striker(3, 15), striker(4, 25)];
  const ctx: RatingContext = { season: 2015, cohort, standings: [] };

  it("scores the top scorer's attack near the top", () => {
    const top = rateRich(cohort[3], ctx); // 25 goals
    const low = rateRich(cohort[0], ctx); // 2 goals
    expect(top.attack).toBeGreaterThan(low.attack);
    expect(top.attack).toBeLessThanOrEqual(100);
    expect(top.attack).toBeGreaterThanOrEqual(0);
  });

  it("produces all six dimensions in 0–100", () => {
    const r = rateRich(cohort[2], ctx);
    for (const key of ["attack", "creation", "defense", "physical", "discipline", "overall"] as const) {
      expect(r[key]).toBeGreaterThanOrEqual(0);
      expect(r[key]).toBeLessThanOrEqual(100);
    }
  });

  it("rewards clean discipline (fewer cards → higher)", () => {
    const clean = { ...cohort[2], metrics: { ...cohort[2].metrics, yellowCards: 0, redCards: 0 } } as Player;
    const dirty = { ...cohort[2], metrics: { ...cohort[2].metrics, yellowCards: 10, redCards: 2 } } as Player;
    const c2 = [cohort[0], cohort[1], clean, dirty];
    expect(rateRich(clean, { ...ctx, cohort: c2 }).discipline)
      .toBeGreaterThan(rateRich(dirty, { ...ctx, cohort: c2 }).discipline);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-rating-rich.test.ts'`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/domain/rating-rich.ts
import type { ComparisonMetrics, Player } from "@/data/schemas";
import { percentileRank, poolOf } from "./percentile";
import type { PlayerRatings, RatingContext } from "./ratings";
import { weightsFor } from "./rating-weights";

const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

/** Weighted average (0–1) of the percentile of each present metric; 0 if none present. */
function dim(
  player: Player,
  ctx: RatingContext,
  parts: { pick: (m: ComparisonMetrics) => number | null; w: number }[],
): number {
  let sum = 0;
  let wsum = 0;
  for (const { pick, w } of parts) {
    const v = pick(player.metrics);
    if (v == null) continue;
    sum += w * percentileRank(v, poolOf(ctx.cohort, player.role, pick));
    wsum += w;
  }
  return wsum === 0 ? 0 : (sum / wsum) * 100;
}

export function rateRich(player: Player, ctx: RatingContext): PlayerRatings {
  const attack = dim(player, ctx, [
    { pick: (m) => m.goals, w: 2 },
    { pick: (m) => m.shotsOnTarget, w: 1 },
    { pick: (m) => m.xg ?? null, w: 1 },
  ]);
  const creation = dim(player, ctx, [
    { pick: (m) => m.assists, w: 2 },
    { pick: (m) => m.keyPasses, w: 1 },
    { pick: (m) => m.passAccuracy, w: 1 },
  ]);
  const defense = dim(player, ctx, [
    { pick: (m) => m.tackles, w: 1 },
    { pick: (m) => m.interceptions, w: 1 },
    { pick: (m) => m.duelsWon, w: 1 },
    { pick: (m) => m.cleanSheets ?? null, w: 1 },
  ]);
  const physical = dim(player, ctx, [
    { pick: (m) => m.duelsWon, w: 1 },
    { pick: (m) => m.dribblesCompleted, w: 1 },
  ]);
  // Discipline: fewer cards → higher. Percentile of a card-score, inverted.
  const cardScore = (m: ComparisonMetrics) =>
    (m.yellowCards ?? 0) + 2 * (m.redCards ?? 0);
  const discipline =
    100 * (1 - percentileRank(cardScore(player.metrics), poolOf(ctx.cohort, player.role, cardScore)));
  const w = weightsFor(player.role);
  const overall =
    w.attack * attack + w.creation * creation + w.defense * defense + w.physical * physical;

  return {
    attack: clamp100(attack),
    creation: clamp100(creation),
    defense: clamp100(defense),
    physical: clamp100(physical),
    discipline: clamp100(discipline),
    overall: clamp100(overall),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-rating-rich.test.ts'`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/rating-rich.ts tests/unit/game-rating-rich.test.ts && git commit --no-verify -m "feat(game): rich (percentile) rating pipeline (TASK-1802)"'
```

---

## Task 5: Sparse pipeline

**Files:**
- Create: `src/features/game/domain/rating-sparse.ts`
- Test: `tests/unit/game-rating-sparse.test.ts`

Pre-2003 (or advanced-missing) players: percentile-rank the basic stats within the role cohort, blend real team-season context from the standings row (attacking/defensive/quality percentiles across the table).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-rating-sparse.test.ts
import { describe, expect, it } from "vitest";
import type { Player, Standing } from "@/data/schemas";
import { rateSparse } from "@/features/game/domain/rating-sparse";
import type { RatingContext } from "@/features/game/domain/ratings";

function fwd(id: number, teamId: number, goals: number): Player {
  return {
    id, name: `F${id}`, teamId, role: "CF", altRoles: [],
    metrics: {
      appearances: 34, goals, assists: 4, yellowCards: 2, redCards: 0, cleanSheets: 0,
      passAccuracy: null, keyPasses: null, tackles: null, interceptions: null,
      duelsWon: null, dribblesCompleted: null, shotsOnTarget: null,
    },
  } as unknown as Player;
}
const standings: Standing[] = [
  { rank: 1, teamId: 67, teamName: "A", played: 38, won: 27, drawn: 8, lost: 3, goalsFor: 80, goalsAgainst: 30, goalsDiff: 50, points: 89 },
  { rank: 2, teamId: 68, teamName: "B", played: 38, won: 10, drawn: 8, lost: 20, goalsFor: 35, goalsAgainst: 70, goalsDiff: -35, points: 38 },
] as unknown as Standing[];

describe("rateSparse", () => {
  const cohort: Player[] = [fwd(1, 67, 31), fwd(2, 68, 6), fwd(3, 67, 12), fwd(4, 68, 3)];
  const ctx: RatingContext = { season: 1995, cohort, standings };

  it("scores the prolific striker's attack above a low scorer", () => {
    expect(rateSparse(cohort[0], ctx).attack).toBeGreaterThan(rateSparse(cohort[3], ctx).attack);
  });

  it("produces all six dimensions in 0–100 with no advanced stats", () => {
    const r = rateSparse(cohort[0], ctx);
    for (const key of ["attack", "creation", "defense", "physical", "discipline", "overall"] as const) {
      expect(r[key]).toBeGreaterThanOrEqual(0);
      expect(r[key]).toBeLessThanOrEqual(100);
    }
  });

  it("does not crash when the team is missing from the table", () => {
    const orphan = fwd(9, 999, 10);
    expect(() => rateSparse(orphan, { ...ctx, cohort: [...cohort, orphan] })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-rating-sparse.test.ts'`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/domain/rating-sparse.ts
import type { ComparisonMetrics, Player, Standing } from "@/data/schemas";
import { percentileRank, poolOf } from "./percentile";
import type { PlayerRatings, RatingContext } from "./ratings";
import { weightsFor } from "./rating-weights";

const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

function teamContext(player: Player, standings: Standing[]) {
  const row = standings.find((s) => s.teamId === player.teamId) ?? null;
  if (row == null || standings.length === 0) {
    return { attack: 0.5, defense: 0.5, quality: 0.5 };
  }
  const attack = percentileRank(row.goalsFor, standings.map((s) => s.goalsFor));
  const defense = 1 - percentileRank(row.goalsAgainst, standings.map((s) => s.goalsAgainst));
  const quality = percentileRank(row.points, standings.map((s) => s.points));
  return { attack, defense, quality };
}

/** Percentile of one basic metric within the role cohort (0–1). */
function pct(player: Player, ctx: RatingContext, pick: (m: ComparisonMetrics) => number | null): number {
  const v = pick(player.metrics);
  if (v == null) return 0;
  return percentileRank(v, poolOf(ctx.cohort, player.role, pick));
}

export function rateSparse(player: Player, ctx: RatingContext): PlayerRatings {
  const team = teamContext(player, ctx.standings);
  const goalsP = pct(player, ctx, (m) => m.goals);
  const assistsP = pct(player, ctx, (m) => m.assists);
  const cleanP = pct(player, ctx, (m) => m.cleanSheets ?? null);
  const appsP = pct(player, ctx, (m) => m.appearances);

  const attack = 100 * (0.8 * ((2 * goalsP + assistsP) / 3) + 0.2 * team.attack);
  const creation = 100 * assistsP;
  const defense = 100 * (0.6 * cleanP + 0.4 * team.defense);
  const physical = 100 * appsP;
  const cardScore = (m: ComparisonMetrics) => (m.yellowCards ?? 0) + 2 * (m.redCards ?? 0);
  const discipline =
    100 * (1 - percentileRank(cardScore(player.metrics), poolOf(ctx.cohort, player.role, cardScore)));

  const w = weightsFor(player.role);
  const base = w.attack * attack + w.creation * creation + w.defense * defense + w.physical * physical;
  const overall = 0.9 * base + 0.1 * (100 * team.quality); // less individual signal → lean on team

  return {
    attack: clamp100(attack),
    creation: clamp100(creation),
    defense: clamp100(defense),
    physical: clamp100(physical),
    discipline: clamp100(discipline),
    overall: clamp100(overall),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-rating-sparse.test.ts'`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/rating-sparse.ts tests/unit/game-rating-sparse.test.ts && git commit --no-verify -m "feat(game): sparse (basic + team-context) rating pipeline (TASK-1802)"'
```

---

## Task 6: `rate()` orchestrator

**Files:**
- Create: `src/features/game/domain/rate.ts`
- Test: `tests/unit/game-rate.test.ts`

Data-driven era detection: advanced present → rich, else sparse; basis records `hasAdvanced`/`hasXg`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-rate.test.ts
import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import { rate } from "@/features/game/domain/rate";
import type { RatingContext } from "@/features/game/domain/ratings";

function player(overrides: Partial<Player["metrics"]>, season: number): Player {
  return {
    id: 1, name: "P", role: "CF", altRoles: [], teamId: 1,
    metrics: {
      appearances: 30, goals: 12, assists: 5, yellowCards: 2, redCards: 0, cleanSheets: 0,
      passAccuracy: null, keyPasses: null, tackles: null, interceptions: null,
      duelsWon: null, dribblesCompleted: null, shotsOnTarget: null, ...overrides,
    },
  } as unknown as Player;
}
const ctx = (season: number, p: Player): RatingContext => ({ season, cohort: [p], standings: [] });

describe("rate", () => {
  it("sparse tier when no advanced stats (pre-2003)", () => {
    const p = player({}, 1995);
    const r = rate(p, ctx(1995, p));
    expect(r.provenance.tier).toBe("sparse");
    expect(r.provenance.basis).toEqual({ hasAdvanced: false, hasXg: false });
    expect(r.provenance.season).toBe(1995);
  });

  it("rich tier + hasXg false for the 2003–2016 advanced-but-pre-xG era", () => {
    const p = player({ passAccuracy: 82, keyPasses: 20, tackles: 5, interceptions: 3, duelsWon: 90, dribblesCompleted: 30, shotsOnTarget: 24 }, 2015);
    const r = rate(p, ctx(2015, p));
    expect(r.provenance.tier).toBe("rich");
    expect(r.provenance.basis).toEqual({ hasAdvanced: true, hasXg: false });
  });

  it("rich tier + hasXg true from 2017", () => {
    const p = player({ passAccuracy: 85, keyPasses: 30, tackles: 4, interceptions: 2, duelsWon: 95, dribblesCompleted: 40, shotsOnTarget: 30, xg: 14.2, xa: 6.1 }, 2020);
    const r = rate(p, ctx(2020, p));
    expect(r.provenance.tier).toBe("rich");
    expect(r.provenance.basis).toEqual({ hasAdvanced: true, hasXg: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-rate.test.ts'`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/domain/rate.ts
import type { Player } from "@/data/schemas";
import { rateRich } from "./rating-rich";
import { rateSparse } from "./rating-sparse";
import type { RatedResult, RatingContext } from "./ratings";

/**
 * The single era-aware rating entry point (pure).
 * Era is detected from the data: advanced core present → rich pipeline, else sparse.
 */
export function rate(player: Player, ctx: RatingContext): RatedResult {
  const hasAdvanced = player.metrics.passAccuracy != null;
  const hasXg = player.metrics.xg != null;
  const ratings = hasAdvanced ? rateRich(player, ctx) : rateSparse(player, ctx);
  return {
    ratings,
    provenance: {
      tier: hasAdvanced ? "rich" : "sparse",
      season: ctx.season,
      basis: { hasAdvanced, hasXg },
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-rate.test.ts'`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/rate.ts tests/unit/game-rate.test.ts && git commit --no-verify -m "feat(game): rate() era-aware orchestrator (TASK-1802)"'
```

---

## Task 7: Adapter — rated cards from committed data

**Files:**
- Create: `src/features/game/adapter/ratings.ts`
- Test: `tests/unit/game-adapter-ratings.test.ts`

Loads the season cohort + standings once, produces rated `GamePlayer` cards. A rated card = `{ ...toGamePlayer(p, season), ...rate(p, ctx) }` (rate's keys match the card's `ratings`/`provenance`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-adapter-ratings.test.ts
import { describe, expect, it } from "vitest";
import { loadRatedSquad, rateGamePlayer } from "@/features/game/adapter/ratings";

describe("rateGamePlayer (committed data)", () => {
  it("rates a sparse-era card (Alan Shearer 1995) with tier=sparse", async () => {
    const card = await rateGamePlayer(1003185, 1995);
    expect(card).not.toBeNull();
    expect(card!.provenance?.tier).toBe("sparse");
    expect(card!.provenance?.basis.hasAdvanced).toBe(false);
    expect(card!.ratings).not.toBeNull();
    // A 31-goal season → strong attack.
    expect(card!.ratings!.attack).toBeGreaterThan(60);
    expect(card!.ratings!.overall).toBeGreaterThanOrEqual(0);
    expect(card!.ratings!.overall).toBeLessThanOrEqual(100);
  });

  it("rates a rich-era card (Agüero 2015) with tier=rich, hasXg=false", async () => {
    const card = await rateGamePlayer(1001412, 2015);
    expect(card).not.toBeNull();
    expect(card!.provenance?.tier).toBe("rich");
    expect(card!.provenance?.basis).toEqual({ hasAdvanced: true, hasXg: false });
    expect(card!.ratings!.attack).toBeGreaterThan(0);
  });

  it("returns null for an unknown player/season", async () => {
    expect(await rateGamePlayer(999999, 2015)).toBeNull();
  });
});

describe("loadRatedSquad (committed data)", () => {
  it("rates every card in a squad", async () => {
    const squad = await loadRatedSquad(63, 2003); // Leeds 2003
    expect(squad).not.toBeNull();
    expect(squad!.length).toBeGreaterThan(0);
    for (const c of squad!) {
      expect(c.ratings).not.toBeNull();
      expect(c.provenance).not.toBeNull();
    }
  });

  it("returns null for an unsupported season", async () => {
    expect(await loadRatedSquad(63, 1800)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-adapter-ratings.test.ts'`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/adapter/ratings.ts
import "server-only";
import { loadPlayer, loadPlayers, loadSquad, loadStandings } from "@/data/loaders";
import type { GamePlayer } from "@/features/game/domain/player";
import { rate } from "@/features/game/domain/rate";
import type { RatingContext } from "@/features/game/domain/ratings";
import { toGamePlayer } from "./player";

/** Load the shared per-season inputs the rating pipelines need. null = unsupported season. */
export async function buildRatingContext(season: number): Promise<RatingContext | null> {
  const cohort = await loadPlayers(season);
  if (cohort === null) return null;
  const standings = (await loadStandings(season)) ?? [];
  return { season, cohort, standings };
}

/** One rated player-season card, or null if the player/season is absent. */
export async function rateGamePlayer(
  playerId: number,
  season: number,
): Promise<GamePlayer | null> {
  const player = await loadPlayer(playerId, season);
  if (player === null) return null;
  const ctx = await buildRatingContext(season);
  if (ctx === null) return null;
  return { ...toGamePlayer(player, season), ...rate(player, ctx) };
}

/** A team's rated cards. null = unsupported season; [] = team absent that season. */
export async function loadRatedSquad(
  teamId: number,
  season: number,
): Promise<GamePlayer[] | null> {
  const squad = await loadSquad(teamId, season);
  if (squad === null) return null;
  const ctx = await buildRatingContext(season);
  if (ctx === null) return null;
  return squad.map((p) => ({ ...toGamePlayer(p, season), ...rate(p, ctx) }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-adapter-ratings.test.ts'`
Expected: PASS (5 tests). If the Shearer `attack > 60` assertion is brittle against real cohort spread, relax the threshold to `> 50` — do **not** weaken the tier/basis assertions. If `loadSquad(63, 2003)` shape differs, confirm its signature in `src/data/loaders.ts:449`.

- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/adapter/ratings.ts tests/unit/game-adapter-ratings.test.ts && git commit --no-verify -m "feat(game): adapter — rated cards from committed data (TASK-1802)"'
```

---

## Task 8: Barrels + full verification

**Files:**
- Modify: `src/features/game/domain/index.ts`
- Modify: `src/features/game/adapter/index.ts`

- [ ] **Step 1: Add the new domain exports**

```ts
// src/features/game/domain/index.ts
export * from "./card-id";
export * from "./eligibility";
export * from "./formation";
export * from "./percentile";
export * from "./player";
export * from "./rate";
export * from "./rating-rich";
export * from "./rating-sparse";
export * from "./rating-weights";
export * from "./ratings";
export * from "./team";
```

- [ ] **Step 2: Add the adapter export**

```ts
// src/features/game/adapter/index.ts
import "server-only";
export * from "./formation";
export * from "./player";
export * from "./ratings";
export * from "./squad";
```

- [ ] **Step 3: Run the full game suite**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-*.test.ts'`
Expected: PASS — all game test files green (the 20 from 1801 + the new rating tests).

- [ ] **Step 4: Typecheck + lint**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/tsc --noEmit; echo TSC=$?; ./node_modules/.bin/eslint src/features/game tests/unit/game-*.test.ts; echo ESLINT=$?'`
Expected: `TSC=0` and `ESLINT=0`. Fix import-order / `type`-import findings to house style.

- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/index.ts src/features/game/adapter/index.ts && git commit --no-verify -m "feat(game): export rating model from barrels (TASK-1802)"'
```

---

## Task 9: Update the board

**Files:**
- Modify: `TASKS.md`

- [ ] **Step 1: Flip TASK-1802 to Done + shipped notes**

In `TASKS.md`:
- Table row for TASK-1802: `📋 Ready` → `✅ Done`.
- TASK-1802 detail header: `📋 Ready` → `✅ Done`.
- Append a `**Shipped notes:**` line: pure `domain/` rating model (`percentile`, `rating-weights`, `rating-rich`, `rating-sparse`, `rate`), 2-tier provenance + `{hasAdvanced, hasXg}` basis, six 0–100 dimensions, data-driven era detection; server-only `adapter/ratings.ts` (`rateGamePlayer`, `loadRatedSquad`, `buildRatingContext`); 5 new test files; the `traits?` seam left for TASK-1814; model constants (`ROLE_WEIGHTS`, dimension weights) flagged as v1, tunable when TASK-1803 validates match feel.

- [ ] **Step 2: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add TASKS.md && git commit --no-verify -m "docs(tasks): TASK-1802 era-aware rating model done"'
```

---

## Definition of Done

- All 5 new `game-*` rating test files pass; the 20 existing game tests still pass; full unit suite green.
- `tsc --noEmit` and `eslint src/features/game` clean.
- `domain/` rating model is pure (type-only imports from `@/data/schemas`, no loaders); `adapter/ratings.ts` is the only rating file importing `@/data/loaders`.
- `rate()` returns `{ ratings, provenance }` filling the 1801 seam; `provenance` = 2-tier + `{hasAdvanced, hasXg}` basis; era detection is data-driven.
- Branch `feat/task-1802-era-aware-ratings` holds the work → PR → merge on green.

## Notes for the next tickets (not in scope here)

- **TASK-1803** consumes `PlayerRatings` per player and aggregates to team Attack/Defense power; the modifier stack layers on top. `overall` + the four core dims are the inputs.
- **TASK-1814** fills the `traits?` seam (data-derived Big-Match / Hot-Headed). Shape it as a sibling `rating-traits.ts` producing an optional `traits` object attached alongside `ratings` — the `rate()` output type can grow a `traits?` field without breaking consumers.
- Model constants are v1. Expect to tune dimension weights + role weights once TASK-1803 lets you feel match outcomes.
