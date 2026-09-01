# Engine calibration — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Make the match engine respond to squad quality, so that a better side reliably
outperforms a worse one and a 38-week league table looks like a real one — without making a
single match boring.

**Architecture:** One line changes. `goalChance` derives its edge from a bounded ratio
`A / (A + D)`; it becomes `A^p / (A^p + D^p)`, where **`p = 1` is exactly today's formula**, so
this is a strict generalisation behind one exported constant. Everything else in this plan is
measurement, re-fitting the constants that were calibrated against the old behaviour, and
proving the shipped modes still play well.

**Tech stack:** the existing one. No new dependencies.

**Order matters:** the equivalence refactor lands first (Task 2) so the exponent has a home
before it has a value; the fit (Task 3) comes before the value is set (Task 4); `CHEM_EFFECT` is
re-fitted (Tasks 5–6) only after the engine is final, because it is fitted _against_ the engine.

⛔ **Read the ticket first** — `TASKS.md` → `### TASK-1844` carries every number this plan
assumes, including the control that says the archive's widest squad gap is currently worth
~0.05–0.08 points per game.

---

### Task 1: The spec document

**Files:** create `docs/superpowers/specs/2026-09-01-task-1844-engine-calibration-design.md`

- [ ] **Step 1 — write §0 "What was measured before designing".** Copy the measured tables out
      of the TASK-1844 ticket verbatim: the six-season real-squad comparison (points SD 8.7 v
      16.2, gap 32.7 v 62.0, champion 68.2 v 87.6, champion win rate 51.0% v 69.9%, ρ 0.348),
      the 600-match control including the play-itself baseline (40.8 / 22.8 / 36.3 against
      38.2 / 22.7 / 39.2), and the p-sweep table. State the 34-season targets: champion 87.6,
      bottom 25.6, gap 62.0, SD 16.2, champion win rate 69.9%.
- [ ] **Step 2 — write §1 "The model".** `edge = A^p / (A^p + D^p)`. Record the three properties
      that make it safe: equal sides give exactly 0.5 at every p; the value stays in (0,1); and
      `p = 1` reproduces the shipped formula exactly.
- [ ] **Step 3 — write §2 "What must not move"**, listing the existing gates by file:
      `tests/unit/game-match-harness.test.ts` (draw rate 15–35%, first-scorer-wins 55–78%,
      comebacks > 7%, goals/match 2.0–3.4, events/match > 15, latest goal > 90) and
      `tests/unit/game-minute-model.test.ts`. These are the "one-sided matches are boring" guard
      — a steeper edge is only acceptable while every one of them still passes.
- [ ] **Step 4 — leave §3 and §4 as headed stubs** ("The fitted exponent", "Re-fitting
      CHEM_EFFECT"), to be filled by Tasks 3 and 5 with their measured tables.
- [ ] **Step 5 — commit.**

```bash
git add docs/superpowers/specs/2026-09-01-task-1844-engine-calibration-design.md
git commit -m "TASK-1844: the calibration spec, with the measurements that opened it"
```

---

### Task 2: `POWER_EXPONENT` — the seam, at p = 1 (no behaviour change)

**Files:** modify `src/features/game/domain/minute-model.ts`;
modify `tests/unit/game-minute-model.test.ts`

⚠️ This task must change **no** results. It introduces the constant at its identity value so the
whole suite proves the refactor is inert before any value moves.

- [ ] **Step 1 — write the failing tests.** Append to `tests/unit/game-minute-model.test.ts`:

```ts
import { POWER_EXPONENT, goalChance, minuteWeight } from "@/features/game/domain/minute-model";

describe("the power exponent (TASK-1844)", () => {
  it("⛔ EQUAL SIDES are exactly even at any exponent — the property that keeps calibrateK valid", () => {
    for (const p of [1, 2, 8, 12, 30]) {
      const edge = goalChance(80, 80, 45, 1, p) / minuteWeight(45);
      expect(edge).toBeCloseTo(0.5, 12);
    }
  });

  it("is MONOTONE — a bigger exponent rewards the stronger side more", () => {
    const at = (p: number) => goalChance(92, 70, 45, 1, p) / minuteWeight(45);
    expect(at(1)).toBeGreaterThan(0.5);
    expect(at(4)).toBeGreaterThan(at(1));
    expect(at(12)).toBeGreaterThan(at(4));
  });

  it("stays BOUNDED in (0,1) even at absurd inputs", () => {
    const edge = goalChance(100, 1, 45, 1, 40) / minuteWeight(45);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
  });

  it("⚠️ p = 1 reproduces the shipped ratio EXACTLY — the refactor is inert", () => {
    for (const [a, d] of [
      [92, 70],
      [50, 50],
      [70, 92],
      [88, 61],
    ]) {
      const legacy = a / (a + d);
      expect(goalChance(a, d, 45, 1, 1) / minuteWeight(45)).toBeCloseTo(legacy, 12);
    }
  });

  it("defaults to POWER_EXPONENT when none is passed", () => {
    expect(goalChance(92, 70, 45, 1)).toBeCloseTo(goalChance(92, 70, 45, 1, POWER_EXPONENT), 12);
  });
});
```

- [ ] **Step 2 — run, watch it fail.**

Run: `./node_modules/.bin/vitest run tests/unit/game-minute-model.test.ts`
Expected: FAIL — `POWER_EXPONENT` is not exported.

- [ ] **Step 3 — implement.** In `src/features/game/domain/minute-model.ts`, replace `goalChance`
      and thread the exponent through `chanceRate`:

```ts
/**
 * How sharply a rating advantage converts into chances (TASK-1844).
 *
 * ⛔ `p = 1` is the ORIGINAL formula — `attack / (attack + oppDefense)` — and it was measured
 * to make the archive's widest squad gap worth ~0.05 points per game, which turned a 38-week
 * league table into noise. See the spec for the fit against 34 real seasons.
 *
 * ⚠️ Equal sides give exactly 0.5 at EVERY exponent, which is what keeps `calibrateK` (and the
 * season-authentic goals-per-match calibration built on it) valid without a second fit.
 */
export const POWER_EXPONENT = 1;

/** Per-minute goal probability for a side: attack-vs-defense edge × hazard × k. */
export function goalChance(
  attack: number,
  oppDefense: number,
  minute: number,
  k: number,
  exponent: number = POWER_EXPONENT,
): number {
  const a = Math.pow(Math.max(attack, 1), exponent);
  const d = Math.pow(Math.max(oppDefense, 1), exponent);
  const edge = a / (a + d || 1);
  return k * edge * minuteWeight(minute);
}

export function chanceRate(
  attack: number,
  oppDefense: number,
  minute: number,
  k: number,
  exponent: number = POWER_EXPONENT,
): number {
  return goalChance(attack, oppDefense, minute, k, exponent) / CONVERSION;
}
```

- [ ] **Step 4 — green, and prove inertness.** Run the engine suites and confirm **every one**
      still passes unchanged, because `p` is still 1:

```bash
./node_modules/.bin/vitest run tests/unit/game-minute-model.test.ts tests/unit/game-match-harness.test.ts tests/unit/game-simulate.test.ts tests/unit/game-match-replay.test.ts tests/unit/chemistry-modifier.test.ts
```

Expected: PASS, all files.

- [ ] **Step 5 — commit.**

```bash
git add src/features/game/domain/minute-model.ts tests/unit/game-minute-model.test.ts
git commit -m "TASK-1844: give the goal edge a tunable exponent, at its identity value"
```

---

### Task 3: Fit the exponent against real tables

**Files:** create `tests/unit/zz-fit-exponent.test.ts` (**throwaway** — deleted in Task 8)

⚠️ The value is fitted against **real seasons played by their real squads**, scored on the tables
that actually happened — never against taste. The sweep in the ticket used 6 seasons × 3 seeds;
this one widens it, and adds the match-quality gates so a value that wins the table but ruins the
matches is rejected.

- [ ] **Step 1 — write the sweep.** It drives the real engine through `simulate`, one league
      season per (season, seed, p):

```ts
import { describe, expect, it } from "vitest";
import { loadStandings } from "@/data/loaders";
import { assembleGameTeam } from "@/features/game/adapter/lineup";
import { __setPowerExponent } from "@/features/game/domain/minute-model";
import { simulate } from "@/features/game/domain/simulate";
import type { GameTeam } from "@/features/game/domain/team";

const SEASONS = [1994, 1997, 2000, 2003, 2006, 2009, 2012, 2015, 2018, 2021];
const EXPONENTS = [1, 8, 10, 12, 14, 16, 20];
const SEEDS = 4;

function fixtures(n: number): Array<Array<[number, number]>> {
  const ids = [...Array(n).keys()];
  const weeks: Array<Array<[number, number]>> = [];
  const rot = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const week: Array<[number, number]> = [];
    const order = [ids[0]!, ...rot];
    for (let i = 0; i < n / 2; i++)
      week.push(r % 2 === 0 ? [order[i]!, order[n - 1 - i]!] : [order[n - 1 - i]!, order[i]!]);
    weeks.push(week);
    rot.unshift(rot.pop()!);
  }
  return [...weeks, ...weeks.map((w) => w.map(([a, b]) => [b, a] as [number, number]))];
}

function spearman(a: number[], b: number[]): number {
  const n = a.length;
  const rank = (xs: number[]) => {
    const idx = xs.map((v, i) => [v, i] as const).sort((p, q) => q[0] - p[0]);
    const r = new Array(n).fill(0);
    idx.forEach(([, i], k) => (r[i] = k + 1));
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  return 1 - (6 * ra.reduce((acc, v, i) => acc + (v - rb[i]!) ** 2, 0)) / (n * (n * n - 1));
}

describe("fit the exponent", () => {
  it("sweeps p against the tables that actually happened", async () => {
    const loaded: Array<{ teams: GameTeam[]; realPts: number[]; target: number }> = [];
    for (const season of SEASONS) {
      const rows = await loadStandings(season);
      if (rows == null || rows.length !== 20) continue;
      const teams: GameTeam[] = [];
      let ok = true;
      for (const r of rows) {
        const t = await assembleGameTeam(r.teamId, season);
        if (t == null) {
          ok = false;
          break;
        }
        teams.push(t);
      }
      if (!ok) continue;
      loaded.push({
        teams,
        realPts: rows.map((r) => r.points),
        target: rows.reduce((a, r) => a + r.goalsFor, 0) / (rows.length * (rows.length - 1)),
      });
    }
    expect(loaded.length).toBeGreaterThan(5);
    const sched = fixtures(20);

    for (const p of EXPONENTS) {
      __setPowerExponent(p);
      const rho: number[] = [],
        sd: number[] = [],
        champ: number[] = [],
        gap: number[] = [];
      let draws = 0,
        played = 0,
        goals = 0;
      for (const { teams, realPts, target } of loaded) {
        for (let rep = 0; rep < SEEDS; rep++) {
          const pts = new Array(20).fill(0);
          const gd = new Array(20).fill(0);
          sched.forEach((week, w) => {
            for (const [h, a] of week) {
              const r = simulate({
                home: teams[h]!,
                away: teams[a]!,
                seed: w * 1009 + h * 17 + rep * 104729 + p * 7919,
                targetGoalsPerMatch: target,
              });
              played++;
              goals += r.score.home + r.score.away;
              gd[h] += r.score.home - r.score.away;
              gd[a] += r.score.away - r.score.home;
              if (r.score.home > r.score.away) pts[h] += 3;
              else if (r.score.away > r.score.home) pts[a] += 3;
              else {
                pts[h] += 1;
                pts[a] += 1;
                draws++;
              }
            }
          });
          rho.push(spearman(pts, realPts));
          const mean = pts.reduce((x: number, y: number) => x + y, 0) / 20;
          sd.push(Math.sqrt(pts.reduce((x: number, y: number) => x + (y - mean) ** 2, 0) / 20));
          const order = [...Array(20).keys()].sort((x, y) => pts[y] - pts[x] || gd[y] - gd[x]);
          champ.push(pts[order[0]!]);
          gap.push(pts[order[0]!] - pts[order[19]!]);
        }
      }
      const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
      console.log(
        `p=${p}: rho=${avg(rho).toFixed(3)} champion=${avg(champ).toFixed(1)} (87.6)` +
          ` gap=${avg(gap).toFixed(1)} (62.0) SD=${avg(sd).toFixed(1)} (16.2)` +
          ` drawRate=${(draws / played).toFixed(3)} (.15-.35) goals=${(goals / played).toFixed(2)} (2.0-3.4)`,
      );
    }
    __setPowerExponent(1);
  }, 3_600_000);
});
```

- [ ] **Step 2 — add the temporary setter.** In `minute-model.ts`, replace
      `export const POWER_EXPONENT = 1;` with:

```ts
export let POWER_EXPONENT = 1;
/** ⛔ CALIBRATION ONLY (TASK-1844). Deleted in Task 8 — grep before shipping. */
export function __setPowerExponent(p: number): void {
  POWER_EXPONENT = p;
}
```

⚠️ A mutable engine global must **never** ship — Task 8 deletes it and greps to prove it.

- [ ] **Step 3 — run the sweep.**

Run: `./node_modules/.bin/vitest run tests/unit/zz-fit-exponent.test.ts`
Expected: one `p=…` line per exponent. Takes several minutes.

- [ ] **Step 4 — choose `p`.** Pick the value that gets **closest to the real table on SD and
      gap** while keeping `drawRate` inside 0.15–0.35 and `goals` inside 2.0–3.4. If the best
      table-fit breaks a match gate, prefer the largest `p` that keeps every gate — the single
      match is the shipped product. Record the whole table in spec §3, and state the chosen
      value with the reason.
- [ ] **Step 5 — commit the spec update only** (the sweep file is throwaway and stays
      uncommitted until Task 8 deletes it).

```bash
git add docs/superpowers/specs/2026-09-01-task-1844-engine-calibration-design.md
git commit -m "TASK-1844: the fitted exponent, swept against 10 real seasons"
```

---

### Task 4: Set the fitted exponent and re-run every engine gate

**Files:** modify `src/features/game/domain/minute-model.ts`

- [ ] **Step 1 — set the value** chosen in Task 3, restoring it to a `const`:

```ts
export const POWER_EXPONENT = 12; // ← the value fitted in Task 3; keep the setter until Task 8
```

⚠️ Keep `__setPowerExponent` for now — Task 5's sweep does not need it, but Task 8 removes both
the setter and this note together.

- [ ] **Step 2 — run the match harness, which is the "still fun to watch" gate.**

Run: `./node_modules/.bin/vitest run tests/unit/game-match-harness.test.ts`
Expected: PASS. If `drawRate`, `firstScorerWins` or `comebacks` now fail, the exponent is too
steep — return to Task 3 Step 4 and take the next value down. **Do not widen the harness bands
to fit the exponent**; they are the reason the harness exists.

- [ ] **Step 3 — run every engine-adjacent suite.**

```bash
./node_modules/.bin/vitest run tests/unit/game-simulate.test.ts tests/unit/game-match-drama.test.ts tests/unit/game-match-replay.test.ts tests/unit/game-match-stream.test.ts tests/unit/game-match-session.test.ts tests/unit/game-minute-model.test.ts tests/unit/game-team-power.test.ts tests/unit/game-matchup.test.ts
```

Expected: PASS. ⚠️ A **replay** failure here is expected and is NOT a bug in this change — a
saved match replays from its seed through the engine, so changing the engine changes what an old
seed produces. Confirm the failures are golden-value assertions, not structural ones, and
re-baseline those goldens in the same commit.

- [ ] **Step 4 — commit.**

```bash
git add src/features/game/domain/minute-model.ts tests/unit
git commit -m "TASK-1844: fit the goal edge to real league dispersion"
```

---

### Task 5: Re-fit `CHEM_EFFECT` against the new engine

**Files:** create `tests/unit/zz-refit-chem.test.ts` (**throwaway** — deleted in Task 8)

⛔ **This is not optional.** `CHEM_EFFECT = 0.08` was fitted when a rating point bought almost
nothing, which is exactly what Task 4 changed. Chemistry costs a measured ~6.8 rating points per
player; once that cost is real, 0.08 no longer repays it.

- [ ] **Step 1 — write the sweep.** A chem-greedy XI against a rating-greedy XI over the real
      `crossEra` pool, ≥ 3,000 seeded matches per constant. `chemistryModifier(scores, effect)`
      already takes the constant as a parameter, so no setter is needed:

```ts
import { describe, expect, it } from "vitest";
import { buildPool } from "@/features/game/adapter/pool";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { chemistry } from "@/features/game/domain/chemistry";
import { chemistryModifier } from "@/features/game/domain/chemistry-modifier";
import { roomDeals } from "@/features/game/domain/draft-room";
import { formationByName } from "@/features/game/domain/formation";
import { CHEMISTRY_PACK, type PoolSpec } from "@/features/game/domain/rule-packs";
import { simulate } from "@/features/game/domain/simulate";
import { makeGameTeam } from "@/features/game/domain/team";

const SPEC = CHEMISTRY_PACK.pool as Extract<PoolSpec, { kind: "crossEra" }>;
const SHAPE = formationByName("4-4-2 Flat");
const EFFECTS = [0, 0.08, 0.15, 0.25, 0.4];
const ROOMS = 30;
const MATCHES_PER_ROOM = 100; // 30 x 100 = 3,000 per constant

/** The coach who steers for links, slot by slot, seeing only what he has placed. */
function chemXi(hands: PoolCard[][]): PoolCard[] {
  const xi: PoolCard[] = [];
  for (const hand of hands) {
    xi.push(
      hand.reduce((best, c) =>
        chemistry([...xi, c], SHAPE) > chemistry([...xi, best], SHAPE) ? c : best,
      ),
    );
  }
  return xi;
}
/** The coach who only ever takes the best card. */
const ratingXi = (hands: PoolCard[][]) =>
  hands.map((h) =>
    h.reduce((x, c) => ((c.ratings?.overall ?? 0) > (x.ratings?.overall ?? 0) ? c : x)),
  );

describe("re-fit CHEM_EFFECT", () => {
  it("sweeps the constant against the recalibrated engine", async () => {
    const pool = await buildPool(SPEC);
    const rooms: Array<{ chem: PoolCard[]; rate: PoolCard[] }> = [];
    for (let seed = 1; rooms.length < ROOMS && seed < 200; seed++) {
      const hands = roomDeals(pool, SHAPE, seed * 7919, { handSize: 5, onePerPlayer: true });
      if (hands.some((h) => h.length === 0)) continue;
      rooms.push({ chem: chemXi(hands), rate: ratingXi(hands) });
    }
    expect(rooms).toHaveLength(ROOMS);

    for (const effect of EFFECTS) {
      let chemWins = 0,
        rateWins = 0,
        draws = 0,
        played = 0;
      rooms.forEach((room, i) => {
        const home = makeGameTeam(1, "Chem", 2020, SHAPE, room.chem);
        const away = makeGameTeam(2, "Rating", 2020, SHAPE, room.rate);
        const scores = { home: chemistry(room.chem, SHAPE), away: chemistry(room.rate, SHAPE) };
        for (let m = 0; m < MATCHES_PER_ROOM; m++) {
          const r = simulate({
            home,
            away,
            seed: i * 100003 + m * 31 + Math.round(effect * 1000),
            targetGoalsPerMatch: 2.7,
            modifiers: [chemistryModifier(scores, effect)],
          });
          played++;
          if (r.score.home > r.score.away) chemWins++;
          else if (r.score.away > r.score.home) rateWins++;
          else draws++;
        }
      });
      const pct = (x: number) => ((x / played) * 100).toFixed(1);
      console.log(
        `effect ${effect}: chem ${pct(chemWins)}%  rating ${pct(rateWins)}%  draw ${pct(draws)}%  (n=${played})`,
      );
    }
  }, 3_600_000);
});
```

⚠️ The chem XI is the WEAKER side on ratings by design (measured ~6.8 points per player); the
constant that makes the two win about equally often is the answer.

- [ ] **Step 2 — run it.**

Run: `./node_modules/.bin/vitest run tests/unit/zz-refit-chem.test.ts`
Expected: a win-rate table per constant.

- [ ] **Step 3 — choose the constant** where the chemistry XI and the rating XI win **about
      equally often**, tilted about a point toward chemistry — the same target the original fit
      used. ⚠️ At 240 matches a 1–3 point difference is pure noise; that error is recorded in the
      chemistry spec and must not be repeated.
- [ ] **Step 4 — record the new table in spec §4**, alongside the old one, and say plainly that
      the old constant was fitted against a different engine.
- [ ] **Step 5 — commit the spec.**

---

### Task 6: Land the new `CHEM_EFFECT`

**Files:** modify `src/features/game/domain/chemistry-modifier.ts`;
modify `tests/unit/chemistry-modifier.test.ts`

- [ ] **Step 1 — update the pinned test first**, since it asserts the literal:

```ts
it("⚠️ the constant is MEASURED and pinned — a nudge must be deliberate", () => {
  expect(CHEM_EFFECT).toBe(/* the value fitted in Task 5 */);
});
```

- [ ] **Step 2 — run, watch it fail.**

Run: `./node_modules/.bin/vitest run tests/unit/chemistry-modifier.test.ts`
Expected: FAIL — received 0.08.

- [ ] **Step 3 — set the constant** in `chemistry-modifier.ts` and **rewrite its doc comment**.
      The existing comment states "the effect needed is SMALL" and explains it by the bounded
      ratio — that explanation is now historical. Keep it as the trail, marked superseded, and
      add the new fit beneath it.
- [ ] **Step 4 — green.**

```bash
./node_modules/.bin/vitest run tests/unit/chemistry-modifier.test.ts tests/unit/chemistry-depth.test.ts tests/unit/chemistry.test.ts tests/unit/chemistry-replay.test.ts
```

- [ ] **Step 5 — commit.**

```bash
git add src/features/game/domain/chemistry-modifier.ts tests/unit/chemistry-modifier.test.ts
git commit -m "TASK-1844: re-fit CHEM_EFFECT against the recalibrated engine"
```

---

### Task 7: Prove the shipped modes still play well

- [ ] **Step 1 — the full targeted battery**, plus the two global guards a targeted battery
      misses (the `motion-audit` lesson from TASK-1810):

```bash
./node_modules/.bin/vitest run tests/unit/game-match-harness.test.ts tests/unit/game-rating-harness.test.ts tests/unit/route-revalidate.test.ts tests/unit/motion-audit.test.ts
./node_modules/.bin/tsc --noEmit
CI=true ./node_modules/.bin/next lint --max-warnings=0
```

- [ ] **Step 2 — REAL BROWSER, and this is the point of the task.** Start `~/pq-dev.sh`
      (`TEST_MSW=1`), warm each route (cold compiles run to ~2 minutes), then play a full match
      through to full time in **four modes chosen to cover the distinct opponent policies**,
      because that is what decides how lopsided a fixture can be — not the draft rules:
  - `/game/draft` — the canonical loop, **no** declared policy (the shipped random draw);
  - `/game/legacy/40` — `opponent: "best"`, which fields the strongest possible XI and is
    therefore **the most likely mode to produce a blowout** under a steeper exponent;
  - `/game/chemistry` — carries the modifier re-fitted in Task 6, so it proves the two changes
    compose;
  - `/game/budget` — `policy: "budget"`, where both sides are capped and the fixture should stay
    close.

  ⛔ Watch for the failure this change could introduce: a strong side beating a weak one **6–0
  every time**. Record every scoreline. A blowout is fine; a blowout every match is not.
  ⚠️ The remaining four live modes (`chaos`, `captains`, `nation`, `daily`) reuse one of these
  four policies, so they are covered by the unit battery rather than by hand — say so in the PR
  instead of quietly skipping them.

- [ ] **Step 3 — the discrimination check that motivated the ticket.** Re-run the season
      measurement from the ticket at the shipped exponent and confirm a simulated league now
      reaches roughly real dispersion (SD near 16, gap near 62). Record it in spec §3.
- [ ] **Step 4 — commit** any fixes the browser pass turned up.

---

### Task 8: Clean up, document, ship

- [ ] **Step 1 — delete the temporary setter and both throwaway sweeps**, then prove it:

```bash
rm -f tests/unit/zz-fit-exponent.test.ts tests/unit/zz-refit-chem.test.ts
grep -rn "__setPowerExponent\|export let POWER_EXPONENT" src tests   # must return NOTHING
```

⛔ If that grep hits, a mutable engine global is about to ship. Fix before continuing.

- [ ] **Step 2 — `TASKS.md`**: flip TASK-1844 to `✅ Done` in **both** the board row and the
      detail header, record the shipped exponent and the new `CHEM_EFFECT`, and **unblock
      [TASK-1811](#task-1811)** — remove its "BLOCKED" note and leave its agreed cut in place.
- [ ] **Step 3 — `CLAUDE.md`**: add a game-section rule stating that the engine's response to a
      rating gap is a **fitted constant** (`POWER_EXPONENT`), that equal sides are 0.5 at every
      exponent which is what keeps `calibrateK` valid, and that **any constant fitted against
      match outcomes must be re-fitted when this moves** — naming `CHEM_EFFECT` as the case that
      proved it.
- [ ] **Step 4 — branch → PR → CI green by job name → squash-merge.** ⚠️ Production cannot be
      click-verified from an automated session (our own JA4 firewall 403s it), so say so in the
      PR and ask the owner for the final pass.

---

## Risks this plan is deliberately guarding

- ⛔ **The engine change invalidates saved matches and share codes.** A code carries a seed, and
  the same seed now produces a different match. Nothing can prevent that; Task 4 Step 3 makes it
  an expected, understood re-baseline rather than a surprise in CI.
- ⛔ **A mutable `POWER_EXPONENT` must not ship** — Task 8 Step 1 greps for it.
- ⚠️ **Do not widen the match-harness bands to accommodate a steeper exponent.** They encode what
  a watchable match looks like; if the fit breaks them, the fit is wrong.
- ⚠️ **`CHEM_EFFECT` is fitted against the engine, so it moves with it.** Any future constant
  fitted by outcome inherits the same dependency.
