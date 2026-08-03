# TASK-1803 — Deterministic Seeded Match Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure, deterministic match engine: `simulate(setup) → MatchResult` runs a minute loop weighing team Attack vs Defense power (from TASK-1802 ratings), built as a **pure reducer over `MatchState` with a composable modifier stack**, byte-reproducible from `(setup, seed)`, <100ms. Scope = **lean vertical**; calibration = **season-authentic**. See the approved design: `docs/superpowers/specs/2026-08-03-task-1803-match-engine-design.md`.

**Architecture:** All logic is pure `domain/` (no I/O — mulberry32 PRNG is the sole entropy source). A thin `server-only` `adapter/match.ts` derives the season goal rate from standings and offers a real-data smoke path. Baseline modifiers (stamina, momentum) prove the seam; later tickets (1805 counters, 1814 traits) push more modifiers via `setup.modifiers` with no engine change.

**Tech Stack:** TypeScript (strict), Vitest (`tests/unit/`, happy-dom, `server-only` stubbed), `@/`→`src/`. WSL via `wsl -d Ubuntu -- bash -lc '…'`.

## Toolchain notes (WSL / PitchIQ)

- Pin node PATH before test/typecheck: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"`.
- Run binaries directly: `./node_modules/.bin/vitest run <path>`, `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/eslint <paths>`.
- Commit with `git commit --no-verify`. Branch `feat/task-1803-match-engine`; never `main`.

## Data facts (from exploration)

- No PRNG exists → build mulberry32. Real timing data is `data/events-<season>.json` (goal + card minutes; peak 45–50, spike 90+). Real rate ≈ 2.7 goals/match = `2 · Σ goalsFor / Σ played` from `loadStandings(season)`.
- `MatchEventRaw` already exists in `@/data/schemas` — the engine's type is `MatchEvent` (game domain), no collision.
- Domain ready: `GameTeam { teamId, name, season, formation, players: GamePlayer[] }`, `GamePlayer.ratings: PlayerRatings | null` (`{attack,creation,defense,physical,discipline,overall}` 0–100), `weightsFor(role)` from `rating-weights.ts`. Adapter `loadRatedSquad(teamId, season) → GamePlayer[] | null`, `makeGameTeam(...)`, `loadStandings(season) → Standing[] | null`.

## File Structure

**New — `src/features/game/domain/`:** `rng.ts`, `match-types.ts`, `team-power.ts`, `modifiers.ts`, `minute-model.ts`, `simulate.ts`.
**New — `src/features/game/adapter/`:** `match.ts`.
**Modify:** `domain/index.ts`, `adapter/index.ts` (barrels), `TASKS.md` (1803 → Done).
**New tests:** `tests/unit/game-rng.test.ts`, `game-team-power.test.ts`, `game-modifiers.test.ts`, `game-minute-model.test.ts`, `game-simulate.test.ts`, `game-adapter-match.test.ts`.

---

## Task 1: Seeded PRNG (mulberry32)

**Files:** Create `src/features/game/domain/rng.ts`; Test `tests/unit/game-rng.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-rng.test.ts
import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/features/game/domain/rng";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0, 1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("diverges for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL** (module missing)

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-rng.test.ts'`

- [ ] **Step 3: Implement**

```ts
// src/features/game/domain/rng.ts
/** Deterministic PRNG → () => [0,1). The sole entropy source in the match engine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Run test — expect PASS (3)**
- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/rng.ts tests/unit/game-rng.test.ts && git commit --no-verify -m "feat(game): mulberry32 seeded PRNG (TASK-1803)"'
```

---

## Task 2: Engine types

**Files:** Create `src/features/game/domain/match-types.ts`

Types only — verified by typecheck + downstream use.

- [ ] **Step 1: Write the file**

```ts
// src/features/game/domain/match-types.ts
import type { GameTeam } from "./team";

export type Side = "home" | "away";
export type MatchEventKind = "kickoff" | "goal" | "card" | "halftime" | "fulltime";

export interface MatchEvent {
  minute: number;
  kind: MatchEventKind;
  side?: Side; // goal / card
  playerId?: number; // scorer / booked
  card?: "yellow" | "red";
}

/** 0–100 aggregate team strength. TASK-1805 extends this to the "record" opponent. */
export interface TeamPower {
  attack: number;
  defense: number;
  aggression: number;
}

export interface MinuteWeights {
  attack: number;
  defense: number;
  foul: number;
  card: number;
}

export interface SideState {
  power: TeamPower;
  score: number;
  stamina: number; // 1 → decays
  momentum: number; // -1..1
}

export interface MatchState {
  minute: number;
  home: SideState;
  away: SideState;
  events: MatchEvent[];
}

export interface MinuteContext {
  state: MatchState;
  side: Side;
}

/** A pure weight contributor. The seeded PRNG still rolls outcomes → deterministic. */
export type Modifier = (ctx: MinuteContext) => Partial<MinuteWeights>;

export interface MatchSetup {
  home: GameTeam;
  away: GameTeam;
  seed: number;
  targetGoalsPerMatch: number; // season-authentic, from the adapter
  modifiers?: Modifier[]; // layered after the baseline set
}

export interface MatchResult {
  score: { home: number; away: number };
  events: MatchEvent[];
  seed: number;
}
```

- [ ] **Step 2: Verify compile**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/tsc --noEmit'`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/match-types.ts && git commit --no-verify -m "feat(game): match engine types (TASK-1803)"'
```

---

## Task 3: Team power aggregation

**Files:** Create `src/features/game/domain/team-power.ts`; Test `tests/unit/game-team-power.test.ts`

`powerOf` aggregates the XI's ratings weighted by each player's role (`weightsFor` from 1802): forwards drive attack, defenders/GK drive defense.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-team-power.test.ts
import { describe, expect, it } from "vitest";
import type { GamePlayer } from "@/features/game/domain/player";
import type { PlayerRatings } from "@/features/game/domain/ratings";
import { makeGameTeam } from "@/features/game/domain/team";
import { powerOf } from "@/features/game/domain/team-power";
import type { PlayerRole } from "@/data/schemas";

function p(role: PlayerRole, r: Partial<PlayerRatings>): GamePlayer {
  return {
    cardId: "1@2020", playerId: 1, season: 2020, name: "P", role, altRoles: [],
    foot: null, height: null, provenance: null,
    ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 50, ...r },
  };
}
const team = (players: GamePlayer[]) =>
  makeGameTeam(1, "T", 2020, { name: "", season: 2020, slots: [] }, players);

describe("powerOf", () => {
  it("a forward line yields high attack", () => {
    const power = powerOf(team([p("CF", { attack: 95, creation: 85 }), p("CF", { attack: 90, creation: 80 })]));
    expect(power.attack).toBeGreaterThan(75);
  });

  it("a back line yields high defense", () => {
    const power = powerOf(team([p("CB", { defense: 95, physical: 85 }), p("CB", { defense: 90, physical: 80 })]));
    expect(power.defense).toBeGreaterThan(75);
  });

  it("aggression is the inverse of mean discipline", () => {
    const power = powerOf(team([p("CM", { discipline: 20 }), p("CM", { discipline: 40 })]));
    expect(power.aggression).toBe(70); // 100 - mean(30)
  });

  it("skips players with null ratings without crashing", () => {
    const nullRated = { ...p("CF", {}), ratings: null } as GamePlayer;
    expect(() => powerOf(team([p("CF", { attack: 80 }), nullRated]))).not.toThrow();
  });

  it("returns neutral power for an empty XI", () => {
    expect(powerOf(team([]))).toEqual({ attack: 0, defense: 0, aggression: 50 });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/features/game/domain/team-power.ts
import type { GameTeam } from "./team";
import type { TeamPower } from "./match-types";
import { weightsFor } from "./rating-weights";

export function powerOf(team: GameTeam): TeamPower {
  const rated = team.players.filter((p) => p.ratings != null);
  if (rated.length === 0) return { attack: 0, defense: 0, aggression: 50 };

  let attNum = 0, attDen = 0, defNum = 0, defDen = 0, discSum = 0;
  for (const player of rated) {
    const w = weightsFor(player.role);
    const r = player.ratings!;
    const aw = w.attack + w.creation; // attacking role weight
    const dw = w.defense + w.physical; // defensive role weight
    attNum += aw * ((r.attack + r.creation) / 2);
    attDen += aw;
    defNum += dw * ((r.defense + r.physical) / 2);
    defDen += dw;
    discSum += r.discipline;
  }
  return {
    attack: Math.round(attDen > 0 ? attNum / attDen : 0),
    defense: Math.round(defDen > 0 ? defNum / defDen : 0),
    aggression: Math.round(100 - discSum / rated.length),
  };
}
```

- [ ] **Step 4: Run test — expect PASS (5)**
- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/team-power.ts tests/unit/game-team-power.test.ts && git commit --no-verify -m "feat(game): team power aggregation from ratings (TASK-1803)"'
```

---

## Task 4: Baseline modifiers + the fold

**Files:** Create `src/features/game/domain/modifiers.ts`; Test `tests/unit/game-modifiers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-modifiers.test.ts
import { describe, expect, it } from "vitest";
import {
  applyModifiers, baseWeights, BASELINE_MODIFIERS, momentumModifier, staminaModifier,
} from "@/features/game/domain/modifiers";
import type { MatchState, TeamPower } from "@/features/game/domain/match-types";

const power: TeamPower = { attack: 60, defense: 50, aggression: 40 };
function stateWith(over: Partial<{ stamina: number; momentum: number }>): MatchState {
  const side = { power, score: 0, stamina: over.stamina ?? 1, momentum: over.momentum ?? 0 };
  return { minute: 80, home: { ...side }, away: { ...side }, events: [] };
}

describe("baseWeights", () => {
  it("maps team power to per-minute weights", () => {
    expect(baseWeights(power)).toEqual({ attack: 60, defense: 50, foul: 40, card: 40 });
  });
});

describe("staminaModifier", () => {
  it("is neutral at full stamina", () => {
    expect(staminaModifier({ state: stateWith({ stamina: 1 }), side: "home" })).toEqual({ attack: -0 });
  });
  it("reduces attack as stamina drops", () => {
    const d = staminaModifier({ state: stateWith({ stamina: 0.5 }), side: "home" });
    expect(d.attack).toBeLessThan(0);
  });
});

describe("momentumModifier", () => {
  it("lifts attack with positive momentum", () => {
    expect(momentumModifier({ state: stateWith({ momentum: 1 }), side: "home" }).attack).toBeGreaterThan(0);
  });
  it("drops attack with negative momentum", () => {
    expect(momentumModifier({ state: stateWith({ momentum: -1 }), side: "home" }).attack).toBeLessThan(0);
  });
});

describe("applyModifiers", () => {
  it("folds deltas onto the base and clamps at 0", () => {
    const ctx = { state: stateWith({ stamina: 0, momentum: -1 }), side: "home" as const };
    const out = applyModifiers(baseWeights(power), ctx, BASELINE_MODIFIERS);
    expect(out.attack).toBeGreaterThanOrEqual(0);
    expect(out.attack).toBeLessThan(60); // fatigue + negative momentum pulled it down
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/features/game/domain/modifiers.ts
import type { MinuteContext, MinuteWeights, Modifier, TeamPower } from "./match-types";

export function baseWeights(power: TeamPower): MinuteWeights {
  return { attack: power.attack, defense: power.defense, foul: power.aggression, card: power.aggression };
}

/** Fatigue dulls the attack as stamina falls (1 → neutral). */
export const staminaModifier: Modifier = ({ state, side }) => {
  const s = state[side];
  return { attack: -s.power.attack * (1 - s.stamina) };
};

/** Recent-goal swing: momentum lifts attack, saps defensive focus. */
export const momentumModifier: Modifier = ({ state, side }) => {
  const m = state[side].momentum;
  return { attack: 12 * m, defense: -6 * m };
};

export const BASELINE_MODIFIERS: Modifier[] = [staminaModifier, momentumModifier];

export function applyModifiers(
  base: MinuteWeights,
  ctx: MinuteContext,
  modifiers: Modifier[],
): MinuteWeights {
  const out = { ...base };
  for (const mod of modifiers) {
    const d = mod(ctx);
    out.attack += d.attack ?? 0;
    out.defense += d.defense ?? 0;
    out.foul += d.foul ?? 0;
    out.card += d.card ?? 0;
  }
  out.attack = Math.max(0, out.attack);
  out.defense = Math.max(0, out.defense);
  out.foul = Math.max(0, out.foul);
  out.card = Math.max(0, out.card);
  return out;
}
```

- [ ] **Step 4: Run test — expect PASS (6)**. (Note: `-0` — `staminaModifier` at stamina 1 yields `{ attack: -0 }`; `toEqual({ attack: -0 })` matches. If the runner distinguishes `-0`/`0`, change the impl to `-s.power.attack * (1 - s.stamina) || 0` and the expectation to `{ attack: 0 }`.)
- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/modifiers.ts tests/unit/game-modifiers.test.ts && git commit --no-verify -m "feat(game): baseline modifiers (stamina, momentum) + fold (TASK-1803)"'
```

---

## Task 5: Minute model (hazard curve + calibration + selection)

**Files:** Create `src/features/game/domain/minute-model.ts`; Test `tests/unit/game-minute-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-minute-model.test.ts
import { describe, expect, it } from "vitest";
import type { GamePlayer } from "@/features/game/domain/player";
import {
  calibrateK, cardChance, goalChance, minuteWeight, pickBooked, pickScorer, weightedIndex,
} from "@/features/game/domain/minute-model";

describe("minuteWeight", () => {
  it("raises hazard in the stoppage windows", () => {
    expect(minuteWeight(45)).toBeGreaterThan(minuteWeight(20));
    expect(minuteWeight(90)).toBeGreaterThan(minuteWeight(60));
  });
});

describe("calibration", () => {
  it("k makes two equal teams score ≈ target total", () => {
    const target = 2.7;
    const k = calibrateK(target);
    let total = 0;
    for (let m = 1; m <= 90; m++) total += 2 * goalChance(50, 50, m, k); // both sides
    expect(total).toBeCloseTo(target, 5);
  });
  it("a stronger attack out-scores a weaker one at the same minute", () => {
    const k = calibrateK(2.7);
    expect(goalChance(90, 20, 50, k)).toBeGreaterThan(goalChance(20, 90, 50, k));
  });
});

describe("weightedIndex", () => {
  it("selects by cumulative weight", () => {
    expect(weightedIndex([1, 0, 0], 0.5)).toBe(0);
    expect(weightedIndex([0, 0, 1], 0.5)).toBe(2);
  });
  it("falls back to uniform when all weights are 0", () => {
    expect(weightedIndex([0, 0, 0], 0.99)).toBe(2);
  });
});

describe("selection", () => {
  const mk = (playerId: number, role: GamePlayer["role"]): GamePlayer => ({
    cardId: `${playerId}@2020`, playerId, season: 2020, name: `P${playerId}`, role, altRoles: [],
    foot: null, height: null, provenance: null,
    ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 50 },
  });
  it("pickScorer returns a player (or null for empty XI)", () => {
    expect(pickScorer([mk(1, "CF"), mk(2, "CB")], () => 0.1)).not.toBeNull();
    expect(pickScorer([], () => 0.1)).toBeNull();
  });
  it("pickBooked returns a player", () => {
    expect(pickBooked([mk(1, "CF"), mk(2, "CB")], () => 0.9)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/features/game/domain/minute-model.ts
import type { GamePlayer } from "./player";
import { weightsFor } from "./rating-weights";

const CARD_K = 0.03; // ~2.7 cards/match at mean aggression

/** Goal-hazard shape: gentle rise + stoppage spikes (45+, 90+), from the real histogram. */
export function minuteWeight(minute: number): number {
  let w = 0.85 + 0.3 * (minute / 90);
  if (minute >= 44 && minute <= 46) w += 0.4;
  if (minute >= 88) w += 0.6;
  return w;
}

function sumMinuteWeights(): number {
  let s = 0;
  for (let m = 1; m <= 90; m++) s += minuteWeight(m);
  return s;
}

/** Scale factor so two equal teams score ≈ target total goals over a match. */
export function calibrateK(targetGoalsPerMatch: number): number {
  return targetGoalsPerMatch / sumMinuteWeights();
}

/** Per-minute goal probability for a side: attack-vs-defense edge × hazard × k. */
export function goalChance(attack: number, oppDefense: number, minute: number, k: number): number {
  const edge = attack / (attack + oppDefense || 1);
  return k * edge * minuteWeight(minute);
}

export function cardChance(cardWeight: number): number {
  return CARD_K * (cardWeight / 100);
}

/** Cumulative weighted pick; r ∈ [0,1). Uniform fallback if all weights 0. */
export function weightedIndex(weights: number[], r: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return Math.min(weights.length - 1, Math.floor(r * weights.length));
  let acc = 0;
  const threshold = r * total;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (threshold < acc) return i;
  }
  return weights.length - 1;
}

function pickBy(players: GamePlayer[], rng: () => number, weight: (p: GamePlayer) => number): GamePlayer | null {
  if (players.length === 0) return null;
  return players[weightedIndex(players.map(weight), rng())];
}

/** Scorer: attacking roles + attack rating. */
export function pickScorer(players: GamePlayer[], rng: () => number): GamePlayer | null {
  return pickBy(players, rng, (p) => (weightsFor(p.role).attack + 0.1) * (p.ratings?.attack ?? 50));
}

/** Booked: defensive/physical roles slightly more likely. */
export function pickBooked(players: GamePlayer[], rng: () => number): GamePlayer | null {
  return pickBy(players, rng, (p) => weightsFor(p.role).defense + weightsFor(p.role).physical + 0.2);
}
```

- [ ] **Step 4: Run test — expect PASS (7)**.
- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/minute-model.ts tests/unit/game-minute-model.test.ts && git commit --no-verify -m "feat(game): minute hazard model + calibration + player selection (TASK-1803)"'
```

---

## Task 6: The simulation loop

**Files:** Create `src/features/game/domain/simulate.ts`; Test `tests/unit/game-simulate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-simulate.test.ts
import { describe, expect, it } from "vitest";
import type { GamePlayer } from "@/features/game/domain/player";
import type { PlayerRatings } from "@/features/game/domain/ratings";
import type { MatchSetup } from "@/features/game/domain/match-types";
import { simulate } from "@/features/game/domain/simulate";
import { makeGameTeam } from "@/features/game/domain/team";
import type { PlayerRole } from "@/data/schemas";

function xi(base: Partial<PlayerRatings>): GamePlayer[] {
  const roles: PlayerRole[] = ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CAM", "RW", "LW", "CF"];
  return roles.map((role, i) => ({
    cardId: `${i}@2020`, playerId: i, season: 2020, name: `P${i}`, role, altRoles: [],
    foot: null, height: null, provenance: null,
    ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 50, ...base },
  }));
}
const team = (name: string, base: Partial<PlayerRatings>) =>
  makeGameTeam(1, name, 2020, { name: "", season: 2020, slots: [] }, xi(base));
const setup = (seed: number, over: Partial<MatchSetup> = {}): MatchSetup => ({
  home: team("H", {}), away: team("A", {}), seed, targetGoalsPerMatch: 2.7, ...over,
});

describe("simulate", () => {
  it("is byte-reproducible for the same seed", () => {
    expect(simulate(setup(42))).toEqual(simulate(setup(42)));
  });

  it("diverges for different seeds", () => {
    expect(JSON.stringify(simulate(setup(1)))).not.toBe(JSON.stringify(simulate(setup(999))));
  });

  it("emits well-formed events (kickoff first, fulltime last, goals sum to score)", () => {
    const r = simulate(setup(7));
    expect(r.events[0].kind).toBe("kickoff");
    expect(r.events[r.events.length - 1].kind).toBe("fulltime");
    const homeGoals = r.events.filter((e) => e.kind === "goal" && e.side === "home").length;
    expect(homeGoals).toBe(r.score.home);
  });

  it("a far stronger team wins the majority of the time", () => {
    let strongWins = 0;
    for (let s = 0; s < 60; s++) {
      const r = simulate(setup(s, { home: team("Strong", { attack: 95, creation: 90, defense: 90, physical: 90 }), away: team("Weak", { attack: 20, creation: 20, defense: 20, physical: 20 }) }));
      if (r.score.home > r.score.away) strongWins++;
    }
    expect(strongWins).toBeGreaterThan(40); // > 2/3
  });

  it("scores near the season-authentic target across many seeds", () => {
    let total = 0;
    const N = 300;
    for (let s = 0; s < N; s++) {
      const r = simulate(setup(s));
      total += r.score.home + r.score.away;
    }
    const mean = total / N;
    expect(mean).toBeGreaterThan(2.7 - 0.9);
    expect(mean).toBeLessThan(2.7 + 0.9);
  });

  it("simulates a full match in under 100ms", () => {
    const s = setup(3);
    const t0 = performance.now();
    simulate(s);
    expect(performance.now() - t0).toBeLessThan(100);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/features/game/domain/simulate.ts
import { applyModifiers, baseWeights, BASELINE_MODIFIERS } from "./modifiers";
import type { MatchResult, MatchSetup, MatchState, Side } from "./match-types";
import { calibrateK, cardChance, goalChance, pickBooked, pickScorer } from "./minute-model";
import { powerOf } from "./team-power";
import { mulberry32 } from "./rng";

const FULL_TIME = 90;
const RED_CARD_SHARE = 0.08;

function staminaAt(minute: number): number {
  return 1 - 0.25 * (minute / FULL_TIME); // 1.0 → 0.75
}

export function simulate(setup: MatchSetup): MatchResult {
  const rng = mulberry32(setup.seed);
  const modifiers = [...BASELINE_MODIFIERS, ...(setup.modifiers ?? [])];
  const k = calibrateK(setup.targetGoalsPerMatch);
  const teams = { home: setup.home, away: setup.away };

  const state: MatchState = {
    minute: 0,
    home: { power: powerOf(setup.home), score: 0, stamina: 1, momentum: 0 },
    away: { power: powerOf(setup.away), score: 0, stamina: 1, momentum: 0 },
    events: [{ minute: 0, kind: "kickoff" }],
  };
  const sides: Side[] = ["home", "away"];

  for (let m = 1; m <= FULL_TIME; m++) {
    state.minute = m;
    state.home.stamina = staminaAt(m);
    state.away.stamina = staminaAt(m);
    state.home.momentum *= 0.9;
    state.away.momentum *= 0.9;

    for (const side of sides) {
      const opp: Side = side === "home" ? "away" : "home";
      const mine = applyModifiers(baseWeights(state[side].power), { state, side }, modifiers);
      const theirs = applyModifiers(baseWeights(state[opp].power), { state, side: opp }, modifiers);

      if (rng() < goalChance(mine.attack, theirs.defense, m, k)) {
        state[side].score += 1;
        const scorer = pickScorer(teams[side].players, rng);
        state.events.push({ minute: m, kind: "goal", side, playerId: scorer?.playerId });
        state[side].momentum = Math.min(1, state[side].momentum + 0.5);
        state[opp].momentum = Math.max(-1, state[opp].momentum - 0.3);
      }
      if (rng() < cardChance(mine.card)) {
        const booked = pickBooked(teams[side].players, rng);
        state.events.push({
          minute: m, kind: "card", side, playerId: booked?.playerId,
          card: rng() < RED_CARD_SHARE ? "red" : "yellow",
        });
      }
    }
    if (m === 45) state.events.push({ minute: 45, kind: "halftime" });
  }
  state.events.push({ minute: FULL_TIME, kind: "fulltime" });

  return {
    score: { home: state.home.score, away: state.away.score },
    events: state.events,
    seed: setup.seed,
  };
}
```

- [ ] **Step 4: Run test — expect PASS (6)**. If the "stronger team wins" or "mean near target" assertions are borderline, they are Monte-Carlo — widen the tolerance slightly (e.g. `> 38`, or `± 1.0`) rather than changing engine constants; note it in the commit. Do NOT weaken the determinism/well-formed assertions.
- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/simulate.ts tests/unit/game-simulate.test.ts && git commit --no-verify -m "feat(game): deterministic match simulation loop (TASK-1803)"'
```

---

## Task 7: Adapter — season goal rate + real-data smoke

**Files:** Create `src/features/game/adapter/match.ts`; Test `tests/unit/game-adapter-match.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-adapter-match.test.ts
import { describe, expect, it } from "vitest";
import { loadSeasonGoalRate, simulateSeasonMatch } from "@/features/game/adapter/match";

describe("loadSeasonGoalRate (committed standings)", () => {
  it("derives ~2.6–2.9 for a real season", async () => {
    const rate = await loadSeasonGoalRate(2020);
    expect(rate).toBeGreaterThan(2.4);
    expect(rate).toBeLessThan(3.0);
  });
  it("falls back to ~2.7 for an unsupported season", async () => {
    expect(await loadSeasonGoalRate(1800)).toBeCloseTo(2.7, 1);
  });
});

describe("simulateSeasonMatch (real rated squads)", () => {
  it("simulates a real fixture deterministically", async () => {
    const a = await simulateSeasonMatch(50, 42, 2020, 12345); // Man City vs Arsenal, 2020
    const b = await simulateSeasonMatch(50, 42, 2020, 12345);
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    expect(a!.score.home).toBeGreaterThanOrEqual(0);
  });
  it("returns null when a team is absent that season", async () => {
    expect(await simulateSeasonMatch(999999, 42, 2020, 1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/features/game/adapter/match.ts
import "server-only";
import { loadStandings } from "@/data/loaders";
import type { MatchResult } from "@/features/game/domain/match-types";
import { simulate } from "@/features/game/domain/simulate";
import { makeGameTeam } from "@/features/game/domain/team";
import { loadRatedSquad } from "./ratings";

const DEFAULT_RATE = 2.7;

/** Season-authentic goals/match = 2 · Σ goalsFor / Σ played. */
export async function loadSeasonGoalRate(season: number): Promise<number> {
  const standings = await loadStandings(season);
  if (!standings || standings.length === 0) return DEFAULT_RATE;
  const gf = standings.reduce((s, r) => s + r.goalsFor, 0);
  const played = standings.reduce((s, r) => s + r.played, 0);
  return played > 0 ? (2 * gf) / played : DEFAULT_RATE;
}

/**
 * Smoke path: rate both squads, take the first 11 as a rough XI (full draft/slot
 * assembly is TASK-1806), simulate at the season-authentic rate. null if a squad is absent.
 */
export async function simulateSeasonMatch(
  homeTeamId: number, awayTeamId: number, season: number, seed: number,
): Promise<MatchResult | null> {
  const [homeSquad, awaySquad] = await Promise.all([
    loadRatedSquad(homeTeamId, season),
    loadRatedSquad(awayTeamId, season),
  ]);
  if (!homeSquad || !awaySquad || homeSquad.length === 0 || awaySquad.length === 0) return null;

  const rate = await loadSeasonGoalRate(season);
  const emptyFormation = { name: "", season, slots: [] };
  const home = makeGameTeam(homeTeamId, "", season, emptyFormation, homeSquad.slice(0, 11));
  const away = makeGameTeam(awayTeamId, "", season, emptyFormation, awaySquad.slice(0, 11));
  return simulate({ home, away, seed, targetGoalsPerMatch: rate });
}
```

- [ ] **Step 4: Run test — expect PASS (4)**. If teamIds 50/42 aren't both in `standings-2020.json`, open `data/standings-2020.json`, pick two present teamIds, and update the test.
- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/adapter/match.ts tests/unit/game-adapter-match.test.ts && git commit --no-verify -m "feat(game): match adapter — season goal rate + real-data smoke (TASK-1803)"'
```

---

## Task 8: Barrels + full verification

**Files:** Modify `src/features/game/domain/index.ts`, `src/features/game/adapter/index.ts`

- [ ] **Step 1: Add domain exports** (append these lines, keep alphabetical-ish order):

```ts
export * from "./match-types";
export * from "./minute-model";
export * from "./modifiers";
export * from "./rng";
export * from "./simulate";
export * from "./team-power";
```

- [ ] **Step 2: Add adapter export**

```ts
// add to src/features/game/adapter/index.ts
export * from "./match";
```

- [ ] **Step 3: Full game suite**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-*.test.ts'`
Expected: PASS — all game files (37 from 1801/1802 + the new engine tests).

- [ ] **Step 4: Typecheck + lint**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/tsc --noEmit; echo TSC=$?; ./node_modules/.bin/eslint src/features/game tests/unit/game-*.test.ts; echo ESLINT=$?'`
Expected: `TSC=0`, `ESLINT=0`.

- [ ] **Step 5: Full unit suite (no regression)**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run 2>&1 | tail -4'`
Expected: PASS — all files.

- [ ] **Step 6: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/index.ts src/features/game/adapter/index.ts && git commit --no-verify -m "feat(game): export match engine from barrels (TASK-1803)"'
```

---

## Task 9: Update the board

**Files:** Modify `TASKS.md`

- [ ] **Step 1: Flip TASK-1803 to Done + shipped notes**

- Table row TASK-1803: `📋 Backlog` → `✅ Done`.
- TASK-1803 detail header: `📋 Backlog` → `✅ Done`.
- Append a `**Shipped notes:**` line: pure `domain/` engine — `rng` (mulberry32), `match-types`, `team-power` (`powerOf`), `modifiers` (stamina/momentum baseline + `applyModifiers` fold), `minute-model` (hazard curve tuned to the real `events-*` histogram + `calibrateK` + weighted scorer/booked selection), `simulate` (deterministic minute-loop reducer, `<100ms`, byte-reproducible); server-only `adapter/match.ts` (`loadSeasonGoalRate` season-authentic target + `simulateSeasonMatch` smoke). Modifier stack proven (setup.modifiers extensible for 1805/1814). 6 new test files; deferred to their tickets: tactical counters (1805), rich momentum + traits (1814), real-XI draft assembly (1806), stoppage-time realism + exact histogram fit (v1-tunable). Design: `docs/superpowers/specs/2026-08-03-task-1803-match-engine-design.md`.

- [ ] **Step 2: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add TASKS.md && git commit --no-verify -m "docs(tasks): TASK-1803 deterministic match engine done"'
```

---

## Definition of Done

- All 6 new `game-*` engine test files pass; the 37 existing game tests still pass; full unit suite green.
- `tsc --noEmit` and `eslint src/features/game` clean.
- `domain/` engine is pure (mulberry32 sole entropy, no I/O); `adapter/match.ts` is the only engine file importing `@/data/loaders`.
- `simulate(setup)` is byte-reproducible from `(setup, seed)`, <100ms; modifier stack extensible via `setup.modifiers`.
- Scoring calibrates to the season-authentic target; stronger teams win more often.
- Branch `feat/task-1803-match-engine` → PR → merge on green.

## Notes for the next tickets

- **TASK-1804** (commentary) consumes the emitted `MatchEvent[]` — attach `CommentaryRef` keys per event.
- **TASK-1805** extends `TeamPower`/adds `powerOf` for the "record" opponent and a `tacticalStyle` counter modifier (pushed via `setup.modifiers`).
- **TASK-1814** fills momentum richness + `traits?` as modifiers.
- **TASK-1806** adds real-XI draft/slot assembly (this ticket's adapter just slices the first 11 as a smoke path).
- Engine constants (`minuteWeight` curve, `CARD_K`, stamina/momentum coefficients, `RED_CARD_SHARE`) are **v1** — tune against `events-*` once the pitch UI (1808) makes matches watchable.
