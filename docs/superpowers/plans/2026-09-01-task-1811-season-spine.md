# Season spine — implementation plan (TASK-1811 PR 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** The domain spine of a season — a 38-week fixture list, an honestly simulated 20-club
league table, and a resumable run — with **no new UI**.

**Architecture:** One pure module (`domain/season.ts`) that knows nothing about clubs, routes or
storage; an optional `season?: SeasonSpec` field on `RulePack` so the mode declares its league and
nothing else changes; and one IndexedDB store for the run. The coach's squad, the match engine and
`buildSession` are all reused untouched.

**Tech stack:** the existing one. No new dependencies.

⛔ **NO SEASON HUB IN THIS PR.** Every game surface goes through the owner's 30-concept ritual
(CLAUDE.md, TASK-1834/1835/1836) and "a static mockup gets rejected". The table, the fixture list
and the matchweek control are a **new surface** and must wait for that ritual. This PR ends with a
spine that is fully tested against real data and rendered nowhere.

⚠️ **Read the agreed scope first** — `TASKS.md` → `### TASK-1811` carries the owner's decisions
(Legacy host, 38 weeks with auto-sim the default, draft-once continuity, seed + results without
events). Do not re-litigate them.

⭐ **Measured already, so the plan can rely on it:** a full 38-match season simulates in **~23 ms**
and an entire 20-club league season (380 matches) in **~230 ms**. Nothing here needs a worker, a
progress bar or chunking.

---

## File structure

| File                                       | Responsibility                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `src/features/game/domain/season.ts`       | **Pure.** Fixture list, table, per-fixture seeds, run transitions. No adapter, no storage, no React. |
| `src/features/game/domain/rule-packs.ts`   | Gains `SeasonSpec` and `season?: SeasonSpec`; `LEGACY_PACK` declares it.                             |
| `src/features/game/storage/idb.ts`         | Adds the `season` store, `DB_VERSION` 2 → 3.                                                         |
| `src/features/game/storage/season-slot.ts` | Save/load/clear one run. Mirrors `match-slot.ts`.                                                    |
| `tests/unit/season-fixtures.test.ts`       | The schedule's properties.                                                                           |
| `tests/unit/season-table.test.ts`          | Points, ordering, tie-breaks.                                                                        |
| `tests/unit/season-run.test.ts`            | Run transitions + determinism.                                                                       |
| `tests/unit/season-slot.test.ts`           | Persistence, incl. the v2 → v3 upgrade control.                                                      |
| `tests/unit/season-league.test.ts`         | ⭐ The integration test: a real 20-club league over real squads.                                     |

---

### Task 1: `domain/season.ts` — the fixture list

**Files:** create `src/features/game/domain/season.ts`, `tests/unit/season-fixtures.test.ts`

- [ ] **Step 1 — write the failing tests.**

```ts
import { describe, expect, it } from "vitest";
import { seasonFixtures } from "@/features/game/domain/season";

describe("seasonFixtures", () => {
  it("plays every opponent twice over 2(n-1) weeks", () => {
    const weeks = seasonFixtures(20);
    expect(weeks).toHaveLength(38);
    for (const w of weeks) expect(w).toHaveLength(10);
  });

  it("⛔ no club appears twice in the same week", () => {
    for (const week of seasonFixtures(20)) {
      const seen = week.flatMap(([h, a]) => [h, a]);
      expect(new Set(seen).size).toBe(seen.length);
    }
  });

  it("⛔ every ordered pairing occurs EXACTLY once — home and away, never repeated", () => {
    const seen = new Map<string, number>();
    for (const week of seasonFixtures(20)) {
      for (const [h, a] of week) seen.set(`${h}v${a}`, (seen.get(`${h}v${a}`) ?? 0) + 1);
    }
    expect(seen.size).toBe(20 * 19); // every ordered pair
    for (const count of seen.values()) expect(count).toBe(1);
  });

  it("gives every club an equal split of home and away", () => {
    const home = new Array(20).fill(0);
    for (const week of seasonFixtures(20)) for (const [h] of week) home[h]++;
    for (const n of home) expect(n).toBe(19);
  });

  it("works for any even club count", () => {
    expect(seasonFixtures(4)).toHaveLength(6);
    expect(seasonFixtures(4).flat()).toHaveLength(12);
  });
});
```

- [ ] **Step 2 — run, watch it fail.**

Run: `./node_modules/.bin/vitest run tests/unit/season-fixtures.test.ts`
Expected: FAIL — "Failed to resolve import".

- [ ] **Step 3 — implement.** The circle method, with the reverse half swapping home and away:

```ts
/** One fixture: `[homeIndex, awayIndex]` into the league's club list. */
export type Fixture = [number, number];

/**
 * A double round robin over `n` clubs — the real shape, 2(n-1) weeks.
 *
 * ⚠️ Indices, never club ids. The spine is opponent-agnostic (TASK-1832 D5): the pack supplies
 * the league and the domain never learns what a club is.
 */
export function seasonFixtures(n: number): Fixture[][] {
  if (n < 2 || n % 2 !== 0) throw new Error(`seasonFixtures needs an even count, got ${n}`);
  const rot = [...Array(n).keys()].slice(1);
  const first: Fixture[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const order = [0, ...rot];
    const week: Fixture[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = order[i]!;
      const b = order[n - 1 - i]!;
      // Alternate so no club is at home every week of the first half.
      week.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    first.push(week);
    rot.unshift(rot.pop()!);
  }
  return [...first, ...first.map((w) => w.map(([h, a]) => [a, h] as Fixture))];
}
```

- [ ] **Step 4 — green.** **Step 5 — commit** `feat(game): the season fixture list`.

---

### Task 2: the table

**Files:** modify `src/features/game/domain/season.ts`; create `tests/unit/season-table.test.ts`

- [ ] **Step 1 — write the failing tests.**

```ts
import { describe, expect, it } from "vitest";
import { type SeasonResult, seasonTable } from "@/features/game/domain/season";

const r = (home: number, away: number, hg: number, ag: number, week = 0): SeasonResult => ({
  week,
  home,
  away,
  homeGoals: hg,
  awayGoals: ag,
  seed: 1,
});

describe("seasonTable", () => {
  it("awards three for a win and one each for a draw", () => {
    const t = seasonTable(4, [r(0, 1, 2, 0), r(2, 3, 1, 1)]);
    expect(t.find((x) => x.club === 0)!.points).toBe(3);
    expect(t.find((x) => x.club === 1)!.points).toBe(0);
    expect(t.find((x) => x.club === 2)!.points).toBe(1);
    expect(t.find((x) => x.club === 3)!.points).toBe(1);
  });

  it("counts played, won, drawn, lost, for, against and difference", () => {
    const row = seasonTable(2, [r(0, 1, 3, 1), r(1, 0, 2, 2)])[0]!;
    expect(row.club).toBe(0);
    expect({ p: row.played, w: row.won, d: row.drawn, l: row.lost }).toEqual({
      p: 2,
      w: 1,
      d: 1,
      l: 0,
    });
    expect({ gf: row.goalsFor, ga: row.goalsAgainst, gd: row.goalDifference }).toEqual({
      gf: 5,
      ga: 3,
      gd: 2,
    });
  });

  it("⛔ orders by points, then goal difference, then goals scored", () => {
    // Two clubs level on points; the better difference goes above.
    const t = seasonTable(4, [r(0, 1, 1, 0), r(2, 3, 5, 0)]);
    expect(t[0]!.club).toBe(2);
    expect(t[1]!.club).toBe(0);
  });

  it("⚠️ breaks a DEAD heat deterministically rather than by input order", () => {
    // Identical records must not depend on the order results were appended.
    const a = seasonTable(4, [r(0, 1, 1, 0), r(2, 3, 1, 0)]).map((x) => x.club);
    const b = seasonTable(4, [r(2, 3, 1, 0), r(0, 1, 1, 0)]).map((x) => x.club);
    expect(a).toEqual(b);
  });

  it("lists every club even before a ball is kicked", () => {
    const t = seasonTable(20, []);
    expect(t).toHaveLength(20);
    for (const row of t) expect(row.points).toBe(0);
  });
});
```

- [ ] **Step 2 — run, watch it fail.**
- [ ] **Step 3 — implement.**

```ts
/** One finished fixture. ⛔ NO EVENTS — see the run record for why. */
export interface SeasonResult {
  week: number;
  home: number;
  away: number;
  homeGoals: number;
  awayGoals: number;
  /** The seed this fixture was played from, so any match stays re-watchable. */
  seed: number;
}

export interface TableRow {
  club: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

/**
 * The league table, derived from the results and NEVER stored.
 *
 * ⚠️ The final tie-break is the club INDEX. Real football uses a play-off; a game needs a total
 * order that does not depend on the order results happened to arrive in, or the same run would
 * render two different tables.
 */
export function seasonTable(clubs: number, results: readonly SeasonResult[]): TableRow[] {
  const rows: TableRow[] = [...Array(clubs).keys()].map((club) => ({
    club,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  }));
  const add = (i: number, gf: number, ga: number) => {
    const row = rows[i]!;
    row.played++;
    row.goalsFor += gf;
    row.goalsAgainst += ga;
    row.goalDifference = row.goalsFor - row.goalsAgainst;
    if (gf > ga) {
      row.won++;
      row.points += 3;
    } else if (gf === ga) {
      row.drawn++;
      row.points += 1;
    } else row.lost++;
  };
  for (const res of results) {
    add(res.home, res.homeGoals, res.awayGoals);
    add(res.away, res.awayGoals, res.homeGoals);
  }
  return rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.club - b.club,
  );
}
```

- [ ] **Step 4 — green.** **Step 5 — commit.**

---

### Task 3: the run — seeds and transitions

**Files:** modify `src/features/game/domain/season.ts`; create `tests/unit/season-run.test.ts`

- [ ] **Step 1 — write the failing tests.**

```ts
import { describe, expect, it } from "vitest";
import {
  fixtureSeed,
  isComplete,
  nextWeek,
  recordResult,
  type SeasonRun,
} from "@/features/game/domain/season";

const run = (): SeasonRun => ({ seed: 4242, clubs: 20, coach: 0, results: [] });

describe("the run", () => {
  it("⛔ a fixture's seed is DERIVED, so nothing extra is stored and any match re-watches", () => {
    expect(fixtureSeed(4242, 0, 0)).toBe(fixtureSeed(4242, 0, 0));
    expect(fixtureSeed(4242, 0, 0)).not.toBe(fixtureSeed(4242, 0, 1));
    expect(fixtureSeed(4242, 0, 0)).not.toBe(fixtureSeed(4242, 1, 0));
    expect(fixtureSeed(4243, 0, 0)).not.toBe(fixtureSeed(4242, 0, 0));
  });

  it("⚠️ derived seeds spread across the uint32 space, not a narrow band", () => {
    // `mulberry32` seeds close together produce visibly similar early draws (see view/seed.ts),
    // so week 0 and week 1 must not be adjacent integers.
    const a = fixtureSeed(4242, 0, 0);
    const b = fixtureSeed(4242, 1, 0);
    expect(Math.abs(a - b)).toBeGreaterThan(1000);
    for (const s of [a, b]) expect(s).toBeGreaterThanOrEqual(0);
    for (const s of [a, b]) expect(s).toBeLessThanOrEqual(0xffffffff);
  });

  it("nextWeek is the count of DISTINCT weeks already played", () => {
    expect(nextWeek(run())).toBe(0);
    const one = recordResult(run(), {
      week: 0,
      home: 0,
      away: 1,
      homeGoals: 1,
      awayGoals: 0,
      seed: 7,
    });
    expect(nextWeek(one)).toBe(1);
  });

  it("⛔ recordResult is APPEND-ONLY and never mutates the run it was given", () => {
    const before = run();
    const after = recordResult(before, {
      week: 0,
      home: 0,
      away: 1,
      homeGoals: 1,
      awayGoals: 0,
      seed: 7,
    });
    expect(before.results).toHaveLength(0);
    expect(after.results).toHaveLength(1);
    expect(after).not.toBe(before);
  });

  it("⛔ REJECTS a duplicate fixture — a replayed week must not double-count", () => {
    const one = recordResult(run(), {
      week: 0,
      home: 0,
      away: 1,
      homeGoals: 1,
      awayGoals: 0,
      seed: 7,
    });
    expect(() =>
      recordResult(one, { week: 0, home: 0, away: 1, homeGoals: 3, awayGoals: 3, seed: 7 }),
    ).toThrow(/already/i);
  });

  it("knows when the season is over", () => {
    let r = run();
    expect(isComplete(r)).toBe(false);
    // 38 weeks x 10 fixtures.
    let seed = 1;
    for (let w = 0; w < 38; w++) {
      for (let i = 0; i < 10; i++) {
        r = recordResult(r, {
          week: w,
          home: i * 2,
          away: i * 2 + 1,
          homeGoals: 0,
          awayGoals: 0,
          seed: seed++,
        });
      }
    }
    expect(isComplete(r)).toBe(true);
  });
});
```

⚠️ The last test imports `isComplete` — add it to the import line at the top of the file.

- [ ] **Step 2 — run, watch it fail.**
- [ ] **Step 3 — implement.**

```ts
/**
 * A season in progress.
 *
 * ⛔ SEED + SQUAD + RESULTS, and results carry NO EVENTS (measured: events are 3.0 KB of a
 * 3.1 KB result, and nothing reads them back). Re-deriving the whole season instead would be
 * cheap — 38 matches is ~23 ms — but a STORED result is immutable against engine drift, so
 * next month's calibration cannot silently rewrite a finished season. That is the reason to
 * store, not speed. See TASK-1844 for the engine change that made the point concrete.
 */
export interface SeasonRun {
  seed: number;
  clubs: number;
  /** Which index in the league is the coach's own club. */
  coach: number;
  results: SeasonResult[];
}

/**
 * The seed for one fixture, derived from the run's seed.
 *
 * ⚠️ Hashed, not added. `mulberry32` seeds close together produce visibly similar early draws
 * (`view/seed.ts` says so), so `seed + week` would make consecutive matchweeks feel alike.
 */
export function fixtureSeed(seasonSeed: number, week: number, index: number): number {
  let h = (seasonSeed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (week + 0x85ebca6b), 0xcc9e2d51) >>> 0;
  h = Math.imul(h ^ (index + 0x165667b1), 0x1b873593) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h >>> 0;
}

const key = (r: SeasonResult) => `${r.week}:${r.home}:${r.away}`;

/** How many whole weeks have been played. */
export function nextWeek(run: SeasonRun): number {
  return run.results.length === 0 ? 0 : Math.max(...run.results.map((r) => r.week)) + 1;
}

export function isComplete(run: SeasonRun): boolean {
  return run.results.length >= (run.clubs - 1) * 2 * (run.clubs / 2);
}

/** Append one finished fixture. ⛔ Pure: returns a new run. */
export function recordResult(run: SeasonRun, result: SeasonResult): SeasonRun {
  if (run.results.some((r) => key(r) === key(result))) {
    throw new Error(`fixture ${key(result)} already recorded`);
  }
  return { ...run, results: [...run.results, result] };
}
```

- [ ] **Step 4 — green.** **Step 5 — commit.**

---

### Task 4: `SeasonSpec` on the pack

**Files:** modify `src/features/game/domain/rule-packs.ts`; modify `tests/unit/game-rule-packs.test.ts`

- [ ] **Step 1 — write the failing tests.**

```ts
it("⛔ ONLY Legacy declares a season — every other pack must stay byte-identical", () => {
  const withSeason = RULE_PACKS.filter((p) => p.season != null).map((p) => p.id);
  expect(withSeason).toEqual(["legacy"]);
});

it("Legacy's league is 20 clubs, which is 38 weeks", () => {
  const spec = LEGACY_PACK.season!;
  expect(spec.clubs).toBe(20);
  expect(seasonFixtures(spec.clubs)).toHaveLength(38);
});
```

- [ ] **Step 2 — run, watch it fail.**
- [ ] **Step 3 — implement.** Add beside `screens` / `setup` / `opponent`:

```ts
/**
 * The league this mode plays over a season. Absent means the mode has no season format, which
 * is every pack but Legacy today — so they render and play byte-identically.
 *
 * ⚠️ Opponent-agnostic (TASK-1832 D5): the pack says HOW MANY clubs and where they come from,
 * and `domain/season.ts` never learns what a club is.
 */
export interface SeasonSpec {
  /** Including the coach's own. 20 gives the real 38-week shape. */
  clubs: number;
  /** Where the other clubs come from. `"clubs"` = the prerendered rival routes. */
  league: "clubs";
}
```

and `season?: SeasonSpec;` on `RulePack`, with `season: { clubs: 20, league: "clubs" }` on
`LEGACY_PACK`.

- [ ] **Step 4 — green**, and ⛔ **re-run the mode-status suites AFTER the change, not before** —
      the Captain's Draft lesson:

```bash
./node_modules/.bin/vitest run tests/unit/game-rule-packs.test.ts tests/unit/game-modes.test.ts tests/unit/game-mode-tile.test.tsx
```

- [ ] **Step 5 — commit.**

---

### Task 5: the run store

**Files:** modify `src/features/game/storage/idb.ts`; create
`src/features/game/storage/season-slot.ts`, `tests/unit/season-slot.test.ts`

- [ ] **Step 1 — write the failing tests**, including the upgrade control the `idb.ts` comment
      demands (TASK-1817 set the precedent and proved it rather than asserting it):

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { clearRun, loadRun, saveRun } from "@/features/game/storage/season-slot";
import { idbPut, idbGet } from "@/features/game/storage/idb";

const run = {
  seed: 4242,
  clubs: 20,
  coach: 0,
  results: [],
  cardIds: ["1@2020"],
  formationKey: "4-4-2 Flat",
};

describe("the season slot", () => {
  beforeEach(async () => {
    await clearRun();
  });

  it("round-trips a run", async () => {
    await saveRun(run);
    expect(await loadRun()).toEqual(run);
  });

  it("returns null when there is nothing saved", async () => {
    expect(await loadRun()).toBeNull();
  });

  it("⛔ a v2 record in ANOTHER store survives the upgrade to v3", async () => {
    // The claim in idb.ts is that the upgrade adds stores idempotently and never rebuilds.
    // TASK-1817 proved it for `daily`; this proves it again for `season`.
    await idbPut("match", "current", { marker: "pre-upgrade" });
    await saveRun(run);
    expect(await idbGet("match", "current")).toEqual({ marker: "pre-upgrade" });
  });
});
```

- [ ] **Step 2 — run, watch it fail.**
- [ ] **Step 3 — implement.** In `idb.ts` change the store list and version:

```ts
const DB_VERSION = 3;
const STORES = ["match", "daily", "season"] as const;
```

and create `season-slot.ts`:

```ts
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { SeasonRun } from "@/features/game/domain/season";
import { idbDel, idbGet, idbPut } from "./idb";

/**
 * A season in progress, as stored.
 *
 * ⛔ Carries the SQUAD as well as the run, because a season is "draft once and live with it"
 * (owner, 2026-09-01) — the XI is part of the run's identity, not something re-drafted on
 * resume. Same two fields `SavedMatch` carries, for the same reason: `formationKey` is the KEY
 * and never an index into `FORMATIONS`, because an index is positional and reordering that
 * array would silently resurrect a run into the wrong shape.
 *
 * ⚠️ Results carry no events — see `SeasonRun`.
 */
export interface SavedRun extends SeasonRun {
  cardIds: PlayerSeasonId[];
  formationKey: string;
}

/** One run at a time, exactly as `match-slot.ts` keeps one match. */
const KEY = "current";

export async function saveRun(run: SavedRun): Promise<void> {
  await idbPut("season", KEY, run);
}

export async function loadRun(): Promise<SavedRun | null> {
  return idbGet<SavedRun>("season", KEY);
}

export async function clearRun(): Promise<void> {
  await idbDel("season", KEY);
}
```

⚠️ Check `PlayerSeasonId`'s import path against `match-slot.ts` before writing this — it is the
same type `SavedMatch.cardIds` uses, so import it from wherever that does.

- [ ] **Step 4 — green.** **Step 5 — commit.**

---

### Task 6: ⭐ the integration test — an honest league over real squads

**Files:** create `tests/unit/season-league.test.ts`

⛔ **This is the test that matters most.** Everything above is arithmetic; this proves the spine
produces a league that behaves like one, over real data, through the real engine.

- [ ] **Step 1 — write it.**

```ts
import { describe, expect, it } from "vitest";
import { loadStandings } from "@/data/loaders";
import { assembleGameTeam } from "@/features/game/adapter/lineup";
import {
  fixtureSeed,
  recordResult,
  seasonFixtures,
  seasonTable,
  type SeasonRun,
} from "@/features/game/domain/season";
import { simulate } from "@/features/game/domain/simulate";
import type { GameTeam } from "@/features/game/domain/team";

describe("a simulated season behaves like a league", () => {
  it("⛔ plays 380 fixtures and produces a real-shaped table", async () => {
    const rows = await loadStandings(2015);
    expect(rows).toHaveLength(20);
    const teams: GameTeam[] = [];
    for (const r of rows!) {
      const t = await assembleGameTeam(r.teamId, 2015);
      expect(t).not.toBeNull();
      teams.push(t!);
    }

    let run: SeasonRun = { seed: 4242, clubs: 20, coach: 0, results: [] };
    const started = Date.now();
    seasonFixtures(20).forEach((week, w) => {
      week.forEach(([h, a], i) => {
        const seed = fixtureSeed(run.seed, w, i);
        const res = simulate({ home: teams[h]!, away: teams[a]!, seed, targetGoalsPerMatch: 2.7 });
        run = recordResult(run, {
          week: w,
          home: h,
          away: a,
          homeGoals: res.score.home,
          awayGoals: res.score.away,
          seed,
        });
      });
    });
    const elapsed = Date.now() - started;

    expect(run.results).toHaveLength(380);
    const table = seasonTable(20, run.results);
    expect(table).toHaveLength(20);

    // Every club played all 38.
    for (const row of table) expect(row.played).toBe(38);
    // Points conservation: 3 per decisive match, 2 per draw.
    const draws = run.results.filter((r) => r.homeGoals === r.awayGoals).length;
    const points = table.reduce((a, r) => a + r.points, 0);
    expect(points).toBe((380 - draws) * 3 + draws * 2);
    // Goals conservation.
    const scored = run.results.reduce((a, r) => a + r.homeGoals + r.awayGoals, 0);
    expect(table.reduce((a, r) => a + r.goalsFor, 0)).toBe(scored);
    expect(table.reduce((a, r) => a + r.goalsAgainst, 0)).toBe(scored);
    expect(table.reduce((a, r) => a + r.goalDifference, 0)).toBe(0);

    // ⭐ REAL-SHAPED, not flat. TASK-1844 fitted the engine so a league disperses like a real
    // one (points SD 16.3 against a real 16.2). If this collapses, the season is a lottery
    // again and this assertion is the alarm.
    const mean = points / 20;
    const sd = Math.sqrt(table.reduce((a, r) => a + (r.points - mean) ** 2, 0) / 20);
    expect(sd).toBeGreaterThan(9);
    console.log(
      `champion ${table[0]!.points} pts, bottom ${table[19]!.points}, SD ${sd.toFixed(1)}, ${elapsed}ms`,
    );
  }, 600_000);

  it("⛔ the SAME seed replays the SAME season", async () => {
    const rows = await loadStandings(2015);
    const teams: GameTeam[] = [];
    for (const r of rows!.slice(0, 4)) teams.push((await assembleGameTeam(r.teamId, 2015))!);
    const play = () =>
      seasonFixtures(4).flatMap((week, w) =>
        week.map(([h, a], i) => {
          const seed = fixtureSeed(99, w, i);
          const res = simulate({
            home: teams[h]!,
            away: teams[a]!,
            seed,
            targetGoalsPerMatch: 2.7,
          });
          return `${w}:${h}v${a}:${res.score.home}-${res.score.away}`;
        }),
      );
    expect(play()).toEqual(play());
  }, 600_000);
});
```

- [ ] **Step 2 — run it.**

Run: `./node_modules/.bin/vitest run tests/unit/season-league.test.ts`
Expected: PASS, with the console line showing a champion near 80–90 points and an SD near 16.
⚠️ If the SD comes out near 8, TASK-1844's calibration has been reverted or undone — stop and
find out why before touching this plan.

- [ ] **Step 3 — commit.**

---

### Task 7: verify and document

- [ ] **Step 1 — the full targeted battery plus the global guards** a targeted battery misses:

```bash
./node_modules/.bin/vitest run tests/unit/season-fixtures.test.ts tests/unit/season-table.test.ts tests/unit/season-run.test.ts tests/unit/season-slot.test.ts tests/unit/season-league.test.ts tests/unit/game-rule-packs.test.ts tests/unit/game-modes.test.ts tests/unit/game-mode-tile.test.tsx tests/unit/game-match-harness.test.ts tests/unit/motion-audit.test.ts tests/unit/route-revalidate.test.ts
./node_modules/.bin/tsc --noEmit
CI=true ./node_modules/.bin/next lint --max-warnings=0
```

- [ ] **Step 2 — prove the inertness.** Run every mode's suite and confirm **nothing** changed for
      the seven packs without a `season`:

```bash
./node_modules/.bin/vitest run tests/unit/chemistry-replay.test.ts tests/unit/budget-session.test.ts tests/unit/game-match-session.test.ts tests/unit/game-play-container.test.tsx
```

- [ ] **Step 3 — TASKS.md**: record PR 1 under TASK-1811 — what shipped, and that the **season hub
      surface is deliberately absent pending the owner's 30-concept ritual**. Leave the ticket
      `📋 Backlog`; it is not done until the mode is playable.
- [ ] **Step 4 — CLAUDE.md**: add the rule that a season run stores **seed + squad + results
      without events**, and that the reason is immutability against engine drift, not speed.
- [ ] **Step 5 — branch → PR → CI green by job name → squash-merge.** ⚠️ Say in the PR that there
      is no UI and why, and that production cannot be click-verified from an automated session.

---

## What this PR deliberately does NOT do

- ⛔ **No season hub, table view or matchweek control** — that surface needs the owner's
  30-concept ritual first, built PLAYABLE against these real rules.
- No ghost of the real season (its own PR), no Survival objective, no era-authentic substitution
  rules, no rotation or injuries.
- No change to the draft, the engine, or any other pack.
