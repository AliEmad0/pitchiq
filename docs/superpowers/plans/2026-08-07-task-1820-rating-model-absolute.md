# TASK-1820 — Absolute / Cross-Position Rating Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the role-cohort percentile rating model with league-wide per-90 rankings plus a dedicated goalkeeper pipeline, so card numbers compare honestly across positions.

**Architecture:** A new `stat-pool` layer owns rate conversion, the minutes floor, and a ties-averaged percentile. A `player-stats` layer extracts stat bags and is the single place the dataset's denominator defects are encoded. Two rating pipelines (outfield, goalkeeper) consume pools built once per season and never mix cohorts. `PlayerRatings` keeps its six numeric keys so the TASK-1803 match engine is untouched; goalkeeper-specific numbers ride in an optional `gk` block the card reads.

**Tech Stack:** TypeScript, Vitest, Next.js 15 App Router, next-intl. Pure `domain/` (browser-safe, no I/O); `adapter/` is the sole `server-only` JSON boundary.

**Spec:** [`docs/superpowers/specs/2026-08-07-rating-model-absolute-design.md`](../specs/2026-08-07-rating-model-absolute-design.md)

---

## Environment

All commands run through WSL with a pinned Linux PATH (a Windows `node` on PATH breaks the husky hook). Use the runner script:

```bash
MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/<file>
```

`_run.sh` pins `$HOME/.nvm/versions/node/v22.22.2/bin` and `cd`s to the repo. Never use `pnpm <script>` (pnpm 11 aborts without a TTY). Lint is `node_modules/.bin/next lint --dir src --dir tests`.

**Branch:** `feat/rating-model-absolute` (already cut off `main` and holds the spec commits).

---

## Data facts this plan depends on

Verified by probe against committed data — do not re-derive:

| Fact                                                                  | Consequence                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `duels` ≠ `duelsWon` + `duelsLost` (Wan-Bissaka '18: 377 vs 171)      | duel rate **must** divide by `duelsWon + duelsLost`                       |
| `tackles` **is** `tacklesWon` + `tacklesLost`                         | tackle rate is `tacklesWon / tackles`                                     |
| `duelsWon − groundDuelsWon` is negative for 16/49 CBs in '18          | aerial duels are **not derivable**; never add an aerial input             |
| No take-ons-faced field exists                                        | dribbled-past % is impossible; `unsuccessfulDribbles` is the player's own |
| `extended.goalsConceded` is **per-player** (on-pitch)                 | usable as individual structural impact — but defensive roles only         |
| Pre-2003 has **only** appearances, goals, assists, cards, cleanSheets | sparse DEF has no individual defensive signal; see Task 7                 |
| `extended` + `passAccuracy` present from 2003                         | the rich/sparse split is exactly 2003                                     |

---

## File Structure

| File                                          | Responsibility                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/features/game/domain/stat-pool.ts`       | **new** — minutes, per-90, ties-averaged percentile, pool building, weighted dim blend |
| `src/features/game/domain/player-stats.ts`    | **new** — stat-bag extraction; the ONLY place denominator rules live                   |
| `src/features/game/domain/rating-outfield.ts` | **new** — outfield ATT/CRE/DEF/PHY/DIS for 2003+                                       |
| `src/features/game/domain/rating-gk.ts`       | **new** — goalkeeper pipeline + `GkRatings`                                            |
| `src/features/game/domain/rating-sparse.ts`   | rewritten — pre-2003, cross-position, role-informed DEF                                |
| `src/features/game/domain/ratings.ts`         | adds `GkRatings`, `SeasonPools`, `makeRatingContext`                                   |
| `src/features/game/domain/rate.ts`            | routes GK vs outfield vs sparse                                                        |
| `src/features/game/domain/rating-weights.ts`  | adds `OVERALL_SCALE`                                                                   |
| `src/features/game/domain/percentile.ts`      | `poolOf` deleted; `percentileRank` kept                                                |
| `src/features/game/domain/rating-rich.ts`     | **deleted** — replaced by `rating-outfield.ts`                                         |
| `src/features/game/domain/player-card.ts`     | `CARD_DIMS` → `dimsFor(role)`                                                          |
| `src/features/game/components/PlayerCard.tsx` | reads `dimsFor(card.role)`                                                             |
| `src/features/game/adapter/ratings.ts`        | builds pools once per season                                                           |
| `src/i18n/messages/{en,ar}.json`              | five GK label keys                                                                     |

---

### Task 1: `stat-pool` — rates, floor, ties-averaged percentile

**Files:**

- Create: `src/features/game/domain/stat-pool.ts`
- Test: `tests/unit/game-stat-pool.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  MIN_MINUTES,
  buildPools,
  dimOf,
  minutesOf,
  per90,
  pctile,
  successRate,
} from "@/features/game/domain/stat-pool";
import type { Player } from "@/data/schemas";

const player = (metrics: Partial<Player["metrics"]>): Player =>
  ({ id: 1, name: "P", teamId: 1, teamName: "T", position: "Midfielder", metrics }) as Player;

describe("minutesOf", () => {
  it("prefers extended.minutesPlayed", () => {
    expect(minutesOf(player({ appearances: 10, extended: { minutesPlayed: 900 } as never }))).toBe(
      900,
    );
  });
  it("falls back to appearances x 90 for the pre-2004 eras", () => {
    expect(minutesOf(player({ appearances: 10 }))).toBe(900);
  });
  it("is 0 when neither is present", () => {
    expect(minutesOf(player({}))).toBe(0);
  });
});

describe("per90", () => {
  it("scales a counting stat to 90 minutes", () => {
    expect(per90(5, 900)).toBeCloseTo(0.5);
  });
  it("is null for a null value or zero minutes", () => {
    expect(per90(null, 900)).toBeNull();
    expect(per90(5, 0)).toBeNull();
  });
});

describe("successRate", () => {
  it("divides by won + lost, never by a separate total", () => {
    expect(successRate(175, 76)).toBeCloseTo(69.72, 1);
  });
  it("is null when either side is missing or nothing was resolved", () => {
    expect(successRate(175, null)).toBeNull();
    expect(successRate(0, 0)).toBeNull();
  });
});

describe("pctile", () => {
  it("puts a block of tied values in the MIDDLE of the block", () => {
    // 6 zeros then 4 higher values: a zero ranks at 3/10, not 6/10.
    const pool = [0, 0, 0, 0, 0, 0, 1, 2, 3, 4];
    expect(pctile(0, pool)).toBeCloseTo(0.3);
  });
  it("ranks the maximum near the top", () => {
    expect(pctile(4, [0, 1, 2, 3, 4])).toBeCloseTo(0.9);
  });
  it("is 0 for an empty pool", () => {
    expect(pctile(5, [])).toBe(0);
  });
});

describe("buildPools", () => {
  it("excludes players below the minutes floor", () => {
    const bags = [
      { minutes: MIN_MINUTES, goals90: 1 },
      { minutes: MIN_MINUTES - 1, goals90: 99 },
    ];
    expect(buildPools(bags, ["goals90"]).goals90).toEqual([1]);
  });
  it("skips null stats without dropping the player from other pools", () => {
    const bags = [
      { minutes: 900, goals90: 1, xg90: null },
      { minutes: 900, goals90: 2, xg90: 5 },
    ];
    const pools = buildPools(bags, ["goals90", "xg90"]);
    expect(pools.goals90).toEqual([1, 2]);
    expect(pools.xg90).toEqual([5]);
  });
});

describe("dimOf", () => {
  it("is a weighted mean of each present part's percentile, scaled to 0-100", () => {
    const pools = { a: [0, 1, 2, 3], b: [0, 1, 2, 3] };
    // a=3 -> 0.875, b=0 -> 0.125; weights 3:1 -> 0.6875 -> 68.75
    expect(
      dimOf({ minutes: 900, a: 3, b: 0 }, pools, [
        ["a", 3],
        ["b", 1],
      ]),
    ).toBeCloseTo(68.75);
  });
  it("renormalises over the parts that are present", () => {
    const pools = { a: [0, 1, 2, 3], b: [0, 1, 2, 3] };
    expect(
      dimOf({ minutes: 900, a: 3, b: null }, pools, [
        ["a", 3],
        ["b", 1],
      ]),
    ).toBeCloseTo(87.5);
  });
  it("is null when no part has data", () => {
    expect(dimOf({ minutes: 900, a: null }, { a: [1] }, [["a", 1]])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-stat-pool.test.ts`
Expected: FAIL — "Failed to resolve import @/features/game/domain/stat-pool".

- [ ] **Step 3: Write the implementation**

```ts
import type { Player } from "@/data/schemas";

/**
 * Minutes below which a player is excluded from the RANKING POOLS. They are still
 * rated — a low-minute player just doesn't get to distort the scale everyone else
 * is measured against.
 */
export const MIN_MINUTES = 600;

/** A player's stats for one season, keyed by stat name. `minutes` is always present. */
export interface StatBag {
  minutes: number;
  [key: string]: number | null;
}

export type Pools = Record<string, number[]>;

/** [statKey, weight] — the parts that blend into one dimension. */
export type DimPart = [string, number];

export function minutesOf(p: Player): number {
  const explicit = p.metrics.extended?.minutesPlayed;
  if (explicit != null) return explicit;
  return (p.metrics.appearances ?? 0) * 90;
}

export function per90(value: number | null | undefined, minutes: number): number | null {
  if (value == null || minutes <= 0) return null;
  return (value * 90) / minutes;
}

/**
 * A success percentage over the RESOLVED denominator only.
 *
 * The dataset's `duels` field counts total involvements and is NOT won + lost
 * (Wan-Bissaka '18: duels 377, won+lost 171), so dividing by it silently deflates
 * every rate. Always pass the won and lost counts.
 */
export function successRate(
  won: number | null | undefined,
  lost: number | null | undefined,
): number | null {
  if (won == null || lost == null) return null;
  const resolved = won + lost;
  if (resolved <= 0) return null;
  return (100 * won) / resolved;
}

/**
 * Ties-averaged (midpoint) percentile: a block of equal values lands in the MIDDLE
 * of the block, not at its top.
 *
 * This is what stops zero-inflation reading as excellence. Counting `x <= value`
 * gave every 0-goal player the whole zero block's credit — the mechanism behind
 * Van der Sar rating ATT 100.
 */
export function pctile(value: number, pool: number[]): number {
  if (pool.length === 0) return 0;
  let below = 0;
  let equal = 0;
  for (const x of pool) {
    if (x < value) below++;
    else if (x === value) equal++;
  }
  return (below + equal / 2) / pool.length;
}

export function buildPools(bags: StatBag[], keys: readonly string[]): Pools {
  const pools: Pools = Object.fromEntries(keys.map((k) => [k, [] as number[]]));
  for (const bag of bags) {
    if (bag.minutes < MIN_MINUTES) continue;
    for (const key of keys) {
      const v = bag[key];
      if (v != null) pools[key].push(v);
    }
  }
  return pools;
}

/** Weighted mean of each present part's percentile, 0–100. Null when nothing is present. */
export function dimOf(bag: StatBag, pools: Pools, parts: readonly DimPart[]): number | null {
  let sum = 0;
  let weight = 0;
  for (const [key, w] of parts) {
    const v = bag[key];
    if (v == null) continue;
    const pool = pools[key];
    if (pool == null || pool.length === 0) continue;
    sum += w * pctile(v, pool);
    weight += w;
  }
  return weight === 0 ? null : (sum / weight) * 100;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-stat-pool.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/stat-pool.ts tests/unit/game-stat-pool.test.ts
git commit -m "feat(game): stat-pool - per-90 rates, minutes floor, ties-averaged percentile"
```

---

### Task 2: `player-stats` — stat bags with the denominator rules encoded

**Files:**

- Create: `src/features/game/domain/player-stats.ts`
- Test: `tests/unit/game-player-stats.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import {
  GK_KEYS,
  OUTFIELD_KEYS,
  gkStats,
  outfieldStats,
} from "@/features/game/domain/player-stats";

const p = (metrics: Record<string, unknown>): Player =>
  ({
    id: 1,
    name: "P",
    teamId: 1,
    teamName: "T",
    position: "Defender",
    metrics,
  }) as unknown as Player;

// Van Dijk 2018/19 — the reference case for the whole ticket.
const vvd = p({
  appearances: 38,
  goals: 4,
  assists: 2,
  tackles: 38,
  interceptions: 40,
  duelsWon: 175,
  passAccuracy: 89.5,
  keyPasses: 6,
  shotsOnTarget: 8,
  xg: 3.1,
  yellowCards: 1,
  redCards: 0,
  extended: {
    minutesPlayed: 3385,
    duels: 321,
    duelsLost: 76,
    groundDuelsWon: 63,
    groundDuelsLost: 15,
    tacklesWon: 28,
    tacklesLost: 10,
    clearances: 199,
    blocks: 18,
    goalsConceded: 22,
    foulsWon: 22,
    foulsConceded: 12,
  },
});

describe("outfieldStats", () => {
  it("computes duel rate from won + lost, NOT from the duels field", () => {
    // 175 / (175 + 76) = 69.7%. Dividing by duels (321) would give 54.5%.
    expect(outfieldStats(vvd).duelPct).toBeCloseTo(69.72, 1);
  });

  it("computes tackle rate as tacklesWon / tackles, since tackles is already won + lost", () => {
    // 28 / 38 = 73.7%. Using tackles/(tackles+tacklesLost) would give 79.2%.
    expect(outfieldStats(vvd).tacklePct).toBeCloseTo(73.68, 1);
  });

  it("computes ground duel rate from its own won + lost", () => {
    expect(outfieldStats(vvd).groundPct).toBeCloseTo(80.77, 1);
  });

  it("inverts on-pitch goals conceded so higher is better", () => {
    // 22 over 3385' -> 0.585/90, negated.
    expect(outfieldStats(vvd).gcPrevented90).toBeCloseTo(-0.585, 2);
  });

  it("exposes NO aerial-duel stat — it cannot be derived from this dataset", () => {
    expect(OUTFIELD_KEYS.some((k) => /aerial/i.test(k))).toBe(false);
    expect(Object.keys(outfieldStats(vvd)).some((k) => /aerial/i.test(k))).toBe(false);
  });

  it("returns null rates rather than guesses when extended is absent (pre-2003)", () => {
    const sparse = p({ appearances: 30, goals: 10, assists: 4, yellowCards: 2, redCards: 0 });
    const s = outfieldStats(sparse);
    expect(s.duelPct).toBeNull();
    expect(s.tacklePct).toBeNull();
    expect(s.goals90).toBeCloseTo(0.333, 2);
  });
});

describe("gkStats", () => {
  const gk = p({
    appearances: 38,
    passAccuracy: 55.5,
    cleanSheets: 11,
    saves: 140,
    duelsWon: 9,
    extended: {
      minutesPlayed: 3420,
      goalsConceded: 58,
      goalsConcededOutsideBox: 4,
      penaltyGoalsConceded: 2,
      successfulLongPasses: 300,
      clearances: 20,
    },
  });

  it("derives save% from saves and goals conceded", () => {
    // 140 / (140 + 58) = 70.7%
    expect(gkStats(gk).savePct).toBeCloseTo(70.71, 1);
  });

  it("is null on savePct for the pre-2008 eras that have no saves field", () => {
    const old = p({
      appearances: 38,
      cleanSheets: 15,
      extended: { minutesPlayed: 3420, goalsConceded: 30 },
    });
    expect(gkStats(old).savePct).toBeNull();
    expect(gkStats(old).cleanSheetRate).toBeCloseTo(0.395, 2);
  });

  it("exposes only goalkeeper keys", () => {
    expect(GK_KEYS).toContain("savePct");
    expect(GK_KEYS).not.toContain("goals90");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-player-stats.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { Player } from "@/data/schemas";
import { type StatBag, minutesOf, per90, successRate } from "./stat-pool";

/**
 * Stat extraction — the SINGLE place the dataset's denominator defects are handled.
 *
 * Three rules, each verified against committed data:
 *  1. `duels` is total involvements, NOT won + lost. Duel rates use won + lost.
 *  2. `tackles` IS tacklesWon + tacklesLost. Tackle rate is tacklesWon / tackles.
 *  3. Aerial duels are NOT derivable — `duelsWon - groundDuelsWon` is negative for
 *     16 of 49 qualifying CBs in 2018/19. No aerial stat exists here, deliberately.
 */

export const OUTFIELD_KEYS = [
  "goals90",
  "xg90",
  "sot90",
  "assists90",
  "keyPasses90",
  "passAccuracy",
  "duelPct",
  "groundPct",
  "tacklePct",
  "gcPrevented90",
  "tackles90",
  "interceptions90",
  "clearances90",
  "blocks90",
  "duelsWon90",
  "foulsWon90",
  "foulsConceded90",
  "cardScore",
  "cleanSheetRate",
] as const;

export const GK_KEYS = [
  "savePct",
  "saves90",
  "gcPrevented90",
  "cleanSheetRate",
  "passAccuracy",
  "longPasses90",
  "gcOutsideBoxPrevented90",
  "penaltyGcPrevented90",
  "duelsWon90",
  "clearances90",
  "cardScore",
] as const;

const negate = (v: number | null): number | null => (v == null ? null : -v);

export function outfieldStats(p: Player): StatBag {
  const m = p.metrics;
  const x = m.extended;
  const minutes = minutesOf(p);
  const apps = m.appearances ?? 0;
  return {
    minutes,
    goals90: per90(m.goals, minutes),
    xg90: per90(m.xg ?? null, minutes),
    sot90: per90(m.shotsOnTarget, minutes),
    assists90: per90(m.assists, minutes),
    keyPasses90: per90(m.keyPasses, minutes),
    passAccuracy: m.passAccuracy ?? null,
    duelPct: successRate(m.duelsWon, x?.duelsLost),
    groundPct: successRate(x?.groundDuelsWon, x?.groundDuelsLost),
    // `tackles` is already won + lost, so this is a plain share, not a successRate.
    tacklePct:
      x?.tacklesWon != null && m.tackles != null && m.tackles > 0
        ? (100 * x.tacklesWon) / m.tackles
        : null,
    gcPrevented90: negate(per90(x?.goalsConceded ?? null, minutes)),
    tackles90: per90(m.tackles, minutes),
    interceptions90: per90(m.interceptions, minutes),
    clearances90: per90(x?.clearances ?? null, minutes),
    blocks90: per90(x?.blocks ?? null, minutes),
    duelsWon90: per90(m.duelsWon, minutes),
    foulsWon90: per90(x?.foulsWon ?? null, minutes),
    foulsConceded90: per90(x?.foulsConceded ?? null, minutes),
    cardScore: (m.yellowCards ?? 0) + 2 * (m.redCards ?? 0),
    cleanSheetRate: apps > 0 && m.cleanSheets != null ? m.cleanSheets / apps : null,
  };
}

export function gkStats(p: Player): StatBag {
  const m = p.metrics;
  const x = m.extended;
  const minutes = minutesOf(p);
  const apps = m.appearances ?? 0;
  return {
    minutes,
    savePct: successRate(m.saves ?? null, x?.goalsConceded ?? null),
    saves90: per90(m.saves ?? null, minutes),
    gcPrevented90: negate(per90(x?.goalsConceded ?? null, minutes)),
    cleanSheetRate: apps > 0 && m.cleanSheets != null ? m.cleanSheets / apps : null,
    passAccuracy: m.passAccuracy ?? null,
    longPasses90: per90(x?.successfulLongPasses ?? null, minutes),
    gcOutsideBoxPrevented90: negate(per90(x?.goalsConcededOutsideBox ?? null, minutes)),
    penaltyGcPrevented90: negate(per90(x?.penaltyGoalsConceded ?? null, minutes)),
    duelsWon90: per90(m.duelsWon, minutes),
    clearances90: per90(x?.clearances ?? null, minutes),
    cardScore: (m.yellowCards ?? 0) + 2 * (m.redCards ?? 0),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-player-stats.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/player-stats.ts tests/unit/game-player-stats.test.ts
git commit -m "feat(game): player-stats bags with the dataset denominator rules encoded"
```

---

### Task 3: `ratings.ts` types — `GkRatings`, `SeasonPools`, `makeRatingContext`

**Files:**

- Modify: `src/features/game/domain/ratings.ts`
- Test: `tests/unit/game-rating-context.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import { makeRatingContext } from "@/features/game/domain/ratings";

const mk = (id: number, role: string, minutes: number, goals: number): Player =>
  ({
    id,
    name: `P${id}`,
    teamId: 1,
    teamName: "T",
    position: "Midfielder",
    role,
    metrics: { appearances: 30, goals, extended: { minutesPlayed: minutes } },
  }) as unknown as Player;

describe("makeRatingContext", () => {
  it("builds the outfield and goalkeeper pools separately", () => {
    const cohort = [mk(1, "CF", 3000, 20), mk(2, "GK", 3000, 0), mk(3, "CB", 3000, 2)];
    const ctx = makeRatingContext(2019, cohort, []);
    // Goalkeepers must never appear in an outfield pool — the Van der Sar defect.
    expect(ctx.pools.outfield.goals90).toHaveLength(2);
    expect(ctx.pools.gk.cleanSheetRate).toBeDefined();
  });

  it("keeps season and standings on the context", () => {
    const ctx = makeRatingContext(2019, [], []);
    expect(ctx.season).toBe(2019);
    expect(ctx.standings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-rating-context.test.ts`
Expected: FAIL — `makeRatingContext` is not exported.

- [ ] **Step 3: Modify `ratings.ts`**

Replace the whole file with:

```ts
import type { Player, Standing } from "@/data/schemas";
import { GK_KEYS, OUTFIELD_KEYS, gkStats, outfieldStats } from "./player-stats";
import { type Pools, buildPools } from "./stat-pool";

/** Which pipeline produced the rating. */
export type RatingTier = "rich" | "sparse";

/** Honest detail about what data backed the rating (owner: 2-tier + basis). */
export interface RatingBasis {
  hasAdvanced: boolean; // advanced core present (passAccuracy != null) → 2003+
  hasXg: boolean; // xG present (xg != null) → 2017+
  hasSaves: boolean; // GK saves present → 2008+; keeps a keeper card honest
}

export interface Provenance {
  tier: RatingTier;
  season: number;
  basis: RatingBasis;
}

/** Goalkeeper-specific face numbers. Null where the era has no input for them. */
export interface GkRatings {
  reflexes: number | null;
  handling: number | null;
  kicking: number | null;
  positioning: number | null;
  command: number | null;
}

/**
 * 0–100 sub-ratings the match engine (TASK-1803) consumes.
 *
 * The six numeric keys are the ENGINE CONTRACT and are populated for every player
 * including goalkeepers — `team-power`, `minute-model` and `card-design` all read
 * them unconditionally. A goalkeeper's are produced by the GK pipeline (so `attack`
 * is a genuine near-zero, not the old 100), with the keeper-specific numbers in `gk`.
 */
export interface PlayerRatings {
  attack: number;
  creation: number;
  defense: number;
  physical: number;
  discipline: number;
  overall: number;
  gk?: GkRatings;
}

/** Season-wide ranking pools, built once. Goalkeepers and outfielders never mix. */
export interface SeasonPools {
  outfield: Pools;
  gk: Pools;
}

/** Everything a pure pipeline needs, supplied by the adapter (no I/O in domain). */
export interface RatingContext {
  season: number;
  cohort: Player[];
  standings: Standing[];
  pools: SeasonPools;
}

export interface RatedResult {
  ratings: PlayerRatings;
  provenance: Provenance;
}

/**
 * Build a rating context, computing the season's pools ONCE.
 *
 * Pools must not be rebuilt per player: the chaos pool rates hundreds of cards per
 * season at build time, and per-player pool construction is quadratic.
 */
export function makeRatingContext(
  season: number,
  cohort: Player[],
  standings: Standing[],
): RatingContext {
  const keepers = cohort.filter((p) => p.role === "GK");
  const outfielders = cohort.filter((p) => p.role !== "GK");
  return {
    season,
    cohort,
    standings,
    pools: {
      outfield: buildPools(outfielders.map(outfieldStats), OUTFIELD_KEYS),
      gk: buildPools(keepers.map(gkStats), GK_KEYS),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-rating-context.test.ts`
Expected: PASS, 2 tests. Other rating tests will now fail to compile — Task 4 onward fixes them.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/ratings.ts tests/unit/game-rating-context.test.ts
git commit -m "feat(game): rating context builds season pools once, GK and outfield split"
```

---

### Task 4: `rating-outfield` — the new outfield pipeline

**Files:**

- Create: `src/features/game/domain/rating-outfield.ts`
- Test: `tests/unit/game-rating-outfield.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import { DEFENSIVE_ROLES, rateOutfield } from "@/features/game/domain/rating-outfield";
import { makeRatingContext } from "@/features/game/domain/ratings";

const mk = (id: number, role: string, over: Record<string, unknown> = {}): Player =>
  ({
    id,
    name: `P${id}`,
    teamId: 1,
    teamName: "T",
    position: "Defender",
    role,
    metrics: {
      appearances: 38,
      goals: 0,
      assists: 0,
      tackles: 20,
      interceptions: 20,
      duelsWon: 60,
      passAccuracy: 80,
      keyPasses: 5,
      shotsOnTarget: 2,
      yellowCards: 2,
      redCards: 0,
      extended: {
        minutesPlayed: 3420,
        duelsLost: 40,
        groundDuelsWon: 30,
        groundDuelsLost: 20,
        tacklesWon: 12,
        clearances: 100,
        blocks: 10,
        goalsConceded: 40,
        foulsWon: 20,
        foulsConceded: 20,
      },
      ...over,
    },
  }) as unknown as Player;

const cohort = [
  mk(1, "CB"),
  mk(2, "CB", {
    extended: {
      minutesPlayed: 3420,
      duelsLost: 10,
      groundDuelsWon: 50,
      groundDuelsLost: 5,
      tacklesWon: 18,
      clearances: 120,
      blocks: 12,
      goalsConceded: 20,
      foulsWon: 20,
      foulsConceded: 10,
    },
  }),
  mk(3, "CF", { goals: 25, shotsOnTarget: 60 }),
  mk(4, "CM"),
  mk(5, "RB"),
  mk(6, "LB"),
  mk(7, "CDM"),
  mk(8, "RW"),
];
const ctx = makeRatingContext(2019, cohort, []);

describe("rateOutfield", () => {
  it("gives the league's top scorer a high attack", () => {
    expect(rateOutfield(cohort[2], ctx).attack).toBeGreaterThan(80);
  });

  it("gives a zero-goal defender a LOW attack, ranked across all outfielders", () => {
    expect(rateOutfield(cohort[0], ctx).attack).toBeLessThan(45);
  });

  it("rewards the better duel and tackle rates with a higher defense", () => {
    const weaker = rateOutfield(cohort[0], ctx).defense;
    const stronger = rateOutfield(cohort[1], ctx).defense;
    expect(stronger).toBeGreaterThan(weaker);
  });

  it("only applies the structural on-pitch goals-conceded signal to defensive roles", () => {
    expect(DEFENSIVE_ROLES.has("CB")).toBe(true);
    expect(DEFENSIVE_ROLES.has("CDM")).toBe(true);
    expect(DEFENSIVE_ROLES.has("RW")).toBe(false);
    expect(DEFENSIVE_ROLES.has("CF")).toBe(false);
  });

  it("clamps every dimension into 0-100", () => {
    for (const p of cohort) {
      const r = rateOutfield(p, ctx);
      for (const v of [r.attack, r.creation, r.defense, r.physical, r.discipline, r.overall]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-rating-outfield.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { Player, PlayerRole, Standing } from "@/data/schemas";
import { outfieldStats } from "./player-stats";
import type { PlayerRatings, RatingContext } from "./ratings";
import { OVERALL_SCALE, weightsFor } from "./rating-weights";
import { type DimPart, dimOf, pctile } from "./stat-pool";

const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

/** Roles whose DEF earns the structural goals-conceded signals. */
export const DEFENSIVE_ROLES: ReadonlySet<string> = new Set(["GK", "CB", "RB", "LB", "CDM"]);

const ATTACK: DimPart[] = [
  ["goals90", 2],
  ["xg90", 1],
  ["sot90", 1],
];
const CREATION: DimPart[] = [
  ["assists90", 2],
  ["keyPasses90", 1],
  ["passAccuracy", 1],
];
/**
 * 8/11 success rate, 2/11 proactive volume, 1/11 reactive volume.
 *
 * Clearances and blocks are HALF weight on purpose: a big clearance count means the
 * team is under siege, not that the defender is good. Interceptions and tackle volume
 * keep full weight because a defender chooses those.
 */
const DEFENSE: DimPart[] = [
  ["duelPct", 3],
  ["groundPct", 3],
  ["tacklePct", 2],
  ["interceptions90", 1],
  ["tackles90", 1],
  ["clearances90", 0.5],
  ["blocks90", 0.5],
];
/**
 * Defensive roles only. On a forward this is pure team inheritance — applied
 * league-wide it lifted Salah '18/19 from DEF 6 to 26, the same pollution the old
 * `cleanSheets` term caused.
 */
const DEFENSE_STRUCTURAL: DimPart[] = [["gcPrevented90", 3]];
/** Duel VOLUME here; DEF takes duel RATE. Deliberately not the same input twice. */
const PHYSICAL: DimPart[] = [
  ["duelsWon90", 2],
  ["foulsWon90", 1],
  ["foulsConceded90", 1],
];

const TEAM_DEF_SHARE = 0.15;
const FULL_SEASON_MINUTES = 2700;

/** 0–1: how good the player's team was defensively that season. 0.5 with no standings. */
function teamDefense(player: Player, standings: Standing[]): number {
  if (standings.length === 0) return 0.5;
  const row = standings.find((s) => s.teamId === player.teamId);
  if (row == null) return 0.5;
  return (
    1 -
    pctile(
      row.goalsAgainst,
      standings.map((s) => s.goalsAgainst),
    )
  );
}

export function rateOutfield(player: Player, ctx: RatingContext): PlayerRatings {
  const bag = outfieldStats(player);
  const pools = ctx.pools.outfield;
  const role = (player.role ?? null) as PlayerRole | null;
  const isDefensive = role != null && DEFENSIVE_ROLES.has(role);

  const attack = dimOf(bag, pools, ATTACK) ?? 0;
  const creation = dimOf(bag, pools, CREATION) ?? 0;
  const physical = dimOf(bag, pools, PHYSICAL) ?? 0;

  const defenseParts = isDefensive ? [...DEFENSE, ...DEFENSE_STRUCTURAL] : DEFENSE;
  const rawDefense = dimOf(bag, pools, defenseParts) ?? 0;
  // Structural credit scaled by how much of the season the player actually anchored.
  const share = isDefensive ? TEAM_DEF_SHARE * Math.min(1, bag.minutes / FULL_SEASON_MINUTES) : 0;
  const defense = (1 - share) * rawDefense + share * 100 * teamDefense(player, ctx.standings);

  // Fewer cards → higher. Percentile of the card score, inverted.
  const discipline = 100 * (1 - pctile(bag.cardScore ?? 0, pools.cardScore ?? []));

  const w = weightsFor(role);
  const blended =
    w.attack * attack + w.creation * creation + w.defense * defense + w.physical * physical;

  return {
    attack: clamp100(attack),
    creation: clamp100(creation),
    defense: clamp100(defense),
    physical: clamp100(physical),
    discipline: clamp100(discipline),
    overall: clamp100(blended * OVERALL_SCALE),
  };
}
```

- [ ] **Step 4: Add `OVERALL_SCALE` to `rating-weights.ts`**

Append to `src/features/game/domain/rating-weights.ts`:

```ts
/**
 * A single monotonic scale on `overall`, applied to every player in every season.
 *
 * Monotonic means it CANNOT reorder anyone — it only decides where the 90 line
 * falls, which drives the premium card families in `card-design.ts`. Per-season
 * counts float freely, so a stacked season yields more premium cards. Never make
 * this a per-season quota. Calibrated in Task 8.
 */
export const OVERALL_SCALE = 1.0;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-rating-outfield.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/features/game/domain/rating-outfield.ts src/features/game/domain/rating-weights.ts tests/unit/game-rating-outfield.test.ts
git commit -m "feat(game): outfield rating pipeline - quality over volume, cross-position pools"
```

---

### Task 5: `rating-gk` — the goalkeeper pipeline

**Files:**

- Create: `src/features/game/domain/rating-gk.ts`
- Test: `tests/unit/game-rating-gk.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import { rateGk } from "@/features/game/domain/rating-gk";
import { makeRatingContext } from "@/features/game/domain/ratings";

const gk = (id: number, over: Record<string, unknown> = {}): Player =>
  ({
    id,
    name: `GK${id}`,
    teamId: 1,
    teamName: "T",
    position: "Goalkeeper",
    role: "GK",
    metrics: {
      appearances: 38,
      goals: 0,
      assists: 0,
      passAccuracy: 55,
      cleanSheets: 10,
      saves: 120,
      yellowCards: 1,
      redCards: 0,
      extended: {
        minutesPlayed: 3420,
        goalsConceded: 50,
        goalsConcededOutsideBox: 5,
        penaltyGoalsConceded: 3,
        successfulLongPasses: 250,
        clearances: 15,
      },
      ...over,
    },
  }) as unknown as Player;

const modern = [
  gk(1),
  gk(2, {
    saves: 160,
    cleanSheets: 16,
    extended: {
      minutesPlayed: 3420,
      goalsConceded: 25,
      goalsConcededOutsideBox: 1,
      penaltyGoalsConceded: 1,
      successfulLongPasses: 300,
      clearances: 20,
    },
  }),
  gk(3, {
    saves: 90,
    cleanSheets: 5,
    extended: {
      minutesPlayed: 3420,
      goalsConceded: 70,
      goalsConcededOutsideBox: 9,
      penaltyGoalsConceded: 5,
      successfulLongPasses: 180,
      clearances: 10,
    },
  }),
  gk(4),
  gk(5),
  gk(6),
  gk(7),
  gk(8),
];
const ctx = makeRatingContext(2019, modern, []);

describe("rateGk", () => {
  it("never gives a goalkeeper a high attack — the Van der Sar defect", () => {
    for (const k of modern) expect(rateGk(k, ctx).attack).toBeLessThan(20);
  });

  it("rates the best shot-stopper above the worst", () => {
    expect(rateGk(modern[1], ctx).gk?.reflexes ?? 0).toBeGreaterThan(
      rateGk(modern[2], ctx).gk?.reflexes ?? 0,
    );
  });

  it("puts real goalkeeper quality into `defense` so the match engine can use it", () => {
    expect(rateGk(modern[1], ctx).defense).toBeGreaterThan(rateGk(modern[2], ctx).defense);
  });

  it("returns null reflexes rather than a fabricated number when saves are absent", () => {
    const preSaves = [
      gk(9, { saves: null, extended: { minutesPlayed: 3420, goalsConceded: 40 } }),
      gk(10, { saves: null, extended: { minutesPlayed: 3420, goalsConceded: 30 } }),
    ];
    const oldCtx = makeRatingContext(1996, preSaves, []);
    expect(rateGk(preSaves[0], oldCtx).gk?.reflexes).toBeNull();
  });

  it("still produces a usable handling number from clean sheets alone", () => {
    const preSaves = [
      gk(9, { saves: null, cleanSheets: 20, extended: { minutesPlayed: 3420 } }),
      gk(10, { saves: null, cleanSheets: 2, extended: { minutesPlayed: 3420 } }),
    ];
    const oldCtx = makeRatingContext(1996, preSaves, []);
    expect(rateGk(preSaves[0], oldCtx).gk?.handling ?? 0).toBeGreaterThan(
      rateGk(preSaves[1], oldCtx).gk?.handling ?? 0,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-rating-gk.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { Player, Standing } from "@/data/schemas";
import { gkStats } from "./player-stats";
import type { GkRatings, PlayerRatings, RatingContext } from "./ratings";
import { OVERALL_SCALE, weightsFor } from "./rating-weights";
import { type DimPart, dimOf, pctile } from "./stat-pool";

const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
const clampNullable = (x: number | null) => (x == null ? null : clamp100(x));

/**
 * The goalkeeper pipeline. Keepers are ranked ONLY against keepers, so the
 * degenerate cohorts that produced Van der Sar ATT 100 cannot form.
 *
 * Inputs degrade by era and a missing one yields null — the card renders a dash
 * rather than a fabricated number. `saves` exists only from 2008.
 */

const REFLEXES: DimPart[] = [
  ["savePct", 2],
  ["saves90", 1],
];
const HANDLING: DimPart[] = [
  ["gcPrevented90", 2],
  ["cleanSheetRate", 1],
];
const KICKING: DimPart[] = [
  ["passAccuracy", 2],
  ["longPasses90", 1],
];
const POSITIONING: DimPart[] = [
  ["gcOutsideBoxPrevented90", 2],
  ["penaltyGcPrevented90", 1],
];
const COMMAND: DimPart[] = [
  ["duelsWon90", 2],
  ["clearances90", 1],
];

const TEAM_DEF_SHARE = 0.15;
const FULL_SEASON_MINUTES = 2700;

function teamDefense(player: Player, standings: Standing[]): number {
  if (standings.length === 0) return 0.5;
  const row = standings.find((s) => s.teamId === player.teamId);
  if (row == null) return 0.5;
  return (
    1 -
    pctile(
      row.goalsAgainst,
      standings.map((s) => s.goalsAgainst),
    )
  );
}

/** Mean of the present goalkeeper dims; null when none are. */
function meanOf(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

export function rateGk(player: Player, ctx: RatingContext): PlayerRatings {
  const bag = gkStats(player);
  const pools = ctx.pools.gk;

  const gk: GkRatings = {
    reflexes: clampNullable(dimOf(bag, pools, REFLEXES)),
    handling: clampNullable(dimOf(bag, pools, HANDLING)),
    kicking: clampNullable(dimOf(bag, pools, KICKING)),
    positioning: clampNullable(dimOf(bag, pools, POSITIONING)),
    command: clampNullable(dimOf(bag, pools, COMMAND)),
  };

  // Shot-stopping drives the engine-facing `defense` so powerOf() finally sees a
  // real goalkeeper-quality signal (ROLE_WEIGHTS.GK already weights defense 0.75).
  const stopping = meanOf([gk.reflexes, gk.handling, gk.positioning]) ?? 50;
  const share = TEAM_DEF_SHARE * Math.min(1, bag.minutes / FULL_SEASON_MINUTES);
  const defense = (1 - share) * stopping + share * 100 * teamDefense(player, ctx.standings);

  const discipline = 100 * (1 - pctile(bag.cardScore ?? 0, pools.cardScore ?? []));
  // A keeper's outfield dims are honestly near-zero, not the old percentile-of-zeros.
  const attack = 0;
  const creation = gk.kicking ?? 0;
  const physical = gk.command ?? 0;

  const w = weightsFor("GK");
  const blended =
    w.attack * attack + w.creation * creation + w.defense * defense + w.physical * physical;

  return {
    attack,
    creation: clamp100(creation),
    defense: clamp100(defense),
    physical: clamp100(physical),
    discipline: clamp100(discipline),
    overall: clamp100(blended * OVERALL_SCALE),
    gk,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-rating-gk.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/rating-gk.ts tests/unit/game-rating-gk.test.ts
git commit -m "feat(game): dedicated goalkeeper rating pipeline (REF/HAN/KIC/POS/CMD)"
```

---

### Task 6: Rewrite `rating-sparse` for the pre-2003 era

**Files:**

- Modify: `src/features/game/domain/rating-sparse.ts` (full rewrite)
- Modify: `tests/unit/game-rating-sparse.test.ts` (full rewrite)

**Context the implementer needs:** pre-2003 seasons carry ONLY `appearances`, `goals`, `assists`, `yellowCards`, `redCards`, `cleanSheets`. There are no tackles, duels, or pass stats at all — verified across 1996/2000/2002. So sparse DEF has no individual defensive signal and is deliberately role-informed; `provenance.tier === "sparse"` already flags this on the card.

- [ ] **Step 1: Write the failing test** (replace the file's contents)

```ts
import { describe, expect, it } from "vitest";
import type { Player, Standing } from "@/data/schemas";
import { rateSparse } from "@/features/game/domain/rating-sparse";
import { makeRatingContext } from "@/features/game/domain/ratings";

const mk = (id: number, role: string, goals: number, assists: number, cs = 5): Player =>
  ({
    id,
    name: `P${id}`,
    teamId: id <= 4 ? 1 : 2,
    teamName: "T",
    position: "Midfielder",
    role,
    metrics: { appearances: 38, goals, assists, cleanSheets: cs, yellowCards: 2, redCards: 0 },
  }) as unknown as Player;

const cohort = [
  mk(1, "CF", 30, 5),
  mk(2, "CB", 1, 0, 18),
  mk(3, "CM", 8, 12),
  mk(4, "RB", 2, 6),
  mk(5, "CF", 4, 2),
  mk(6, "CB", 0, 1, 3),
  mk(7, "CM", 3, 3),
  mk(8, "LB", 1, 2),
];
const standings: Standing[] = [
  { teamId: 1, goalsFor: 80, goalsAgainst: 20, points: 90 } as Standing,
  { teamId: 2, goalsFor: 30, goalsAgainst: 70, points: 30 } as Standing,
];
const ctx = makeRatingContext(1996, cohort, standings);

describe("rateSparse", () => {
  it("ranks the league's top scorer highest on attack, across all positions", () => {
    const top = rateSparse(cohort[0], ctx).attack;
    for (const p of cohort.slice(1)) expect(rateSparse(p, ctx).attack).toBeLessThan(top);
  });

  it("gives a near-goalless defender a low attack", () => {
    expect(rateSparse(cohort[5], ctx).attack).toBeLessThan(40);
  });

  it("gives a defender at the best defence a higher defense than one at the worst", () => {
    expect(rateSparse(cohort[1], ctx).defense).toBeGreaterThan(rateSparse(cohort[5], ctx).defense);
  });

  it("does not hand a forward the back line's defensive credit", () => {
    // Both play for team 1 (the best defence); the forward must still rate low.
    expect(rateSparse(cohort[0], ctx).defense).toBeLessThan(rateSparse(cohort[1], ctx).defense);
  });

  it("clamps every dimension into 0-100", () => {
    for (const p of cohort) {
      const r = rateSparse(p, ctx);
      for (const v of [r.attack, r.creation, r.defense, r.physical, r.discipline, r.overall]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-rating-sparse.test.ts`
Expected: FAIL — `rateSparse` still uses the removed `poolOf`.

- [ ] **Step 3: Rewrite `rating-sparse.ts`**

```ts
import type { Player, PlayerRole, Standing } from "@/data/schemas";
import { outfieldStats } from "./player-stats";
import type { PlayerRatings, RatingContext } from "./ratings";
import { DEFENSIVE_ROLES } from "./rating-outfield";
import { OVERALL_SCALE, weightsFor } from "./rating-weights";
import { type DimPart, dimOf, pctile } from "./stat-pool";

const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

/**
 * The pre-2003 pipeline. Those seasons carry ONLY appearances, goals, assists,
 * cards and clean sheets — no tackles, duels or passing data whatsoever.
 *
 * DEF is therefore deliberately ROLE-INFORMED: with no individual defensive stat in
 * the data, position plus the team's defensive record is the only honest signal.
 * `provenance.tier === "sparse"` flags this on the card so it is never mistaken for
 * a measured number.
 */

const ATTACK: DimPart[] = [
  ["goals90", 2],
  ["sot90", 1],
];
const CREATION: DimPart[] = [["assists90", 2]];

function teamDefense(player: Player, standings: Standing[]): number {
  if (standings.length === 0) return 0.5;
  const row = standings.find((s) => s.teamId === player.teamId);
  if (row == null) return 0.5;
  return (
    1 -
    pctile(
      row.goalsAgainst,
      standings.map((s) => s.goalsAgainst),
    )
  );
}

export function rateSparse(player: Player, ctx: RatingContext): PlayerRatings {
  const bag = outfieldStats(player);
  const pools = ctx.pools.outfield;
  const role = (player.role ?? null) as PlayerRole | null;

  const attack = dimOf(bag, pools, ATTACK) ?? 0;
  const creation = dimOf(bag, pools, CREATION) ?? 0;

  // Clean-sheet rate + team record, then scaled by how defensive the role is, so a
  // forward at a mean defence does not inherit its record.
  const cleanRate = pctile(bag.cleanSheetRate ?? 0, pools.cleanSheetRate ?? []);
  const context = 100 * (0.5 * cleanRate + 0.5 * teamDefense(player, ctx.standings));
  const w = weightsFor(role);
  const defensiveness = role != null && DEFENSIVE_ROLES.has(role) ? 1 : w.defense + w.physical;
  const defense = context * defensiveness;

  // Availability is the only physical proxy the era offers.
  const physical = 100 * pctile(bag.minutes, pools.minutes != null ? pools.minutes : []);
  const discipline = 100 * (1 - pctile(bag.cardScore ?? 0, pools.cardScore ?? []));

  const blended =
    w.attack * attack + w.creation * creation + w.defense * defense + w.physical * physical;

  return {
    attack: clamp100(attack),
    creation: clamp100(creation),
    defense: clamp100(defense),
    physical: clamp100(physical),
    discipline: clamp100(discipline),
    overall: clamp100(blended * OVERALL_SCALE),
  };
}
```

- [ ] **Step 4: Add `minutes` to the pooled keys**

`physical` above ranks `minutes`, so it must be a pool. In `src/features/game/domain/player-stats.ts`, add `"minutes"` to `OUTFIELD_KEYS`:

```ts
export const OUTFIELD_KEYS = [
  "minutes",
  "goals90",
  // ... rest unchanged
] as const;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-rating-sparse.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/features/game/domain/rating-sparse.ts src/features/game/domain/player-stats.ts tests/unit/game-rating-sparse.test.ts
git commit -m "feat(game): sparse pipeline on cross-position pools, no cleanSheets leak to forwards"
```

---

### Task 7: Route in `rate.ts`, delete `rating-rich` and `poolOf`

**Files:**

- Modify: `src/features/game/domain/rate.ts`
- Delete: `src/features/game/domain/rating-rich.ts`, `tests/unit/game-rating-rich.test.ts`
- Modify: `src/features/game/domain/percentile.ts`
- Modify: `tests/unit/game-percentile.test.ts`
- Modify: `tests/unit/game-rate.test.ts`

- [ ] **Step 1: Write the failing test** (replace `tests/unit/game-rate.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import { rate } from "@/features/game/domain/rate";
import { makeRatingContext } from "@/features/game/domain/ratings";

const mk = (id: number, role: string, extra: Record<string, unknown> = {}): Player =>
  ({
    id,
    name: `P${id}`,
    teamId: 1,
    teamName: "T",
    position: "Midfielder",
    role,
    metrics: { appearances: 38, goals: 5, assists: 5, yellowCards: 1, redCards: 0, ...extra },
  }) as unknown as Player;

const rich = { passAccuracy: 85, extended: { minutesPlayed: 3420, goalsConceded: 40 } };

describe("rate", () => {
  it("routes a goalkeeper to the GK pipeline and attaches the gk block", () => {
    const cohort = [mk(1, "GK", { ...rich, saves: 100, cleanSheets: 10 }), mk(2, "CF", rich)];
    const ctx = makeRatingContext(2019, cohort, []);
    const result = rate(cohort[0], ctx);
    expect(result.ratings.gk).toBeDefined();
    expect(result.ratings.attack).toBeLessThan(20);
  });

  it("does not attach a gk block to an outfielder", () => {
    const cohort = [mk(1, "GK", rich), mk(2, "CF", rich)];
    const ctx = makeRatingContext(2019, cohort, []);
    expect(rate(cohort[1], ctx).ratings.gk).toBeUndefined();
  });

  it("detects the era from the data, not from a year constant", () => {
    const richCohort = [mk(1, "CF", rich)];
    expect(rate(richCohort[0], makeRatingContext(2019, richCohort, [])).provenance.tier).toBe(
      "rich",
    );
    const sparseCohort = [mk(1, "CF")];
    expect(rate(sparseCohort[0], makeRatingContext(1996, sparseCohort, [])).provenance.tier).toBe(
      "sparse",
    );
  });

  it("reports hasSaves so a keeper card can be honest about its grade", () => {
    const cohort = [mk(1, "GK", { ...rich, saves: 100 })];
    expect(rate(cohort[0], makeRatingContext(2019, cohort, [])).provenance.basis.hasSaves).toBe(
      true,
    );
    const old = [mk(1, "GK", rich)];
    expect(rate(old[0], makeRatingContext(2004, old, [])).provenance.basis.hasSaves).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-rate.test.ts`
Expected: FAIL — `rate` still calls `rateRich`.

- [ ] **Step 3: Rewrite `rate.ts`**

```ts
import type { Player } from "@/data/schemas";
import { rateGk } from "./rating-gk";
import { rateOutfield } from "./rating-outfield";
import { rateSparse } from "./rating-sparse";
import type { RatedResult, RatingContext } from "./ratings";

/**
 * The single era-aware rating entry point (pure).
 *
 * Two routing decisions, both from the data rather than year constants:
 *  - goalkeeper vs outfielder, so the cohorts never mix
 *  - advanced core present (passAccuracy) → the rich pipelines, else sparse
 */
export function rate(player: Player, ctx: RatingContext): RatedResult {
  const hasAdvanced = player.metrics.passAccuracy != null;
  const hasXg = player.metrics.xg != null;
  const hasSaves = player.metrics.saves != null;
  const isKeeper = player.role === "GK";

  const ratings = isKeeper
    ? rateGk(player, ctx)
    : hasAdvanced
      ? rateOutfield(player, ctx)
      : rateSparse(player, ctx);

  return {
    ratings,
    provenance: {
      tier: hasAdvanced ? "rich" : "sparse",
      season: ctx.season,
      basis: { hasAdvanced, hasXg, hasSaves },
    },
  };
}
```

- [ ] **Step 4: Delete the replaced module and its test**

```bash
git rm src/features/game/domain/rating-rich.ts tests/unit/game-rating-rich.test.ts
```

- [ ] **Step 5: Remove `poolOf` from `percentile.ts`**

Replace the file with:

```ts
/** Fraction of the pool ≤ value (max → 1). Empty pool → 0. */
export function percentileRank(value: number, pool: number[]): number {
  if (pool.length === 0) return 0;
  const le = pool.reduce((n, x) => (x <= value ? n + 1 : n), 0);
  return le / pool.length;
}
```

Then delete the `poolOf` describe block from `tests/unit/game-percentile.test.ts`, keeping only the `percentileRank` tests.

- [ ] **Step 6: Run the full suite**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run`
Expected: PASS. If `tests/unit/game-adapter-ratings.test.ts` fails, it is because it builds a `RatingContext` literal — update it to call `makeRatingContext(season, cohort, standings)`.

- [ ] **Step 7: Commit**

```bash
git add -A src/features/game/domain tests/unit
git commit -m "feat(game): route GK vs outfield in rate(); drop rating-rich and poolOf"
```

---

### Task 8: Adapter builds pools once

**Files:**

- Modify: `src/features/game/adapter/ratings.ts`
- Test: `tests/unit/game-adapter-ratings.test.ts`

- [ ] **Step 1: Modify `buildRatingContext`**

```ts
import "server-only";
import { loadPlayer, loadPlayers, loadSquad, loadStandings } from "@/data/loaders";
import type { GamePlayer } from "@/features/game/domain/player";
import { rate } from "@/features/game/domain/rate";
import { type RatingContext, makeRatingContext } from "@/features/game/domain/ratings";
import { toGamePlayer } from "./player";

/**
 * Load the shared per-season inputs the rating pipelines need. null = unsupported season.
 *
 * `makeRatingContext` computes the season's ranking pools ONCE. Callers that rate
 * many players (the chaos pool builds ~250 cards across 6 seasons at build time)
 * must reuse one context — building pools per player is quadratic.
 */
export async function buildRatingContext(season: number): Promise<RatingContext | null> {
  const cohort = await loadPlayers(season);
  if (cohort === null) return null;
  const standings = (await loadStandings(season)) ?? [];
  return makeRatingContext(season, cohort, standings);
}
```

The rest of the file is unchanged — `rateGamePlayer` and `loadRatedSquad` already build one context and reuse it.

- [ ] **Step 2: Run the adapter test**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-adapter-ratings.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/game/adapter/ratings.ts tests/unit/game-adapter-ratings.test.ts
git commit -m "refactor(game): build season rating pools once in the adapter"
```

---

### Task 9: Real-data regression guards

**Files:**

- Create: `tests/unit/game-rating-regression.test.ts`

These are the assertions that would have caught the original bug. They read committed JSON directly, matching the existing real-data test pattern in `tests/unit/game-adapter-ratings.test.ts`.

- [ ] **Step 1: Write the test**

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import { rate } from "@/features/game/domain/rate";
import { makeRatingContext } from "@/features/game/domain/ratings";
import { OUTFIELD_KEYS } from "@/features/game/domain/player-stats";

const load = async (season: number) =>
  JSON.parse(
    await readFile(path.join(process.cwd(), `data/players-${season}.json`), "utf8"),
  ) as Player[];

const loadStandings = async (season: number) =>
  JSON.parse(await readFile(path.join(process.cwd(), `data/standings-${season}.json`), "utf8"));

async function ctxFor(season: number) {
  return makeRatingContext(season, await load(season), await loadStandings(season));
}

const find = (cohort: Player[], name: string) => {
  const p = cohort.find((q) => q.name.includes(name));
  if (!p) throw new Error(`fixture player not found: ${name}`);
  return p;
};

describe("rating model — real-data regressions", () => {
  it("rates Van Dijk 2018/19 as an elite defender, top-5 in the season", async () => {
    const cohort = await load(2018);
    const ctx = await ctxFor(2018);
    const vvd = find(cohort, "van Dijk");
    const def = rate(vvd, ctx).ratings.defense;
    expect(def).toBeGreaterThan(85);

    const ranked = cohort
      .filter((p) => p.role != null && p.role !== "GK")
      .map((p) => rate(p, ctx).ratings.defense)
      .sort((a, b) => b - a);
    expect(def).toBeGreaterThanOrEqual(ranked[4]);
  });

  it("ranks Van Dijk above the high-volume, leaky-club defender", async () => {
    const cohort = await load(2018);
    const ctx = await ctxFor(2018);
    expect(rate(find(cohort, "van Dijk"), ctx).ratings.defense).toBeGreaterThan(
      rate(find(cohort, "Tarkowski"), ctx).ratings.defense,
    );
  });

  it("does not give a winger defensive credit for his back line", async () => {
    const cohort = await load(2018);
    const ctx = await ctxFor(2018);
    expect(rate(find(cohort, "Salah"), ctx).ratings.defense).toBeLessThan(15);
  });

  it("stops rating Ronaldo 2007/08 as a top defender", async () => {
    const cohort = await load(2007);
    const ctx = await ctxFor(2007);
    expect(rate(find(cohort, "Ronaldo"), ctx).ratings.defense).toBeLessThan(50);
  });

  it("never rates a goalkeeper as a high attacker", async () => {
    for (const season of [2005, 2019]) {
      const cohort = await load(season);
      const ctx = await ctxFor(season);
      for (const p of cohort.filter((q) => q.role === "GK")) {
        expect(rate(p, ctx).ratings.attack).toBeLessThan(20);
      }
    }
  });

  it("keeps zero-goal outfielders low on attack", async () => {
    const cohort = await load(2018);
    const ctx = await ctxFor(2018);
    const atts = cohort
      .filter((p) => p.role != null && p.role !== "GK" && (p.metrics.goals ?? 0) === 0)
      .map((p) => rate(p, ctx).ratings.attack)
      .sort((a, b) => a - b);
    expect(atts[Math.floor(atts.length / 2)]).toBeLessThan(25);
  });
});

describe("data-defect guards", () => {
  it("has no aerial-duel input anywhere in the model", () => {
    expect(OUTFIELD_KEYS.some((k) => /aerial/i.test(k))).toBe(false);
  });

  it("never divides a duel rate by the unreliable `duels` field", async () => {
    const src = await readFile("src/features/game/domain/player-stats.ts", "utf8");
    // duelPct must be built from duelsWon/duelsLost via successRate, never `duels`.
    expect(src).toMatch(/duelPct:\s*successRate\(m\.duelsWon,\s*x\?\.duelsLost\)/);
    expect(src).not.toMatch(/x\?\.duels\b(?!Lost)/);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-rating-regression.test.ts`
Expected: PASS, 8 tests. If Van Dijk's DEF is below 85, do NOT loosen the assertion — re-check the weights in `rating-outfield.ts` against the spec's table first.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/game-rating-regression.test.ts
git commit -m "test(game): real-data rating regressions + data-defect guards"
```

---

### Task 10: Calibrate `OVERALL_SCALE`

**Files:**

- Create (temporary): `scratch/measure-overall.mjs` — deleted before commit
- Modify: `src/features/game/domain/rating-weights.ts`
- Create: `tests/unit/game-rating-calibration.test.ts`

- [ ] **Step 1: Measure the premium share on both models**

Write a throwaway script that loads the six chaos-pool seasons (1996, 2004, 2008, 2012, 2019, 2023), rates the top-3 teams' top-14 cards per season the way `adapter/chaos-pool.ts` does, and prints the share of cards with `overall >= 90`. Run it against `git stash`ed old code for the baseline, then the new code.

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node scratch/measure-overall.mjs`
Expected: two percentages — the old premium share and the new one at `OVERALL_SCALE = 1.0`.

- [ ] **Step 2: Set `OVERALL_SCALE`**

Set the constant so the new premium share lands within a few points of the old one. Because the scale is monotonic it cannot reorder anyone — it only moves the 90 line.

```ts
export const OVERALL_SCALE = 1.0; // ← replace with the measured value
```

- [ ] **Step 3: Write the calibration guard**

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import { rate } from "@/features/game/domain/rate";
import { makeRatingContext } from "@/features/game/domain/ratings";

const SEASONS = [1996, 2004, 2008, 2012, 2019, 2023];

describe("overall calibration", () => {
  it("keeps premium (90+) cards rare but reachable across all six pool seasons", async () => {
    let premium = 0;
    let total = 0;
    for (const season of SEASONS) {
      const cohort = JSON.parse(
        await readFile(path.join(process.cwd(), `data/players-${season}.json`), "utf8"),
      ) as Player[];
      const standings = JSON.parse(
        await readFile(path.join(process.cwd(), `data/standings-${season}.json`), "utf8"),
      );
      const ctx = makeRatingContext(season, cohort, standings);
      for (const p of cohort.filter((q) => q.role != null)) {
        const o = rate(p, ctx).ratings.overall;
        total++;
        if (o >= 90) premium++;
      }
    }
    const share = premium / total;
    // A WIDE regression guard, not a quota: it exists so a future change cannot
    // silently make everyone a 95, and never to deny a deserving player a card.
    expect(share).toBeGreaterThan(0.005);
    expect(share).toBeLessThan(0.15);
  });
});
```

- [ ] **Step 4: Print the 90+ name list for owner review**

Run a one-off that prints every card with `overall >= 90` across the six seasons, grouped by season, and paste it into the PR description. The acceptance check is that the names are recognisable — Henry, Ronaldo, Shearer, Salah, Van Dijk. A missing expected name is a model bug, not a calibration knob.

- [ ] **Step 5: Run tests and clean up**

```bash
rm -rf scratch
```

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-rating-calibration.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/game/domain/rating-weights.ts tests/unit/game-rating-calibration.test.ts
git commit -m "feat(game): calibrate OVERALL_SCALE with a monotonic scale + wide guard band"
```

---

### Task 11: Role-aware card dimensions

**Files:**

- Modify: `src/features/game/domain/player-card.ts`
- Test: `tests/unit/game-player-card.test.ts`

- [ ] **Step 1: Write the failing test** (append to the existing describe blocks)

```ts
import { dimsFor } from "@/features/game/domain/player-card";

describe("dimsFor", () => {
  it("gives goalkeepers their own labels, reading the gk block", () => {
    const dims = dimsFor("GK");
    expect(dims.map((d) => d.label)).toEqual(["REF", "HAN", "KIC", "POS", "CMD"]);
    expect(dims.map((d) => d.key)).toEqual([
      "reflexes",
      "handling",
      "kicking",
      "positioning",
      "command",
    ]);
  });

  it("gives outfielders the existing labels", () => {
    expect(dimsFor("CB").map((d) => d.label)).toEqual(["ATT", "CRE", "DEF", "PHY", "DIS"]);
  });

  it("falls back to the outfield set for an unenriched null role", () => {
    expect(dimsFor(null).map((d) => d.label)).toEqual(["ATT", "CRE", "DEF", "PHY", "DIS"]);
  });

  it("marks which set reads the gk block so the card knows where to look", () => {
    expect(dimsFor("GK")[0].source).toBe("gk");
    expect(dimsFor("CB")[0].source).toBe("ratings");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-player-card.test.ts`
Expected: FAIL — `dimsFor` is not exported.

- [ ] **Step 3: Modify `player-card.ts`**

Keep `CARD_DIMS` exported (existing tests reference it) and add:

```ts
/** Where a card dimension's number comes from. */
export type DimSource = "ratings" | "gk";

export interface CardDim {
  key: string;
  label: string;
  source: DimSource;
}

/** The six FUT-style face dimensions, in display order (OVR is the headline). */
export const CARD_DIMS = [
  { key: "attack", label: "ATT", source: "ratings" },
  { key: "creation", label: "CRE", source: "ratings" },
  { key: "defense", label: "DEF", source: "ratings" },
  { key: "physical", label: "PHY", source: "ratings" },
  { key: "discipline", label: "DIS", source: "ratings" },
] as const satisfies readonly CardDim[];

/**
 * Goalkeeper face dimensions. KIC, not DIS — the outfield card already uses DIS for
 * discipline, and two different meanings behind one label is a bug waiting to happen.
 */
export const GK_CARD_DIMS = [
  { key: "reflexes", label: "REF", source: "gk" },
  { key: "handling", label: "HAN", source: "gk" },
  { key: "kicking", label: "KIC", source: "gk" },
  { key: "positioning", label: "POS", source: "gk" },
  { key: "command", label: "CMD", source: "gk" },
] as const satisfies readonly CardDim[];

/** Which five numbers a card shows, by role. */
export function dimsFor(role: string | null): readonly CardDim[] {
  return role === "GK" ? GK_CARD_DIMS : CARD_DIMS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-player-card.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/player-card.ts tests/unit/game-player-card.test.ts
git commit -m "feat(game): role-aware card dimensions (GK gets REF/HAN/KIC/POS/CMD)"
```

---

### Task 12: Render GK dimensions on the card

**Files:**

- Modify: `src/features/game/components/PlayerCard.tsx`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/ar.json`
- Test: `tests/unit/game-player-card-view.test.tsx`

**Gotchas that WILL bite (learned on PRs #85/#90/#91):**

- Stat labels must be rendered from a const array as `{expr}`, never a bare string literal — the no-hardcoded-strings AST guard flags `.tsx` string literals but never expressions.
- Never import `@/features/game/adapter/*` into a client component; it is `server-only`.
- Use `{"'"}` for an apostrophe, never `&apos;` (fails the guard) and never a bare `'` (fails ESLint).

- [ ] **Step 1: Write the failing test**

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { PlayerCard } = await import("@/features/game/components/PlayerCard");

const base = {
  cardId: "1@2019" as const,
  playerId: 1,
  season: 2019,
  altRoles: [],
  foot: null,
  height: null,
  provenance: null,
  club: "Liverpool",
  photo: null,
  photoKind: "none" as const,
  photoUrl: null,
  age: 27,
  nationality: null,
  nationalityCode: null,
  careerClubs: [],
  stats: { goals: 0, assists: 0, appearances: 38, cleanSheets: 15, yellowCards: 1, redCards: 0 },
};

const keeper: EnrichedCard = {
  ...base,
  name: "Alisson Becker",
  role: "GK",
  ratings: {
    attack: 0,
    creation: 60,
    defense: 88,
    physical: 55,
    discipline: 90,
    overall: 87,
    gk: { reflexes: 91, handling: 96, kicking: 69, positioning: 84, command: 55 },
  },
} as EnrichedCard;

describe("PlayerCard goalkeeper face", () => {
  it("shows goalkeeper labels, not the outfield ones", () => {
    renderWithIntl(<PlayerCard card={keeper} />);
    expect(screen.getByText("REF")).toBeTruthy();
    expect(screen.getByText("HAN")).toBeTruthy();
    expect(screen.queryByText("ATT")).toBeNull();
  });

  it("renders the goalkeeper's own numbers", () => {
    renderWithIntl(<PlayerCard card={keeper} />);
    expect(screen.getByText("91")).toBeTruthy();
    expect(screen.getByText("96")).toBeTruthy();
  });

  it("renders a dash for an era that has no value rather than a fabricated number", () => {
    const old = {
      ...keeper,
      ratings: { ...keeper.ratings, gk: { ...keeper.ratings.gk!, reflexes: null } },
    } as EnrichedCard;
    renderWithIntl(<PlayerCard card={old} />);
    expect(screen.getByText("–")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-player-card-view.test.tsx`
Expected: FAIL — the card renders ATT/CRE/DEF/PHY/DIS for the keeper.

- [ ] **Step 3: Update `PlayerCard.tsx`**

Find every place the card maps over `CARD_DIMS` (there are four family renderers: A, B, C, D). Replace the import and each map. Add near the top:

```tsx
import { type CardDim, dimsFor } from "@/features/game/domain/player-card";

const EM_DASH = "–";

/** One face number, from either the shared ratings or the goalkeeper block. */
function dimValue(card: EnrichedCard, dim: CardDim): string {
  const source =
    dim.source === "gk"
      ? (card.ratings?.gk as Record<string, number | null> | undefined)
      : (card.ratings as unknown as Record<string, number | null> | undefined);
  const v = source?.[dim.key];
  return v == null ? EM_DASH : String(v);
}
```

Then in each family renderer replace `CARD_DIMS.map(...)` with:

```tsx
{
  dimsFor(card.role).map((dim) => (
    <div key={dim.key} className="pc-stat">
      <span className="pc-stat-label">{dim.label}</span>
      <span className="pc-stat-value">{dimValue(card, dim)}</span>
    </div>
  ));
}
```

Keep each family's existing class names — only the source of the label/value changes.

- [ ] **Step 4: No i18n keys needed**

The card face is **English-only in every locale** (owner decision, shipped separately — see
`fix/card-english-only`). The three-letter codes render as expressions from a const array, so
they are guard-safe and untranslated. Do **not** add `gk*` message keys; there is nothing on
the card face to translate.

- [ ] **Step 5: Run tests to verify they pass**

Run: `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run tests/unit/game-player-card-view.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/game/components/PlayerCard.tsx tests/unit/game-player-card-view.test.tsx
git commit -m "feat(game): render goalkeeper-specific dimensions on the card"
```

---

### Task 13: Full verification and the board

**Files:**

- Modify: `TASKS.md`

- [ ] **Step 1: Run everything**

```bash
MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/vitest run
MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/tsc --noEmit
MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_run.sh node_modules/.bin/next lint --dir src --dir tests
```

Expected: all green. Type-check must produce no output.

- [ ] **Step 2: Production build, and confirm the game routes still prerender**

```bash
MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash /home/aliemad/_build.sh
```

Expected: `exit=0`, and `/[locale]/game` plus `/[locale]/game/chaos` both marked `●`. Never pipe the build through `tail` — the pipeline exit code masks a failed build.

- [ ] **Step 3: Add TASK-1820 to the board**

In `TASKS.md`, add a `TASK-1820` row to the Phase-18 table and a matching `### TASK-1820` section marked `✅ Done`, describing: cross-position pools, the GK pipeline, the three dataset defects found (duel denominator, tackle double-count, underivable aerial duels), the role-restricted structural signal, and the Van Dijk 68 → 89 result. Update the note at the card-system section that currently says "A separate ticket will fix the rating model" to point at TASK-1820.

- [ ] **Step 4: Commit and open the PR**

```bash
git add TASKS.md
git commit -m "docs(tasks): TASK-1820 rating model shipped"
git push -u origin feat/rating-model-absolute
```

Open the PR with the Python REST helper (`gh` is unavailable in WSL; the token lives in `~/.git-credentials`). Include the 90+ name list from Task 10 Step 4 in the description. Watch all three checks, then squash-merge on green. The Playwright check is a known flake cloud on navigation specs — if it fails and the diff touches no routes and `next build` is green, use rerun-failed-jobs rather than treating it as a regression.

---

## Self-review notes

**Spec coverage:** cross-position pools (Task 3), per-90 + minutes floor (Task 1), ties-averaged percentile (Task 1), the three data defects (Task 2, guarded in Task 9), DEF quality weighting (Task 4), role-restricted structural signal (Task 4), GK pipeline with era degradation (Task 5), engine contract preserved via the `gk` block (Task 3/5), sparse era (Task 6), routing (Task 7), pools built once (Task 8), monotonic calibration with a wide band (Task 10), role-aware card labels (Tasks 11–12), i18n parity (Task 12), board (Task 13).

**Known follow-up, deliberately out of scope:** percentile saturation at the top of each pool — Van Dijk '18/19 lands at 89 against Matip's 90 despite leading every validated rate. Fixing it needs non-linear stretching of the top decile and is its own ticket.
