# TASK-1830 — Segmented Interactive Match Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the match engine interruptible so the coach can make decisions during a match — how to respond after conceding, and who to substitute — without losing byte-reproducible replay.

**Architecture:** `simulate()`'s body becomes a generator, `runMatch()`, which `yield`s a `MatchDecision` at each decision point and is resumed with a `DecisionAnswer`. A generator suspends its whole stack frame, so every local (`rng`, `referee`, `squads`, `benches`, the `substitute` closure) stays exactly where it is — nothing is lifted into a serializable state object. `simulate()` survives unchanged as a thin driver over the generator using `defaultAnswer`, which reproduces today's behaviour exactly. Determinism extends rather than breaks: answers are recorded, and a match replays from `(setup, seed, decisions[])`.

**Tech Stack:** TypeScript, Vitest, React 19 / Next 15 App Router, next-intl. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-11-task-1830-interactive-engine-design.md`

---

## Before you start

**Read the spec first.** In particular the "What makes this safe" section — the whole plan depends on the fact that `pickPlayerOff` and `pickPlayerOn` take no `rng` argument, and the response-window effect is three plain assignments. If you find yourself moving, gating, or removing an `rng()` call, stop: you are breaking the invariant this ticket rests on.

**Running things.** This repo lives in WSL. From the WSL side, pin node on `PATH` and run the binaries directly rather than through `pnpm` (a `pnpm` wrapper in this environment breaks the husky hook):

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd ~/projects/pitchiq
```

Then:

- Single test file: `node_modules/.bin/vitest run tests/unit/game-decisions.test.ts`
- Full suite: `node_modules/.bin/vitest run`
- Types: `node_modules/.bin/tsc --noEmit`
- Lint: `node_modules/.bin/next lint --dir src --dir tests`

**The gate that governs every task in this plan:** the existing test suite must pass **untouched**. Snapshots in `tests/unit/game-simulate.test.ts`, `game-match-drama.test.ts`, `game-squad-dynamics.test.ts` and `game-match-harness.test.ts` compare whole results with `toEqual`. If one moves, roll order changed and the work is wrong. **Never update a snapshot to accommodate this ticket** — those snapshots are the only evidence the engine still behaves as it did.

---

## File Structure

| File                                              | Responsibility                                                                                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/game/domain/match-decisions.ts`     | **Create.** Decision and answer types, `STOPPAGE_KINDS`, `REQUEST_GRACE`, `defaultAnswer`. Pure types + one pure function; imports nothing from `simulate.ts`, so no cycle. |
| `src/features/game/domain/simulate.ts`            | **Modify.** `simulate` body becomes `runMatch` generator; `simulate` becomes a thin driver. `scoreGoal` becomes a generator so it can yield.                                |
| `src/features/game/domain/match-runner.ts`        | **Create.** `InteractiveMatchResult`, `replayMatch`, and the `CoachPolicy` that holds request / grace / spent bookkeeping. Imports `runMatch` from `simulate.ts`.           |
| `src/features/game/domain/response-modifiers.ts`  | **Create.** The `overload` / `stabilize` weight modifiers.                                                                                                                  |
| `src/features/game/components/DecisionPrompt.tsx` | **Create.** The modal.                                                                                                                                                      |
| `src/features/game/components/MatchView.tsx`      | **Modify.** Pause on decision, Request Substitution control.                                                                                                                |
| `src/i18n/messages/{en,ar}.json`                  | **Modify.** `game.decision.*` keys.                                                                                                                                         |
| `tests/unit/game-decisions.test.ts`               | **Create.** Types, `defaultAnswer`, stoppage set.                                                                                                                           |
| `tests/unit/game-interactive.test.ts`             | **Create.** Generator, replay, PRNG neutrality, triggers.                                                                                                                   |
| `tests/unit/game-coach-policy.test.ts`            | **Create.** Request / grace / spent rules.                                                                                                                                  |

---

## Task 1: Decision and answer types

**Files:**

- Create: `src/features/game/domain/match-decisions.ts`
- Test: `tests/unit/game-decisions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-decisions.test.ts
import { describe, expect, it } from "vitest";
import {
  REQUEST_GRACE,
  STOPPAGE_KINDS,
  defaultAnswer,
} from "@/features/game/domain/match-decisions";
import type { SubOfferDecision } from "@/features/game/domain/match-decisions";

const offer = (over: Partial<SubOfferDecision> = {}): SubOfferDecision => ({
  kind: "sub-offer",
  minute: 60,
  side: "home",
  stoppage: false,
  engineSuggests: false,
  suggestedOff: undefined,
  suggestedReason: undefined,
  legalOff: [],
  legalOn: [],
  ...over,
});

describe("STOPPAGE_KINDS", () => {
  it("covers the events during which play is genuinely dead", () => {
    for (const k of [
      "goal",
      "card",
      "penalty",
      "freekick",
      "injury",
      "var",
      "altercation",
      "substitution",
      "halftime",
    ]) {
      expect(STOPPAGE_KINDS.has(k as never)).toBe(true);
    }
  });

  it("excludes events that do not stop play", () => {
    // A chance is play continuing, and `push` / `crowd` / `weather` are colour.
    for (const k of ["chance", "push", "crowd", "weather", "kickoff", "fulltime"]) {
      expect(STOPPAGE_KINDS.has(k as never)).toBe(false);
    }
  });
});

describe("defaultAnswer", () => {
  it("declines a sub offer the engine did not suggest", () => {
    expect(defaultAnswer(offer())).toEqual({
      kind: "sub-offer",
      minute: 60,
      side: "home",
      off: undefined,
      on: undefined,
      reason: undefined,
    });
  });

  it("takes the engine's own suggestion when it made one", () => {
    expect(
      defaultAnswer(offer({ engineSuggests: true, suggestedOff: 7, suggestedReason: "tactical" })),
    ).toEqual({
      kind: "sub-offer",
      minute: 60,
      side: "home",
      off: 7,
      on: undefined,
      reason: "tactical",
    });
  });

  it("ignores a suggestion the engine did not make even if one is present", () => {
    // engineSuggests is the roll. suggestedOff is computed unconditionally because
    // pickPlayerOff consumes no rng — so the roll, not the suggestion, is the gate.
    expect(defaultAnswer(offer({ engineSuggests: false, suggestedOff: 7 })).off).toBeUndefined();
  });

  it("holds on a response decision", () => {
    expect(
      defaultAnswer({ kind: "response", minute: 30, side: "away", concededBy: "away" }),
    ).toEqual({ kind: "response", minute: 30, side: "away", choice: "hold" });
  });

  it("lets the engine pick the replacement for a forced injury", () => {
    expect(
      defaultAnswer({ kind: "injury-sub", minute: 55, side: "home", off: 4, legalOn: [] }),
    ).toEqual({ kind: "injury-sub", minute: 55, side: "home", on: undefined });
  });

  it("declines a dismissal reshape", () => {
    expect(
      defaultAnswer({ kind: "dismissal", minute: 70, side: "home", legalOff: [], legalOn: [] }),
    ).toEqual({ kind: "dismissal", minute: 70, side: "home", off: undefined, on: undefined });
  });
});

describe("REQUEST_GRACE", () => {
  it("is short enough that a request never feels swallowed", () => {
    expect(REQUEST_GRACE).toBeGreaterThan(0);
    expect(REQUEST_GRACE).toBeLessThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node_modules/.bin/vitest run tests/unit/game-decisions.test.ts`
Expected: FAIL — `Failed to resolve import "@/features/game/domain/match-decisions"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/game/domain/match-decisions.ts
import type { MatchEventKind, Side, SubReason } from "./match-types";
import type { GamePlayer } from "./player";

/**
 * The events during which play is genuinely dead.
 *
 * ⚠️ The engine has NO ball-out-of-play event — `MatchEventKind` models consequential
 * events only, so there is no throw-in, goal kick or corner to wait for. "The next
 * stoppage" therefore has to be defined over what the engine actually emits.
 */
export const STOPPAGE_KINDS: ReadonlySet<MatchEventKind> = new Set<MatchEventKind>([
  "goal",
  "card",
  "penalty",
  "freekick",
  "injury",
  "var",
  "altercation",
  "substitution",
  "halftime",
]);

/**
 * Minutes a requested substitution waits for a stoppage before opening anyway.
 *
 * Without a bound a request can sit unanswered for a quarter of an hour, which the coach
 * experiences as a broken button. Halftime is always a stoppage, so this exists for the
 * second half.
 */
export const REQUEST_GRACE = 5;

export type ResponseChoice = "overload" | "stabilize" | "hold";

interface DecisionBase {
  minute: number;
  side: Side;
}

/**
 * Raised every minute of the substitution window, for both sides.
 *
 * `engineSuggests` carries the result of the engine's own `rng() < subRate` roll. The
 * roll still happens exactly when and where it always did; a coach-driven match simply
 * ignores the answer. Removing or gating it would shift every subsequent roll.
 */
export interface SubOfferDecision extends DecisionBase {
  kind: "sub-offer";
  /** Did a stoppage-kind event already land this minute? */
  stoppage: boolean;
  engineSuggests: boolean;
  /** Who the engine would take off. Computed unconditionally — `pickPlayerOff` is rng-free. */
  suggestedOff?: number;
  suggestedReason?: SubReason;
  legalOff: GamePlayer[];
  legalOn: GamePlayer[];
}

export interface ResponseDecision extends DecisionBase {
  kind: "response";
  /** The side that just conceded — the one the window lifts. */
  concededBy: Side;
}

export interface InjurySubDecision extends DecisionBase {
  kind: "injury-sub";
  /** Who is going off. Not a choice — he cannot continue. */
  off: number;
  legalOn: GamePlayer[];
}

export interface DismissalDecision extends DecisionBase {
  kind: "dismissal";
  legalOff: GamePlayer[];
  legalOn: GamePlayer[];
}

export type MatchDecision =
  | SubOfferDecision
  | ResponseDecision
  | InjurySubDecision
  | DismissalDecision;

export type DecisionKind = MatchDecision["kind"];

interface AnswerBase {
  minute: number;
  side: Side;
}

/** `off` absent = no change. `on` absent = let the engine pick the replacement. */
export interface SubAnswer extends AnswerBase {
  kind: "sub-offer";
  off?: number;
  on?: number;
  reason?: SubReason;
}
export interface ResponseAnswer extends AnswerBase {
  kind: "response";
  choice: ResponseChoice;
}
export interface InjurySubAnswer extends AnswerBase {
  kind: "injury-sub";
  on?: number;
}
export interface DismissalAnswer extends AnswerBase {
  kind: "dismissal";
  off?: number;
  on?: number;
}

export type DecisionAnswer = SubAnswer | ResponseAnswer | InjurySubAnswer | DismissalAnswer;

/**
 * How the engine answers when nobody is coaching — i.e. exactly what it does today.
 *
 * `simulate()` drives the generator with this, which is why the existing determinism
 * snapshots must not move.
 */
export function defaultAnswer(d: MatchDecision): DecisionAnswer {
  switch (d.kind) {
    case "sub-offer":
      return {
        kind: "sub-offer",
        minute: d.minute,
        side: d.side,
        off: d.engineSuggests ? d.suggestedOff : undefined,
        on: undefined,
        reason: d.engineSuggests ? d.suggestedReason : undefined,
      };
    case "response":
      return { kind: "response", minute: d.minute, side: d.side, choice: "hold" };
    case "injury-sub":
      return { kind: "injury-sub", minute: d.minute, side: d.side, on: undefined };
    case "dismissal":
      return { kind: "dismissal", minute: d.minute, side: d.side, off: undefined, on: undefined };
  }
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node_modules/.bin/vitest run tests/unit/game-decisions.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/match-decisions.ts tests/unit/game-decisions.test.ts
git commit -m "feat(game): decision and answer types for the interactive engine"
```

---

## Task 2: Turn `simulate` into a generator with no decision points yet

This is the risky step, so it is isolated and adds **no** behaviour. The existing suite is the test.

**Files:**

- Modify: `src/features/game/domain/simulate.ts`

- [ ] **Step 1: Record the baseline**

```bash
node_modules/.bin/vitest run 2>&1 | tail -5
```

Write down the passing count. It must be identical at the end of this task.

- [ ] **Step 2: Rename the function and add the driver**

In `src/features/game/domain/simulate.ts`, change the signature at line 274 from:

```ts
export function simulate(setup: MatchSetup): MatchResult {
```

to:

```ts
export function* runMatch(
  setup: MatchSetup,
): Generator<MatchDecision, MatchResult, DecisionAnswer> {
```

Leave the entire body untouched. Then add the driver immediately after the closing brace of `runMatch` (before the `export { FULL_TIME }` line):

```ts
/**
 * Drive a generator to completion with a policy.
 *
 * Exported because both `simulate` and the interactive runner need it, and because a
 * test can drive with a scripted policy.
 */
export function drive(
  gen: Generator<MatchDecision, MatchResult, DecisionAnswer>,
  policy: (d: MatchDecision) => DecisionAnswer,
): MatchResult {
  let step = gen.next(undefined as unknown as DecisionAnswer);
  while (!step.done) {
    step = gen.next(policy(step.value));
  }
  return step.value;
}

/**
 * The batch entry point, unchanged for every existing caller.
 *
 * ⚠️ Returns a bare `MatchResult`. Adding a field here would break the determinism
 * snapshots, which compare whole results with `toEqual`.
 */
export function simulate(setup: MatchSetup): MatchResult {
  return drive(runMatch(setup), defaultAnswer);
}
```

- [ ] **Step 3: Add the imports**

Add to the import block at the top of `simulate.ts`:

```ts
import { type DecisionAnswer, type MatchDecision, defaultAnswer } from "./match-decisions";
```

- [ ] **Step 4: Run the full suite — the gate**

Run: `node_modules/.bin/vitest run`
Expected: PASS, **exactly the same count as Step 1**. The generator yields nothing yet, so `drive` runs straight through and every result is byte-identical.

If any snapshot moved, you have accidentally edited the body. Revert and redo — do not update the snapshot.

- [ ] **Step 5: Type-check and commit**

```bash
node_modules/.bin/tsc --noEmit
git add src/features/game/domain/simulate.ts
git commit -m "refactor(game): simulate becomes a generator driven by a policy

No behaviour change — runMatch yields nothing yet and simulate drives it with
defaultAnswer, so every determinism snapshot is byte-identical. Isolated on its
own so the risky extraction is separable from the decision points."
```

---

## Task 3: The substitution offer

**Files:**

- Modify: `src/features/game/domain/simulate.ts`
- Test: `tests/unit/game-interactive.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-interactive.test.ts
import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import type { MatchSetup } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import type { PlayerRatings } from "@/features/game/domain/ratings";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import { defaultAnswer } from "@/features/game/domain/match-decisions";
import { drive, runMatch, simulate } from "@/features/game/domain/simulate";
import { makeGameTeam } from "@/features/game/domain/team";

function squad(prefix: string, offset: number, base: Partial<PlayerRatings> = {}): GamePlayer[] {
  const roles: PlayerRole[] = ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CAM", "RW", "LW", "CF"];
  return roles.map((role, i) => ({
    cardId: `${offset + i}@2020`,
    playerId: offset + i,
    season: 2020,
    name: `${prefix}${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: {
      attack: 50,
      creation: 50,
      defense: 50,
      physical: 50,
      discipline: 50,
      overall: 50,
      ...base,
    },
  }));
}

function bench(prefix: string, offset: number): GamePlayer[] {
  const roles: PlayerRole[] = ["GK", "CB", "CM", "CF", "RW"];
  return roles.map((role, i) => ({
    cardId: `${offset + i}@2020`,
    playerId: offset + i,
    season: 2020,
    name: `${prefix}B${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: {
      attack: 50,
      creation: 50,
      defense: 50,
      physical: 50,
      discipline: 50,
      overall: 50,
    },
  }));
}

const shape = { name: "", season: 2020, slots: [] };
export const setup = (seed: number, over: Partial<MatchSetup> = {}): MatchSetup => ({
  home: makeGameTeam(1, "H", 2020, shape, squad("H", 100), bench("H", 200)),
  away: makeGameTeam(2, "A", 2020, shape, squad("A", 300), bench("A", 400)),
  seed,
  targetGoalsPerMatch: 2.7,
  ...over,
});

/** Drive a match, recording every decision the engine raised. */
function record(
  s: MatchSetup,
  policy: (d: MatchDecision) => DecisionAnswer = defaultAnswer,
): { seen: MatchDecision[]; result: ReturnType<typeof simulate> } {
  const seen: MatchDecision[] = [];
  const result = drive(runMatch(s), (d) => {
    seen.push(d);
    return policy(d);
  });
  return { seen, result };
}

describe("sub-offer", () => {
  it("is raised for both sides on every minute of the substitution window", () => {
    const { seen } = record(setup(11));
    const offers = seen.filter((d) => d.kind === "sub-offer");
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(o.minute).toBeGreaterThanOrEqual(46);
      expect(o.minute).toBeLessThanOrEqual(90);
    }
    expect(new Set(offers.map((o) => o.side))).toEqual(new Set(["home", "away"]));
  });

  it("carries the engine's own roll and its own suggestion", () => {
    const { seen } = record(setup(11));
    const suggested = seen.filter((d) => d.kind === "sub-offer" && d.engineSuggests);
    expect(suggested.length).toBeGreaterThan(0);
  });

  it("never offers a player who is not on the pitch", () => {
    const { seen } = record(setup(23));
    for (const d of seen) {
      if (d.kind !== "sub-offer") continue;
      for (const p of d.legalOff) expect(p.role).not.toBe("GK");
    }
  });

  it("driving with defaultAnswer reproduces simulate exactly", () => {
    for (const seed of [1, 42, 777, 20260811]) {
      expect(record(setup(seed)).result).toEqual(simulate(setup(seed)));
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node_modules/.bin/vitest run tests/unit/game-interactive.test.ts`
Expected: FAIL — "is raised for both sides…" fails with `offers.length` being `0`, because nothing yields yet.

- [ ] **Step 3: Let `substitute` take an explicit replacement**

In `simulate.ts`, change the `substitute` closure (around line 340) to accept an override:

```ts
const substitute = (
  side: Side,
  minute: number,
  off: GamePlayer,
  reason: SubReason,
  onOverride?: GamePlayer,
): boolean => {
  const st = state[side];
  if (st.subsUsed >= MAX_SUBS) return false;
  const availableIds = new Set(
    benches[side].filter((b) => !st.broughtOn.has(b.playerId)).map((b) => b.playerId),
  );
  // An explicit choice still has to be legal — the coach cannot bring on a player who
  // is already on, or one who has been on and come off.
  const on =
    onOverride != null && availableIds.has(onOverride.playerId)
      ? onOverride
      : pickPlayerOn(benches[side], availableIds, off.role ?? null);
  if (on == null) return false;
  squads[side] = squads[side].filter((p) => p.playerId !== off.playerId);
  squads[side].push(on);
  st.broughtOn.add(on.playerId);
  st.unavailable.add(off.playerId);
  st.subsUsed += 1;
  state.events.push({
    minute,
    kind: "substitution",
    side,
    playerId: off.playerId,
    subOnPlayerId: on.playerId,
    subReason: reason,
  });
  return true;
};
```

- [ ] **Step 4: Add the legal-set helpers**

Immediately after the `substitute` closure, add:

```ts
/** Who this side may take off. Mirrors `pickPlayerOff` — outfield only. */
const legalOffFor = (side: Side): GamePlayer[] =>
  state[side].subsUsed >= MAX_SUBS ? [] : squads[side].filter((p) => p.role !== "GK");

/** Who this side may bring on. Mirrors the availability rule inside `substitute`. */
const legalOnFor = (side: Side): GamePlayer[] =>
  state[side].subsUsed >= MAX_SUBS
    ? []
    : benches[side].filter((b) => !state[side].broughtOn.has(b.playerId));

/** Has a stoppage-kind event already landed this minute? */
const stoppageThisMinute = (m: number): boolean =>
  state.events.some((e) => e.minute === m && STOPPAGE_KINDS.has(e.kind));
```

- [ ] **Step 5: Replace the substitution block with a yield**

Replace the block at lines 544-557 (`if (m >= SUB_WINDOW_START && m <= SUB_WINDOW_END && rng() < subRate) { … }`) with:

```ts
      if (m >= SUB_WINDOW_START && m <= SUB_WINDOW_END) {
        // ⚠️ The roll fires here exactly as it always did. A coach-driven match ignores
        // its result, but `defaultAnswer` reads it — gating it would shift every
        // subsequent roll and break every determinism snapshot in the suite.
        const engineSuggests = rng() < subRate;
        const bookedIds = new Set(
          squads[side]
            .filter((pl) => (state.booked.get(`${side}:${pl.playerId}`) ?? 0) > 0)
            .map((pl) => pl.playerId),
        );
        const diff = state[side].score - state[opp].score;
        const choice = pickPlayerOff(
          squads[side],
          bookedIds,
          diff === 0 ? "level" : diff < 0 ? "trailing" : "leading",
        );
        const answer = yield {
          kind: "sub-offer",
          minute: m,
          side,
          stoppage: stoppageThisMinute(m),
          engineSuggests,
          suggestedOff: choice?.player.playerId,
          suggestedReason: choice?.reason,
          legalOff: legalOffFor(side),
          legalOn: legalOnFor(side),
        };
        if (answer.kind === "sub-offer" && answer.off != null) {
          const off = squads[side].find((pl) => pl.playerId === answer.off);
          const on =
            answer.on != null ? benches[side].find((pl) => pl.playerId === answer.on) : undefined;
          if (off != null) substitute(side, m, off, answer.reason ?? "tactical", on);
        }
      }
```

- [ ] **Step 6: Add the import**

Add `STOPPAGE_KINDS` to the `./match-decisions` import in `simulate.ts`:

```ts
import {
  type DecisionAnswer,
  type MatchDecision,
  STOPPAGE_KINDS,
  defaultAnswer,
} from "./match-decisions";
```

- [ ] **Step 7: Run the new tests, then the full suite**

Run: `node_modules/.bin/vitest run tests/unit/game-interactive.test.ts`
Expected: PASS, 4 tests.

Run: `node_modules/.bin/vitest run`
Expected: PASS with the same count as Task 2 Step 1, plus the new tests. **No snapshot may move.**

- [ ] **Step 8: Commit**

```bash
git add src/features/game/domain/simulate.ts tests/unit/game-interactive.test.ts
git commit -m "feat(game): yield a substitution offer every minute of the sub window

The engine keeps rolling WHETHER an opportunity arises; the answer only decides
what to do with it. pickPlayerOff and pickPlayerOn consume no rng, so a coach's
choice and the engine's cost exactly the same rolls."
```

---

## Task 4: The response decision

`scoreGoal` is a module-level function called from six places, so it becomes a generator and every call site becomes `yield*`. That is the whole reason for choosing generators — delegation costs one keyword per call site.

**Files:**

- Modify: `src/features/game/domain/simulate.ts`
- Test: `tests/unit/game-interactive.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/game-interactive.test.ts`:

```ts
describe("response", () => {
  it("is raised once per goal that stands, for the conceding side", () => {
    const { seen, result } = record(setup(42));
    const responses = seen.filter((d) => d.kind === "response");
    const standing = result.events.filter((e) => e.kind === "goal" && e.disallowedAt == null);
    expect(responses.length).toBe(standing.length);
  });

  it("names the side that conceded, not the scorer", () => {
    const { seen } = record(setup(42));
    for (const d of seen) {
      if (d.kind !== "response") continue;
      expect(d.side).toBe(d.concededBy);
    }
  });

  it("holding reproduces simulate exactly", () => {
    for (const seed of [3, 88, 4242]) {
      expect(record(setup(seed)).result).toEqual(simulate(setup(seed)));
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node_modules/.bin/vitest run tests/unit/game-interactive.test.ts -t response`
Expected: FAIL — `responses.length` is `0`.

- [ ] **Step 3: Make `scoreGoal` a generator**

Change its signature at line 119 from `function scoreGoal(` to:

```ts
function* scoreGoal(
```

and its return type from `): void {` to:

```ts
): Generator<MatchDecision, void, DecisionAnswer> {
```

Then replace its final three lines (the response-window block at lines 186-189) with:

```ts
  // The side that CONCEDED is the one lifted — see RESPONSE_WINDOW.
  const answer = yield { kind: "response", minute, side: opp, concededBy: opp };
  const choice = answer.kind === "response" ? answer.choice : "hold";
  // `hold` is exactly today's numbers. The other two are applied by the caller as
  // modifiers, because a weight change belongs on the modifier stack, not in here.
  state[opp].momentum = Math.min(1, state[opp].momentum + RESPONSE_URGENCY);
  state[opp].respondingUntil = minute + RESPONSE_WINDOW;
  state[side].momentum = Math.min(1, state[side].momentum + SCORER_URGENCY);
  state[opp].responseChoice = choice;
```

- [ ] **Step 4: Carry the choice on `SideState`**

In `src/features/game/domain/match-types.ts`, add to `SideState` after `respondingUntil`:

```ts
  /**
   * How the coach chose to respond to the last goal conceded. Read by the response
   * modifiers; `hold` (the default) leaves the weights exactly as they were.
   */
  responseChoice?: "overload" | "stabilize" | "hold";
```

And in `simulate.ts`, add `responseChoice: "hold" as const,` to the `blank()` initialiser so every side starts neutral.

- [ ] **Step 5: Update all six call sites to delegate**

Every `scoreGoal(...)` call inside `runMatch` becomes `yield* scoreGoal(...)`. There are six:

```bash
grep -n "scoreGoal(" src/features/game/domain/simulate.ts
```

Each call inside `runMatch` — the open-play goal, the penalty goal, the free-kick goal, the own goal, the keeper free-kick goal, and the keeper-punished goal — gets `yield* ` prefixed. The definition itself (`function* scoreGoal(`) obviously does not.

- [ ] **Step 6: Run the new tests, then the full suite**

Run: `node_modules/.bin/vitest run tests/unit/game-interactive.test.ts`
Expected: PASS, 7 tests.

Run: `node_modules/.bin/vitest run`
Expected: PASS, no snapshot moved. `defaultAnswer` returns `hold`, and `hold` sets exactly the three assignments that were there before.

- [ ] **Step 7: Commit**

```bash
git add src/features/game/domain/simulate.ts src/features/game/domain/match-types.ts tests/unit/game-interactive.test.ts
git commit -m "feat(game): the coach chooses how to respond to conceding

scoreGoal becomes a generator and the six call sites delegate with yield* —
which is exactly why generators were chosen over a state-machine rewrite. hold
is byte-identical to today, so no snapshot moves."
```

---

## Task 5: Forced injury and dismissal prompts

**Files:**

- Modify: `src/features/game/domain/simulate.ts`
- Test: `tests/unit/game-interactive.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/game-interactive.test.ts`:

```ts
describe("forced prompts", () => {
  it("prompts for a replacement on a moderate or severe injury, never on a knock", () => {
    // Sweep seeds so both severities and at least one knock actually occur.
    let sawForced = 0;
    let sawKnock = 0;
    for (let s = 0; s < 120; s++) {
      const { seen, result } = record(setup(s));
      const forced = seen.filter((d) => d.kind === "injury-sub");
      const injuries = result.events.filter((e) => e.kind === "injury");
      const knocks = injuries.filter((e) => e.injurySeverity === "knock");
      const off = injuries.filter((e) => e.injurySeverity !== "knock");
      expect(forced.length).toBe(off.length);
      sawForced += off.length;
      sawKnock += knocks.length;
    }
    expect(sawForced).toBeGreaterThan(0);
    expect(sawKnock).toBeGreaterThan(0);
  });

  it("prompts on any dismissal, and declining leaves the side a man short", () => {
    let sawDismissal = 0;
    for (let s = 0; s < 150; s++) {
      const { seen, result } = record(setup(s));
      const prompts = seen.filter((d) => d.kind === "dismissal");
      const reds = result.events.filter((e) => e.kind === "card" && e.card === "red");
      expect(prompts.length).toBe(reds.length);
      sawDismissal += reds.length;
    }
    expect(sawDismissal).toBeGreaterThan(0);
  });

  it("forced prompts do not change the match when answered by default", () => {
    for (const seed of [5, 60, 600, 6000]) {
      expect(record(setup(seed)).result).toEqual(simulate(setup(seed)));
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node_modules/.bin/vitest run tests/unit/game-interactive.test.ts -t "forced prompts"`
Expected: FAIL — `expect(forced.length).toBe(off.length)` with `0` received.

- [ ] **Step 3: Yield before a forced injury substitution**

In the injury block (around line 571), replace the `else if (!substitute(side, m, hurt, "injury"))` branch with:

```ts
          } else {
            // Moderate AND severe both force him off — the difference is only how it
            // looks. A knock is treated and he carries on, and must not prompt.
            const answer = yield {
              kind: "injury-sub",
              minute: m,
              side,
              off: hurt.playerId,
              legalOn: legalOnFor(side),
            };
            const on =
              answer.kind === "injury-sub" && answer.on != null
                ? benches[side].find((pl) => pl.playerId === answer.on)
                : undefined;
            if (!substitute(side, m, hurt, "injury", on)) {
              // Nobody left on the bench — the side plays on a man short.
              squads[side] = squads[side].filter((pl) => pl.playerId !== hurt.playerId);
              state[side].sentOff += 1;
              state.events.push({
                minute: m,
                kind: "shorthanded",
                side,
                playerId: hurt.playerId,
              });
            }
          }
```

Keep the surrounding `if (severity === "knock") { … }` branch exactly as it is.

- [ ] **Step 4: Yield after a dismissal**

`showCard` is a module-level function that returns the card shown. Rather than making it a generator too, handle the prompt where its result is already inspected. Immediately after the minute loop's per-side block finishes emitting cards — that is, at the end of the `for (const side of sides)` body, just before the closing brace at line 664 — add:

```ts
      // A red card does NOT force a substitution; the side plays a man short. What the
      // coach may want is a tactical reset, which is a normal change he can decline.
      const dismissedThisMinute = state.events.some(
        (e) => e.minute === m && e.kind === "card" && e.card === "red" && e.side === side,
      );
      if (dismissedThisMinute) {
        const answer = yield {
          kind: "dismissal",
          minute: m,
          side,
          legalOff: legalOffFor(side),
          legalOn: legalOnFor(side),
        };
        if (answer.kind === "dismissal" && answer.off != null) {
          const off = squads[side].find((pl) => pl.playerId === answer.off);
          const on =
            answer.on != null ? benches[side].find((pl) => pl.playerId === answer.on) : undefined;
          if (off != null) substitute(side, m, off, "tactical", on);
        }
      }
```

- [ ] **Step 5: Run the new tests, then the full suite**

Run: `node_modules/.bin/vitest run tests/unit/game-interactive.test.ts`
Expected: PASS, 10 tests.

Run: `node_modules/.bin/vitest run`
Expected: PASS, no snapshot moved.

- [ ] **Step 6: Commit**

```bash
git add src/features/game/domain/simulate.ts tests/unit/game-interactive.test.ts
git commit -m "feat(game): forced prompts on a forcing injury and on a dismissal

Moderate AND severe force a change — a knock does not, and must not prompt. A
red card does not force a substitution either: the side plays a man short, so
the dismissal prompt is a declinable tactical reset rather than a demand."
```

---

## Task 6: Replay and the interactive result

**Files:**

- Create: `src/features/game/domain/match-runner.ts`
- Test: `tests/unit/game-interactive.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/game-interactive.test.ts`:

```ts
import { recordMatch, replayMatch } from "@/features/game/domain/match-runner";

describe("replay", () => {
  const alwaysOverload = (d: MatchDecision): DecisionAnswer =>
    d.kind === "response"
      ? { kind: "response", minute: d.minute, side: d.side, choice: "overload" }
      : defaultAnswer(d);

  it("a recorded match replays byte-for-byte", () => {
    for (const seed of [1, 2, 99, 12345]) {
      const live = recordMatch(setup(seed), alwaysOverload);
      const again = replayMatch(setup(seed), live.decisions);
      expect(again).toEqual(live);
    }
  });

  it("a decision list from another seed is rejected, not silently misapplied", () => {
    const live = recordMatch(setup(7), alwaysOverload);
    expect(() => replayMatch(setup(8), live.decisions)).toThrow(/does not match/i);
  });

  it("a truncated list finishes on the default policy", () => {
    const live = recordMatch(setup(21), alwaysOverload);
    const partial = live.decisions.slice(0, 3);
    const resumed = replayMatch(setup(21), partial);
    expect(resumed.events[resumed.events.length - 1].kind).toBe("fulltime");
    expect(resumed.decisions.length).toBe(live.decisions.length);
  });

  it("the roll count is identical whether a coach answers or the default does", () => {
    // Determinism rests on this: the answers must not change PRNG consumption.
    for (const seed of [4, 44, 444]) {
      const coached = recordMatch(setup(seed), alwaysOverload);
      const auto = recordMatch(setup(seed), defaultAnswer);
      expect(coached.decisions.length).toBe(auto.decisions.length);
      expect(coached.decisions.map((d) => `${d.kind}@${d.minute}`)).toEqual(
        auto.decisions.map((d) => `${d.kind}@${d.minute}`),
      );
    }
  });
});
```

⚠️ The last test is the important one and it is subtle: `overload` and `hold` set the same `momentum`, so the two runs stay in lockstep and every decision lands on the same minute. Once Task 7 makes `overload` actually change the weights, that lockstep breaks by design — so this assertion moves to comparing the **first** decision sequence up to the first non-`hold` answer. Note it now; Task 7 tells you exactly what to change.

- [ ] **Step 2: Run it to make sure it fails**

Run: `node_modules/.bin/vitest run tests/unit/game-interactive.test.ts -t replay`
Expected: FAIL — `Failed to resolve import "@/features/game/domain/match-runner"`.

- [ ] **Step 3: Write the runner**

```ts
// src/features/game/domain/match-runner.ts
import { type DecisionAnswer, type MatchDecision, defaultAnswer } from "./match-decisions";
import type { MatchResult, MatchSetup } from "./match-types";
import { runMatch } from "./simulate";

/**
 * A match plus the answers that produced it.
 *
 * ⚠️ Deliberately NOT `MatchResult`. Adding a field to what `simulate()` returns would
 * break the determinism snapshots, which compare whole results with `toEqual`.
 */
export interface InteractiveMatchResult extends MatchResult {
  decisions: DecisionAnswer[];
}

/** Run a match against a policy, recording every answer for replay. */
export function recordMatch(
  setup: MatchSetup,
  policy: (d: MatchDecision) => DecisionAnswer,
): InteractiveMatchResult {
  const decisions: DecisionAnswer[] = [];
  const gen = runMatch(setup);
  let step = gen.next(undefined as unknown as DecisionAnswer);
  while (!step.done) {
    const answer = policy(step.value);
    decisions.push(answer);
    step = gen.next(answer);
  }
  return { ...step.value, decisions };
}

/**
 * Re-run a match from its recorded answers.
 *
 * ⚠️ A decision list is only valid for the seed it was recorded against — a different
 * seed raises decisions at different minutes, so answers would land on the wrong
 * prompts. Mismatches throw rather than silently mis-applying; a silent mis-apply
 * surfaces to the user as "the shared link plays a different match".
 *
 * A list that runs out (an abandoned match) finishes on the default policy, so a partial
 * recording still produces a complete, valid match. That is also how refresh-resume
 * works: persist `(setup, seed, decisions[])`, then replay.
 */
export function replayMatch(
  setup: MatchSetup,
  decisions: readonly DecisionAnswer[],
): InteractiveMatchResult {
  let i = 0;
  return recordMatch(setup, (d) => {
    const recorded = decisions[i];
    i += 1;
    if (recorded == null) return defaultAnswer(d);
    if (recorded.kind !== d.kind || recorded.minute !== d.minute || recorded.side !== d.side) {
      throw new Error(
        `Recorded decision ${recorded.kind}@${recorded.minute}/${recorded.side} does not match ` +
          `${d.kind}@${d.minute}/${d.side} — the list belongs to a different seed or setup.`,
      );
    }
    return recorded;
  });
}
```

- [ ] **Step 4: Run the new tests, then the full suite**

Run: `node_modules/.bin/vitest run tests/unit/game-interactive.test.ts`
Expected: PASS, 14 tests.

Run: `node_modules/.bin/vitest run`
Expected: PASS, no snapshot moved.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/match-runner.ts tests/unit/game-interactive.test.ts
git commit -m "feat(game): record and replay a match from its decisions

(setup, seed, decisions[]) is byte-reproducible, which gives seed-sharing and
refresh-resume by replay rather than by snapshot. A list recorded against
another seed throws instead of landing answers on the wrong prompts."
```

---

## Task 7: The response modifiers

**Files:**

- Create: `src/features/game/domain/response-modifiers.ts`
- Modify: `src/features/game/domain/simulate.ts`
- Test: `tests/unit/game-interactive.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/game-interactive.test.ts`:

```ts
describe("response choices change the match", () => {
  const choose =
    (choice: "overload" | "stabilize") =>
    (d: MatchDecision): DecisionAnswer =>
      d.kind === "response"
        ? { kind: "response", minute: d.minute, side: d.side, choice }
        : defaultAnswer(d);

  it("overload concedes more than stabilize across many seeds", () => {
    // ⚠️ Assert on a DISTRIBUTION. A single seed can easily give identical scorelines
    // under both choices, so a one-seed test would prove nothing.
    let overloadConceded = 0;
    let stabilizeConceded = 0;
    for (let s = 0; s < 400; s++) {
      overloadConceded += recordMatch(setup(s), choose("overload")).score.away;
      stabilizeConceded += recordMatch(setup(s), choose("stabilize")).score.away;
    }
    expect(overloadConceded).toBeGreaterThan(stabilizeConceded);
  });

  it("overload and stabilize produce different matches", () => {
    const a = recordMatch(setup(31), choose("overload"));
    const b = recordMatch(setup(31), choose("stabilize"));
    expect(JSON.stringify(a.events)).not.toBe(JSON.stringify(b.events));
  });
});
```

- [ ] **Step 2: Amend the PRNG-neutrality test from Task 6**

Replace the "the roll count is identical…" test body with:

```ts
it("answering does not change PRNG consumption before the first divergent answer", () => {
  // Once a response modifier bites, the two runs legitimately diverge. What must hold
  // is that ANSWERING costs nothing: up to the first non-hold answer, both runs raise
  // exactly the same decisions on exactly the same minutes.
  for (const seed of [4, 44, 444]) {
    const coached = recordMatch(setup(seed), alwaysOverload);
    const auto = recordMatch(setup(seed), defaultAnswer);
    const firstResponse = coached.decisions.findIndex((d) => d.kind === "response");
    const upTo = firstResponse === -1 ? coached.decisions.length : firstResponse + 1;
    expect(coached.decisions.slice(0, upTo).map((d) => `${d.kind}@${d.minute}`)).toEqual(
      auto.decisions.slice(0, upTo).map((d) => `${d.kind}@${d.minute}`),
    );
  }
});
```

- [ ] **Step 3: Run to make sure it fails**

Run: `node_modules/.bin/vitest run tests/unit/game-interactive.test.ts -t "response choices"`
Expected: FAIL — `overloadConceded` equals `stabilizeConceded`, because `responseChoice` is stored but nothing reads it.

- [ ] **Step 4: Write the modifiers**

```ts
// src/features/game/domain/response-modifiers.ts
import type { MinuteContext, MinuteWeights } from "./match-types";

/**
 * How hard a chosen response tilts the side, while its window is open.
 *
 * Deliberately small. The edge function `attack / (attack + oppDefense)` is insensitive
 * by design — a ten-point swing moves a side's share of play by about 1.5pp — so these
 * are a real but modest tilt, not a takeover. The outcome that matters (comeback rate)
 * is pinned by `game-match-harness.test.ts`; if that moves, these are too strong.
 */
const OVERLOAD_ATTACK = 6;
const OVERLOAD_DEFENSE = -6;
const STABILIZE_ATTACK = -4;
const STABILIZE_DEFENSE = 6;

/**
 * The coach's response, expressed as a weight contribution rather than an engine branch.
 *
 * This is the seam TASK-1803 locked and TASK-1805 already used for tactical counters:
 * pushing here means the interactive layer adds no branches to the minute loop at all.
 */
export function responseModifier(ctx: MinuteContext): Partial<MinuteWeights> {
  const s = ctx.state[ctx.side];
  if (ctx.state.minute > s.respondingUntil) return {};
  if (s.responseChoice === "overload") {
    return { attack: OVERLOAD_ATTACK, defense: OVERLOAD_DEFENSE };
  }
  if (s.responseChoice === "stabilize") {
    return { attack: STABILIZE_ATTACK, defense: STABILIZE_DEFENSE };
  }
  return {};
}
```

- [ ] **Step 5: Register it in the baseline stack**

In `src/features/game/domain/modifiers.ts`, import and append to `BASELINE_MODIFIERS`:

```ts
import { responseModifier } from "./response-modifiers";
```

and add `responseModifier` as the last entry of the `BASELINE_MODIFIERS` array.

⚠️ It returns `{}` unless `responseChoice` is `overload` or `stabilize`, and `defaultAnswer` always answers `hold`, so `simulate()` is unaffected. Confirm that in the next step rather than assuming it.

- [ ] **Step 6: Run the new tests, then the full suite**

Run: `node_modules/.bin/vitest run tests/unit/game-interactive.test.ts`
Expected: PASS, 16 tests.

Run: `node_modules/.bin/vitest run`
Expected: PASS, **no snapshot moved**. If one did, `responseModifier` is returning a non-empty object on the `hold` path.

- [ ] **Step 7: Commit**

```bash
git add src/features/game/domain/response-modifiers.ts src/features/game/domain/modifiers.ts tests/unit/game-interactive.test.ts
git commit -m "feat(game): overload and stabilize as weight modifiers

Pushed onto the modifier stack rather than branching the minute loop — the seam
1803 locked and 1805 already used. hold contributes nothing, so simulate() is
byte-identical and no snapshot moves."
```

---

## Task 8: The coach policy — request, grace, spent

All the request bookkeeping lives here as a pure function, not in the engine and not in a component. That keeps it testable without React and keeps the engine ignorant of buttons and clocks.

**Files:**

- Create: `src/features/game/view/coach-policy.ts`
- Test: `tests/unit/game-coach-policy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-coach-policy.test.ts
import { describe, expect, it } from "vitest";
import type { SubOfferDecision } from "@/features/game/domain/match-decisions";
import { REQUEST_GRACE } from "@/features/game/domain/match-decisions";
import {
  createCoachState,
  shouldOpenPrompt,
  requestSubstitution,
  spendRequest,
} from "@/features/game/view/coach-policy";

const offer = (minute: number, stoppage: boolean): SubOfferDecision => ({
  kind: "sub-offer",
  minute,
  side: "home",
  stoppage,
  engineSuggests: false,
  legalOff: [],
  legalOn: [],
});

describe("coach policy", () => {
  it("does not open a prompt when nothing was requested", () => {
    const st = createCoachState();
    expect(shouldOpenPrompt(st, offer(60, true))).toBe(false);
  });

  it("does not open on the request minute when play is live", () => {
    const st = requestSubstitution(createCoachState(), 60);
    expect(shouldOpenPrompt(st, offer(60, false))).toBe(false);
  });

  it("opens at the next stoppage after a request", () => {
    const st = requestSubstitution(createCoachState(), 60);
    expect(shouldOpenPrompt(st, offer(61, false))).toBe(false);
    expect(shouldOpenPrompt(st, offer(62, true))).toBe(true);
  });

  it("opens anyway once the grace period expires with no stoppage", () => {
    const st = requestSubstitution(createCoachState(), 60);
    for (let m = 61; m < 60 + REQUEST_GRACE; m++) {
      expect(shouldOpenPrompt(st, offer(m, false))).toBe(false);
    }
    expect(shouldOpenPrompt(st, offer(60 + REQUEST_GRACE, false))).toBe(true);
  });

  it("a spent request cannot re-open the prompt", () => {
    let st = requestSubstitution(createCoachState(), 60);
    expect(shouldOpenPrompt(st, offer(62, true))).toBe(true);
    st = spendRequest(st);
    expect(shouldOpenPrompt(st, offer(63, true))).toBe(false);
  });

  it("cancelling spends the opportunity just as substituting does", () => {
    // Owner decision: making the change OR cancelling both consume it, so the prompt
    // cannot be re-opened to shop around.
    let st = requestSubstitution(createCoachState(), 60);
    st = spendRequest(st);
    st = requestSubstitution(st, 64);
    expect(shouldOpenPrompt(st, offer(65, true))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node_modules/.bin/vitest run tests/unit/game-coach-policy.test.ts`
Expected: FAIL — `Failed to resolve import "@/features/game/view/coach-policy"`.

- [ ] **Step 3: Write the policy**

```ts
// src/features/game/view/coach-policy.ts
import { REQUEST_GRACE, type SubOfferDecision } from "@/features/game/domain/match-decisions";

/**
 * The coach's pending-request state.
 *
 * Lives in `view/` on purpose. The engine offers every minute of the window and knows
 * nothing about buttons or clocks; deciding whether to act on an offer is a view concern,
 * and keeping it here means it is testable without React.
 */
export interface CoachState {
  /** Minute the coach asked for a change, or null if he has not. */
  requestedAt: number | null;
}

export const createCoachState = (): CoachState => ({ requestedAt: null });

export const requestSubstitution = (st: CoachState, minute: number): CoachState => ({
  requestedAt: minute,
});

/** Making the change and cancelling both consume the opportunity (owner decision). */
export const spendRequest = (st: CoachState): CoachState => ({ requestedAt: null });

/**
 * Should this offer open the prompt?
 *
 * A request opens at the next stoppage. If none arrives within `REQUEST_GRACE` minutes
 * it opens anyway — otherwise a request can sit unanswered for a quarter of an hour and
 * the coach experiences a broken button.
 */
export function shouldOpenPrompt(st: CoachState, d: SubOfferDecision): boolean {
  if (st.requestedAt == null) return false;
  if (d.minute <= st.requestedAt) return false;
  if (d.stoppage) return true;
  return d.minute >= st.requestedAt + REQUEST_GRACE;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node_modules/.bin/vitest run tests/unit/game-coach-policy.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/view/coach-policy.ts tests/unit/game-coach-policy.test.ts
git commit -m "feat(game): coach request/grace/spent policy as a pure view function

The engine offers every minute and knows nothing about buttons or clocks;
whether to act on an offer is a view concern, so it lives in view/ and is
testable without React."
```

---

## Task 9: The decision prompt UI

**Files:**

- Create: `src/features/game/components/DecisionPrompt.tsx`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/ar.json`

- [ ] **Step 1: Add the message keys to `en.json`**

Inside the existing `"game"` object:

```json
"decision": {
  "requestSub": "Request substitution",
  "requestPending": "At the next stoppage",
  "responseTitle": "You have conceded",
  "responseBody": "How do you want to respond over the next fifteen minutes?",
  "overload": "Aggressive overload",
  "overloadHint": "Chase it. More chances created, more conceded.",
  "stabilize": "Defensive stabilization",
  "stabilizeHint": "Steady the game. Fewer chances either way.",
  "hold": "No change",
  "holdHint": "Play as you were.",
  "subTitle": "Substitution",
  "subBody": "Choose who comes off and who comes on.",
  "injuryTitle": "Forced change",
  "injuryBody": "{name} cannot continue. Choose his replacement.",
  "dismissalTitle": "Down to ten",
  "dismissalBody": "You are a player short. Reshape if you want to.",
  "cancel": "Cancel",
  "confirm": "Confirm",
  "timeLeft": "{seconds}s",
  "off": "Off",
  "on": "On"
}
```

- [ ] **Step 2: Add the same keys to `ar.json`**

```json
"decision": {
  "requestSub": "طلب تبديل",
  "requestPending": "عند التوقف القادم",
  "responseTitle": "استقبلت هدفًا",
  "responseBody": "كيف تريد الرد خلال الخمس عشرة دقيقة القادمة؟",
  "overload": "ضغط هجومي",
  "overloadHint": "طاردوا الهدف. فرص أكثر لك وعليك.",
  "stabilize": "تثبيت دفاعي",
  "stabilizeHint": "تهدئة اللعب. فرص أقل للطرفين.",
  "hold": "دون تغيير",
  "holdHint": "استمر كما أنت.",
  "subTitle": "تبديل",
  "subBody": "اختر من يخرج ومن يدخل.",
  "injuryTitle": "تغيير اضطراري",
  "injuryBody": "{name} لا يستطيع المواصلة. اختر البديل.",
  "dismissalTitle": "بعشرة لاعبين",
  "dismissalBody": "أنت ناقص لاعبًا. أعد ترتيب الفريق إن أردت.",
  "cancel": "إلغاء",
  "confirm": "تأكيد",
  "timeLeft": "{seconds}s",
  "off": "خارج",
  "on": "داخل"
}
```

⚠️ Digits stay Western in every locale — that is the standing decision from PR #97 and #117. `timeLeft` therefore renders the raw number with no `localizeDigits` call. Arabic prose and every `aria-label` stay localised.

- [ ] **Step 3: Write the component**

```tsx
// src/features/game/components/DecisionPrompt.tsx
"use client";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";

interface Props {
  decision: MatchDecision;
  /** Seconds before the prompt answers itself, or null to disable the limit. */
  limit: number | null;
  onAnswer: (a: DecisionAnswer) => void;
}

/**
 * ⚠️ The countdown NEVER reaches the engine. A timeout picks a decision, and that
 * decision is the input — recorded and replayed, a timed-out answer is indistinguishable
 * from a deliberate one. A clock read inside the generator would break replay.
 *
 * The limit is extendable and disableable (`limit: null`) per WCAG 2.2.1.
 */
export function DecisionPrompt({ decision, limit, onAnswer }: Props) {
  const t = useTranslations("game.decision");
  const [left, setLeft] = useState(limit);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    box.current?.focus();
  }, [decision]);

  useEffect(() => {
    if (limit == null) return;
    setLeft(limit);
    const id = window.setInterval(() => {
      setLeft((v) => (v == null || v <= 1 ? 0 : v - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [decision, limit]);

  useEffect(() => {
    if (left !== 0) return;
    onAnswer(fallbackFor(decision));
  }, [left, decision, onAnswer]);

  const base = { minute: decision.minute, side: decision.side };

  return (
    <div
      ref={box}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className="bg-background/95 ring-border fixed inset-x-4 bottom-6 z-50 mx-auto max-w-lg rounded-xl p-5 shadow-2xl ring-1"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">{titleFor(decision, t)}</h2>
        {left != null ? (
          <span aria-live="polite" className="text-muted-foreground font-mono text-sm">
            {t("timeLeft", { seconds: left })}
          </span>
        ) : null}
      </div>

      {decision.kind === "response" ? (
        <>
          <p className="text-muted-foreground mt-1 text-sm">{t("responseBody")}</p>
          <div className="mt-4 grid gap-2">
            {(["overload", "stabilize", "hold"] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => onAnswer({ kind: "response", ...base, choice })}
                className="border-border hover:bg-muted rounded-lg border px-4 py-3 text-start"
              >
                <span className="block font-semibold">{t(choice)}</span>
                <span className="text-muted-foreground block text-xs">{t(`${choice}Hint`)}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <SquadChoice decision={decision} onAnswer={onAnswer} />
      )}
    </div>
  );
}

function titleFor(d: MatchDecision, t: (k: string) => string): string {
  if (d.kind === "response") return t("responseTitle");
  if (d.kind === "injury-sub") return t("injuryTitle");
  if (d.kind === "dismissal") return t("dismissalTitle");
  return t("subTitle");
}

/** What a lapsed timer chooses. Always the least disruptive option. */
function fallbackFor(d: MatchDecision): DecisionAnswer {
  const base = { minute: d.minute, side: d.side };
  if (d.kind === "response") return { kind: "response", ...base, choice: "hold" };
  if (d.kind === "injury-sub") return { kind: "injury-sub", ...base, on: undefined };
  if (d.kind === "dismissal") return { kind: "dismissal", ...base };
  return { kind: "sub-offer", ...base };
}

function SquadChoice({
  decision,
  onAnswer,
}: {
  decision: Exclude<MatchDecision, { kind: "response" }>;
  onAnswer: (a: DecisionAnswer) => void;
}) {
  const t = useTranslations("game.decision");
  const legalOff = decision.kind === "injury-sub" ? [] : decision.legalOff;
  const [off, setOff] = useState<number | undefined>(
    decision.kind === "injury-sub" ? decision.off : undefined,
  );
  const [on, setOn] = useState<number | undefined>(undefined);
  const base = { minute: decision.minute, side: decision.side };

  return (
    <>
      <p className="text-muted-foreground mt-1 text-sm">
        {decision.kind === "injury-sub" ? t("injuryBody", { name: "" }) : t("subBody")}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-bold uppercase">{t("off")}</p>
          <div className="max-h-40 overflow-y-auto">
            {legalOff.map((p) => (
              <button
                key={p.playerId}
                type="button"
                onClick={() => setOff(p.playerId)}
                aria-pressed={off === p.playerId}
                className={`block w-full rounded px-2 py-1 text-start text-sm ${off === p.playerId ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-bold uppercase">{t("on")}</p>
          <div className="max-h-40 overflow-y-auto">
            {decision.legalOn.map((p) => (
              <button
                key={p.playerId}
                type="button"
                onClick={() => setOn(p.playerId)}
                aria-pressed={on === p.playerId}
                className={`block w-full rounded px-2 py-1 text-start text-sm ${on === p.playerId ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onAnswer(fallbackFor(decision))}
          className="border-border rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          disabled={decision.kind !== "injury-sub" && off == null}
          onClick={() =>
            onAnswer(
              decision.kind === "injury-sub"
                ? { kind: "injury-sub", ...base, on }
                : { kind: decision.kind, ...base, off, on },
            )
          }
          className="bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-bold disabled:opacity-50"
        >
          {t("confirm")}
        </button>
      </div>
    </>
  );
}
```

⚠️ **Guard traps in this file** (all learned the hard way on earlier game `.tsx`): never write `&apos;` — it contains the letters "apos" and fails the no-hardcoded-strings guard; use `{"'"}`. Never import from `@/features/game/adapter/*` in a client component — it is `server-only`. Any word of two or more letters must go through `t()`; bare symbols and `{expression}` values are fine.

- [ ] **Step 4: Verify the guards and the catalogue parity**

Run: `node_modules/.bin/vitest run tests/unit/i18n-catalog-parity.test.ts`
Expected: PASS — every `en` key has an `ar` counterpart.

Run: `node_modules/.bin/next lint --dir src --dir tests`
Expected: no errors.

Run: `node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/components/DecisionPrompt.tsx src/i18n/messages/en.json src/i18n/messages/ar.json
git commit -m "feat(game): the in-match decision prompt

The countdown never reaches the engine — a timeout picks a decision, and that
decision is the input, so a timed-out answer replays like a deliberate one. The
limit is extendable and disableable per WCAG 2.2.1."
```

---

## Task 10: Wire the prompt into `MatchView`

**Files:**

- Modify: `src/features/game/components/MatchView.tsx`

- [ ] **Step 1: Read how playback already pauses**

```bash
grep -n "dwell\|setInterval\|pause\|speed" src/features/game/components/MatchView.tsx
```

Goals and cards already hold playback for ~2.5s (`Math.max(1500, 2500 / speed)`). A decision reuses that mechanism: it is an indefinite hold rather than a timed one.

- [ ] **Step 2: Hold playback while a decision is open**

Add to `MatchView`:

```tsx
const [pending, setPending] = useState<MatchDecision | null>(null);
```

Gate the existing playback tick on `pending == null` — wherever the interval advances the minute cursor, return early if `pending != null`. Render the prompt when one is open:

```tsx
{
  pending != null ? (
    <DecisionPrompt
      decision={pending}
      limit={decisionLimit}
      onAnswer={(a) => {
        answer(a);
        setPending(null);
      }}
    />
  ) : null;
}
```

- [ ] **Step 3: Add the Request Substitution control**

```tsx
<button
  type="button"
  disabled={!canRequestSub}
  onClick={() => setCoach((c) => requestSubstitution(c, minute))}
  className="border-border rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
>
  {coach.requestedAt != null ? t("decision.requestPending") : t("decision.requestSub")}
</button>
```

`canRequestSub` is true only inside the substitution window, only when the bench can still cover a change, and only while no request is already pending — otherwise the button lies about what it will do.

- [ ] **Step 4: Verify**

Run: `node_modules/.bin/vitest run tests/unit/game-match-view.test.tsx`
Expected: PASS. That suite mocks `@/utils/motion` with `prefersReducedMotion: () => true` to avoid autoplay timers; keep that working.

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/next lint --dir src --dir tests`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/components/MatchView.tsx
git commit -m "feat(game): pause playback on a decision, add Request Substitution

Reuses the commentary-dwell pause that already exists, as an indefinite hold.
The request button shows a pending state so the wait for a stoppage reads as
intentional rather than as an unresponsive control."
```

---

## Task 11: Harness, docs, and the final gate

**Files:**

- Modify: `TASKS.md`
- Modify: `docs/superpowers/specs/2026-08-11-task-1830-interactive-engine-design.md`

- [ ] **Step 1: Re-run the harness explicitly**

Run: `node_modules/.bin/vitest run tests/unit/game-match-harness.test.ts`
Expected: PASS. Per the TASK-1822 calibration rule, an interactive engine must not quietly change the goal rate or the results distribution.

- [ ] **Step 2: Run everything**

```bash
node_modules/.bin/vitest run && node_modules/.bin/tsc --noEmit && node_modules/.bin/next lint --dir src --dir tests
```

Expected: all green. Record the final test count.

- [ ] **Step 3: Confirm both game routes still prerender**

```bash
node_modules/.bin/next build 2>&1 | grep -E "game|●" | head -20
```

Expected: `/game` and `/game/chaos` still marked `●` (prerendered). If either became a lambda, something imported `server-only` into a client component.

- [ ] **Step 4: Flip the ticket**

In `TASKS.md`, change the TASK-1830 row from `📋 Backlog` to `✅ Done`, and add shipped notes under `### TASK-1830` recording: the generator approach and why it beat a state-machine rewrite; that both decision seams were already PRNG-free; the `(setup, seed, decisions[])` replay contract; resume-by-replay; and the `STOPPAGE_KINDS` / `REQUEST_GRACE` definition of "next stoppage".

- [ ] **Step 5: Commit and open the PR**

```bash
git add TASKS.md docs/superpowers/specs/2026-08-11-task-1830-interactive-engine-design.md
git commit -m "docs(tasks): TASK-1830 done — the interactive engine"
git push -u origin feat/task-1830-interactive-engine
```

Then open a PR against `main` and wait for all three checks. ⚠️ The Playwright job has a known flake cloud on navigation specs. If it fails on nav specs your diff does not touch and `next build` is green, rerun the failed jobs rather than treating it as a regression.

---

## Self-review notes

**Spec coverage.** Generator approach → Task 2. Four decision points → Tasks 3, 4, 5. Replay contract and the seed-mismatch throw → Task 6. Resume by replay → Task 6 (`replayMatch` is the resume path; the IndexedDB write itself is TASK-1812 and out of scope). Timeouts staying in the view → Task 9. `simulate()` unchanged and the untouched-suite gate → every task's verification step. Response modifiers on the modifier stack → Task 7. Coach-initiated triggers, `STOPPAGE_KINDS`, `REQUEST_GRACE`, spent-on-cancel → Tasks 1 and 8. UI contract → Tasks 9 and 10. Harness → Task 11.

**Known gap, deliberate.** The spec's "a knock does not prompt" and "a dismissal prompt is declinable" tests are in Task 5; the "grace bound fires" test is in Task 8 against the pure policy rather than against a live match, because constructing a real match with a guaranteed stoppage-free stretch means pinning a seed, and a seed-pinned fixture silently stops testing the bound the moment any rate constant changes. Testing the policy directly is the honest version of that assertion.

**Open question still outstanding.** Whether a second yellow should prompt like a straight red. Built as "any dismissal" — Task 5's test asserts one prompt per red card of any reason. If the owner narrows it to straight reds, the change is one predicate in Task 5 Step 4 and one test.
