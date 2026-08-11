# TASK-1807 A — `/game/draft` Interactive Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/game/draft` route where the coach builds an XI by clicking a slot then a card (or a card then a slot), with ineligible placements never offered and an illegal squad blocking Play.

**Architecture:** A pure reducer in `view/draft-state.ts` owns the draft; `domain/fill-gaps.ts` supplies seeded auto-fill; two presentational components (`TacticalPitch`, `CardPool`) take everything as props so the logic is testable without rendering and the rendering is testable without the engine. The route is `force-static` and its prerendered HTML contains no squad.

**Tech Stack:** TypeScript, React 19 / Next 15 App Router, next-intl, Vitest + Testing Library. No new dependencies — no drag-and-drop library, no state-machine library.

**Spec:** `docs/superpowers/specs/2026-08-11-task-1807a-draft-hub-design.md`

---

## Before you start

**Read the spec.** In particular: the hard ban can only be violated by changing formation after placing players, and auto-fill cannot reuse `chaosDraft`.

**Running things** (this repo lives in WSL; pin node and run the binaries directly — a `pnpm` wrapper here breaks the husky hook):

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd ~/projects/pitchiq
```

- One test file: `node_modules/.bin/vitest run tests/unit/game-fill-gaps.test.ts`
- Full suite: `node_modules/.bin/vitest run`
- Types: `node_modules/.bin/tsc --noEmit`
- Lint: `node_modules/.bin/next lint --dir src --dir tests`
- Build: `node_modules/.bin/next build`

**Baseline before you touch anything:** run the full suite and record the number. Task 2 refactors code that `/game/chaos` prerenders from, and the existing chaos tests are its gate.

**Standing traps in this codebase** (all learned the hard way):

- `&apos;` in JSX fails the no-hardcoded-strings guard — it contains the letters "apos". A literal `'` fails `react/no-unescaped-entities`. Use `{"'"}`.
- Never import `@/features/game/adapter/*` into a client component; it is `server-only`.
- Any user-facing word of two or more letters must go through `t()`. Bare symbols and `{expression}` values are fine.
- `@keyframes` live only in `globals.css`, and the motion audit fails any that animate a layout property. `box-shadow` is allowlisted; `filter` is not.
- Per-file vitest is lenient about types; only full-project `tsc --noEmit` catches type errors in tests.

---

## File Structure

| File                                             | Responsibility                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `src/features/game/domain/fill-gaps.ts`          | **Create.** `fillGaps(pool, formation, slots, rng)` — seeded, eligibility-aware, fills only nulls. |
| `src/features/game/domain/chaos-draft.ts`        | **Modify.** `chaosDraft` re-expressed over `fillGaps`, seeded output unchanged.                    |
| `src/features/game/view/draft-eligibility.ts`    | **Create.** `eligibleCards` / `eligibleSlots` — the two directions of the highlight.               |
| `src/features/game/view/draft-state.ts`          | **Create.** `DraftState`, `draftReducer`, `validateSquad`, `isComplete`. Pure.                     |
| `src/features/game/components/TacticalPitch.tsx` | **Create.** Formation as clickable slots; Broadcast styling; Formation Morph.                      |
| `src/features/game/components/CardPool.tsx`      | **Create.** Lower-third pool strip; Grid Cascade.                                                  |
| `src/features/game/components/DraftHub.tsx`      | **Create.** Client container: reducer, auto-fill, validation, handoff to `MatchView`.              |
| `src/app/[locale]/game/draft/page.tsx`           | **Create.** `force-static` route; loads the pool at build time.                                    |
| `src/app/globals.css`                            | **Modify.** `draft-cascade` + `draft-refuse` keyframes.                                            |
| `src/i18n/messages/{en,ar}.json`                 | **Modify.** `game.draft*` keys.                                                                    |

---

## Task 1: `fillGaps` — seeded auto-fill that preserves what is placed

**Files:**

- Create: `src/features/game/domain/fill-gaps.ts`
- Test: `tests/unit/game-fill-gaps.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-fill-gaps.test.ts
import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { FORMATIONS } from "@/features/game/domain/chaos-draft";
import { fillGaps } from "@/features/game/domain/fill-gaps";
import { mulberry32 } from "@/features/game/domain/rng";

const card = (playerId: number, role: PlayerRole, altRoles: PlayerRole[] = []): PoolCard => ({
  cardId: makeCardId(playerId, 2020),
  playerId,
  season: 2020,
  name: `P${playerId}`,
  role,
  altRoles,
  foot: null,
  height: null,
  provenance: null,
  ratings: null,
  club: "Club",
});

/** Four of every role so every slot in every FORMATION can be filled legally. */
const ROLES: PlayerRole[] = [
  "GK",
  "LB",
  "CB",
  "RB",
  "LM",
  "CM",
  "RM",
  "CDM",
  "CAM",
  "LW",
  "RW",
  "CF",
];
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  [0, 1, 2, 3].map((i) => card(1000 + r * 10 + i, role)),
);
const shape = FORMATIONS[0]; // 4-4-2
const empty = () => shape.slots.map(() => null);

describe("fillGaps", () => {
  it("fills every slot with an eligible card", () => {
    const out = fillGaps(pool, shape, empty(), mulberry32(1));
    expect(out).toHaveLength(shape.slots.length);
    out.forEach((id, i) => {
      expect(id).not.toBeNull();
      const c = pool.find((p) => p.cardId === id)!;
      expect(c.role === shape.slots[i].role || c.altRoles.includes(shape.slots[i].role)).toBe(true);
    });
  });

  it("is deterministic from its rng", () => {
    expect(fillGaps(pool, shape, empty(), mulberry32(7))).toEqual(
      fillGaps(pool, shape, empty(), mulberry32(7)),
    );
  });

  it("leaves already-placed cards exactly where they are", () => {
    const placed = empty();
    placed[5] = pool.find((c) => c.role === "CM")!.cardId;
    const out = fillGaps(pool, shape, placed, mulberry32(3));
    expect(out[5]).toBe(placed[5]);
  });

  it("never duplicates a player the coach placed himself", () => {
    const mine = pool.find((c) => c.role === "CM")!;
    const placed = empty();
    placed[5] = mine.cardId;
    const out = fillGaps(pool, shape, placed, mulberry32(3));
    expect(out.filter((id) => id === mine.cardId)).toHaveLength(1);
  });

  it("never plays the same player twice", () => {
    const out = fillGaps(pool, shape, empty(), mulberry32(11));
    const ids = out.filter((id): id is NonNullable<typeof id> => id != null);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stops filling when the pool runs dry, leaving the rest null", () => {
    const tiny = pool.slice(0, 3);
    const out = fillGaps(tiny, shape, empty(), mulberry32(5));
    expect(out.filter((id) => id != null)).toHaveLength(3);
    expect(out[out.length - 1]).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node_modules/.bin/vitest run tests/unit/game-fill-gaps.test.ts`
Expected: FAIL — `Failed to resolve import "@/features/game/domain/fill-gaps"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/game/domain/fill-gaps.ts
import type { PlayerSeasonId } from "./card-id";
import type { PoolCard } from "./chaos-draft";
import { canPlay } from "./eligibility";
import type { Formation } from "./formation";

/**
 * Fill the empty slots of a formation with eligible cards, seeded.
 *
 * Extracted from `chaosDraft` so the draft hub's Auto-fill can reuse the exact same
 * selection rules. Two things it does that a whole-XI draft cannot:
 *   - it PRESERVES anything already placed, because Auto-fill is a helper and not a
 *     re-roll — quietly replacing the coach's picks would discard his work;
 *   - it takes the formation as an argument rather than choosing one.
 *
 * ⚠️ Takes an `rng` FUNCTION, not a seed. `chaosDraft` threads one `mulberry32` stream
 * through the formation pick, the XI and the bench; handing this a seed would start a
 * second stream and change every draft `/game/chaos` has ever produced.
 */
export function fillGaps(
  pool: PoolCard[],
  formation: Formation,
  slots: readonly (PlayerSeasonId | null)[],
  rng: () => number,
): (PlayerSeasonId | null)[] {
  const out = [...slots];
  // Keyed by playerId, not cardId: the same player in two different seasons is two
  // cards but still one man, and he cannot turn out twice.
  const used = new Set<number>();
  for (const id of out) {
    if (id == null) continue;
    const card = pool.find((c) => c.cardId === id);
    if (card != null) used.add(card.playerId);
  }

  formation.slots.forEach((slot, i) => {
    if (out[i] != null) return;
    const eligible = pool.filter((c) => !used.has(c.playerId) && canPlay(c, slot.role));
    const anyFree = pool.filter((c) => !used.has(c.playerId));
    const from = eligible.length ? eligible : anyFree;
    if (from.length === 0) return;
    const card = from[Math.floor(rng() * from.length)];
    used.add(card.playerId);
    out[i] = card.cardId;
  });

  return out;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node_modules/.bin/vitest run tests/unit/game-fill-gaps.test.ts`
Expected: PASS, 6 tests.

⚠️ If "stops filling when the pool runs dry" fails with 3 filled but a non-null last slot, you have used `break` semantics rather than `return` inside `forEach` — the original `chaosDraft` stopped entirely, this continues to later slots. Both leave three filled here; assert on the count and the trailing null, not on which slots.

- [ ] **Step 5: Type-check and commit**

```bash
node_modules/.bin/tsc --noEmit
git add src/features/game/domain/fill-gaps.ts tests/unit/game-fill-gaps.test.ts
git commit -m "feat(game): fillGaps — seeded auto-fill that preserves placed players"
```

---

## Task 2: Re-express `chaosDraft` over `fillGaps` without changing its output

`/game/chaos` prerenders from `chaosDraft`, and its seeded output is pinned by existing tests. This task must change nothing observable.

**Files:**

- Modify: `src/features/game/domain/chaos-draft.ts`

- [ ] **Step 1: Record the gate**

```bash
node_modules/.bin/vitest run tests/unit/game-chaos-draft.test.ts
```

Note the passing count. It must be identical at the end.

- [ ] **Step 2: Replace the XI loop**

In `chaosDraft`, replace the block that builds `chosen` (the `for (const s of shape.slots)` loop) with:

```ts
// ⚠️ The SAME rng stream is threaded through: fillGaps draws exactly once per slot
// filled, in slot order, which is what the old inline loop did. Passing a seed here
// instead would start a second stream and change every draft ever produced.
const filled = fillGaps(
  pool,
  shape,
  shape.slots.map(() => null),
  rng,
);
const byCardId = new Map(pool.map((c) => [c.cardId, c]));
const chosen: PoolCard[] = [];
for (const id of filled) {
  if (id == null) continue;
  const card = byCardId.get(id);
  if (card == null) continue;
  used.add(card.playerId);
  chosen.push(card);
}
```

Keep `const used = new Set<number>();` declared above it — the bench loop below still reads it.

- [ ] **Step 3: Add the import**

```ts
import { fillGaps } from "./fill-gaps";
```

- [ ] **Step 4: Run the chaos gate, then the full suite**

Run: `node_modules/.bin/vitest run tests/unit/game-chaos-draft.test.ts`
Expected: PASS with the same count as Step 1.

Run: `node_modules/.bin/vitest run`
Expected: PASS. **If any chaos or determinism test moved, the rng stream changed — revert and re-check that `fillGaps` draws exactly once per filled slot.** Do not update a test to match.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/chaos-draft.ts
git commit -m "refactor(game): chaosDraft builds its XI with fillGaps

Same rng stream, same seeded output — /game/chaos prerenders from this and its
draft order is pinned by tests. Sharing the selection rules stops the hub's
Auto-fill drifting away from Chaos."
```

---

## Task 3: Eligibility in both directions

**Files:**

- Create: `src/features/game/view/draft-eligibility.ts`
- Test: `tests/unit/game-draft-eligibility.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-draft-eligibility.test.ts
import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { FORMATIONS } from "@/features/game/domain/chaos-draft";
import { eligibleCards, eligibleSlots } from "@/features/game/view/draft-eligibility";

const card = (playerId: number, role: PlayerRole, altRoles: PlayerRole[] = []): PoolCard => ({
  cardId: makeCardId(playerId, 2020),
  playerId,
  season: 2020,
  name: `P${playerId}`,
  role,
  altRoles,
  foot: null,
  height: null,
  provenance: null,
  ratings: null,
  club: "Club",
});

const keeper = card(1, "GK");
const centreBack = card(2, "CB");
const utility = card(3, "CB", ["CM"]);
const pool = [keeper, centreBack, utility];
const shape = FORMATIONS[0]; // 4-4-2: GK, LB, CB, CB, RB, LM, CM, CM, RM, CF, CF

describe("eligibleCards", () => {
  it("returns only cards that can play the slot's role", () => {
    expect(eligibleCards(pool, "GK").map((c) => c.playerId)).toEqual([1]);
    expect(eligibleCards(pool, "CB").map((c) => c.playerId)).toEqual([2, 3]);
  });

  it("counts an alternate role as eligible", () => {
    expect(eligibleCards(pool, "CM").map((c) => c.playerId)).toEqual([3]);
  });

  it("returns nothing rather than falling back when no card fits", () => {
    // The ban is hard: an empty list must stay empty, never degrade to "anyone".
    expect(eligibleCards(pool, "LW")).toEqual([]);
  });
});

describe("eligibleSlots", () => {
  it("returns every slot index the card may legally fill", () => {
    expect(eligibleSlots(shape, keeper)).toEqual([0]);
    expect(eligibleSlots(shape, centreBack)).toEqual([2, 3]);
  });

  it("includes slots reachable only through an alternate role", () => {
    expect(eligibleSlots(shape, utility)).toEqual([2, 3, 6, 7]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node_modules/.bin/vitest run tests/unit/game-draft-eligibility.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/game/view/draft-eligibility.ts
import type { PlayerRole } from "@/data/schemas";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { canPlay } from "@/features/game/domain/eligibility";
import type { Formation } from "@/features/game/domain/formation";

/**
 * The two directions of the eligibility highlight.
 *
 * ⚠️ Neither falls back to "anyone" when nothing fits. `chaosDraft` deliberately does
 * fall back so a thin pool still produces an XI, but the coach must never be OFFERED an
 * illegal placement — the ban is hard, and an empty list is the correct answer.
 */

/** Cards that may fill a slot of this role. */
export function eligibleCards(pool: readonly PoolCard[], role: PlayerRole): PoolCard[] {
  return pool.filter((c) => canPlay(c, role));
}

/** Slot indices this card may legally fill, in formation order. */
export function eligibleSlots(formation: Formation, card: PoolCard): number[] {
  const out: number[] = [];
  formation.slots.forEach((slot, i) => {
    if (canPlay(card, slot.role)) out.push(i);
  });
  return out;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node_modules/.bin/vitest run tests/unit/game-draft-eligibility.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/view/draft-eligibility.ts tests/unit/game-draft-eligibility.test.ts
git commit -m "feat(game): eligibility in both directions for the draft hub"
```

---

## Task 4: The draft reducer

**Files:**

- Create: `src/features/game/view/draft-state.ts`
- Test: `tests/unit/game-draft-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-draft-state.test.ts
import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { FORMATIONS } from "@/features/game/domain/chaos-draft";
import {
  createDraftState,
  draftReducer,
  isComplete,
  validateSquad,
} from "@/features/game/view/draft-state";

const card = (playerId: number, role: PlayerRole, altRoles: PlayerRole[] = []): PoolCard => ({
  cardId: makeCardId(playerId, 2020),
  playerId,
  season: 2020,
  name: `P${playerId}`,
  role,
  altRoles,
  foot: null,
  height: null,
  provenance: null,
  ratings: null,
  club: "Club",
});

const cb = card(2, "CB");
const cb2 = card(4, "CB");
const gk = card(1, "GK");
const rb = card(5, "RB");
const pool = [gk, cb, cb2, rb];
const start = () => createDraftState(FORMATIONS[0], 123); // 4-4-2

describe("draftReducer", () => {
  it("places a card into a slot and clears the selection", () => {
    const s = draftReducer(start(), { type: "place", index: 2, cardId: cb.cardId });
    expect(s.slots[2]).toBe(cb.cardId);
    expect(s.selection).toBeNull();
  });

  it("MOVES a placed card rather than duplicating it", () => {
    // A card is a player-season; the same man cannot occupy two slots, and an XI with
    // a duplicate is one the engine cannot assemble.
    let s = draftReducer(start(), { type: "place", index: 2, cardId: cb.cardId });
    s = draftReducer(s, { type: "place", index: 3, cardId: cb.cardId });
    expect(s.slots[2]).toBeNull();
    expect(s.slots[3]).toBe(cb.cardId);
  });

  it("swaps when the destination is already occupied", () => {
    let s = draftReducer(start(), { type: "place", index: 2, cardId: cb.cardId });
    s = draftReducer(s, { type: "place", index: 3, cardId: cb2.cardId });
    s = draftReducer(s, { type: "place", index: 2, cardId: cb2.cardId });
    expect(s.slots[2]).toBe(cb2.cardId);
    expect(s.slots[3]).toBe(cb.cardId);
  });

  it("selects a slot, then a card, and places on the second click", () => {
    let s = draftReducer(start(), { type: "selectSlot", index: 2 });
    expect(s.selection).toEqual({ kind: "slot", index: 2 });
    s = draftReducer(s, { type: "selectCard", cardId: cb.cardId });
    expect(s.slots[2]).toBe(cb.cardId);
    expect(s.selection).toBeNull();
  });

  it("selects a card, then a slot, and places on the second click", () => {
    // Both instincts are common; supporting only one reads as broken to the other half.
    let s = draftReducer(start(), { type: "selectCard", cardId: cb.cardId });
    expect(s.selection).toEqual({ kind: "card", cardId: cb.cardId });
    s = draftReducer(s, { type: "selectSlot", index: 3 });
    expect(s.slots[3]).toBe(cb.cardId);
    expect(s.selection).toBeNull();
  });

  it("clicking the same slot twice deselects instead of trapping the coach", () => {
    let s = draftReducer(start(), { type: "selectSlot", index: 2 });
    s = draftReducer(s, { type: "selectSlot", index: 2 });
    expect(s.selection).toBeNull();
  });

  it("clears a slot", () => {
    let s = draftReducer(start(), { type: "place", index: 2, cardId: cb.cardId });
    s = draftReducer(s, { type: "clearSlot", index: 2 });
    expect(s.slots[2]).toBeNull();
  });

  it("keeps players in place when the formation changes", () => {
    // They are flagged by validateSquad, never silently dropped — dropping them would
    // discard the coach's work invisibly.
    let s = draftReducer(start(), { type: "place", index: 2, cardId: cb.cardId });
    s = draftReducer(s, { type: "setFormation", formation: FORMATIONS[2] }); // 3-5-2
    expect(s.slots[2]).toBe(cb.cardId);
    expect(s.formation.name).toBe("3-5-2");
  });
});

describe("validateSquad", () => {
  it("passes a legal XI", () => {
    let s = draftReducer(start(), { type: "place", index: 0, cardId: gk.cardId });
    s = draftReducer(s, { type: "place", index: 2, cardId: cb.cardId });
    expect(validateSquad(s, pool)).toEqual([]);
  });

  it("⚠️ reports a player left misplaced by a formation change, naming him and the slot", () => {
    // THE case the hard ban exists for. Click-to-place never offers an illegal slot, so
    // this is the only way an illegal XI can arise through the UI — and it is easy to hit.
    //
    // Slot 4 is the one index whose role genuinely changes between these two shapes:
    //   FORMATIONS[0] 4-4-2 → [GK, LB, CB, CB, RB, LM, CM, CM, RM, CF, CF]
    //   FORMATIONS[2] 3-5-2 → [GK, CB, CB, CB, LM, CM, CAM, CM, RM, CF, CF]
    // So a right-back is legal at index 4 in a 4-4-2 and illegal there in a 3-5-2.
    let s = draftReducer(start(), { type: "place", index: 4, cardId: rb.cardId });
    expect(validateSquad(s, pool)).toEqual([]);
    s = draftReducer(s, { type: "setFormation", formation: FORMATIONS[2] });
    const errors = validateSquad(s, pool);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      slotIndex: 4,
      role: "LM",
      cardId: rb.cardId,
      playerName: "P5",
    });
  });

  it("ignores empty slots — incompleteness is not an eligibility offence", () => {
    expect(validateSquad(start(), pool)).toEqual([]);
  });
});

describe("isComplete", () => {
  it("is false while any slot is empty", () => {
    expect(isComplete(start())).toBe(false);
  });

  it("is true once every slot is filled", () => {
    let s = start();
    s.formation.slots.forEach((_, i) => {
      s = draftReducer(s, { type: "place", index: i, cardId: makeCardId(900 + i, 2020) });
    });
    expect(isComplete(s)).toBe(true);
  });
});
```

⚠️ The formation-change test asserts against real `FORMATIONS` data, and slot 4 was chosen because it is the one index whose role genuinely changes between 4-4-2 (`RB`) and 3-5-2 (`LM`) while leaving a right-back legal in the first and illegal in the second. **If `FORMATIONS` is ever edited, re-derive that index rather than adjusting the assertion** — a test that passes because the two roles happen to match is testing nothing, which is exactly the trap the TASK-1830 harness hit.

- [ ] **Step 2: Run it to make sure it fails**

Run: `node_modules/.bin/vitest run tests/unit/game-draft-state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/game/view/draft-state.ts
import type { PlayerRole } from "@/data/schemas";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { canPlay } from "@/features/game/domain/eligibility";
import type { Formation } from "@/features/game/domain/formation";

export type Selection = { kind: "slot"; index: number } | { kind: "card"; cardId: PlayerSeasonId };

export interface DraftState {
  formation: Formation;
  /** By slot index. `null` = empty. Holds cardIds, so there is one source of truth. */
  slots: (PlayerSeasonId | null)[];
  selection: Selection | null;
  seed: number;
}

export type DraftAction =
  | { type: "selectSlot"; index: number }
  | { type: "selectCard"; cardId: PlayerSeasonId }
  | { type: "place"; index: number; cardId: PlayerSeasonId }
  | { type: "clearSlot"; index: number }
  | { type: "setFormation"; formation: Formation }
  /** Slots computed outside — `fillGaps` needs the pool, which the reducer must not hold. */
  | { type: "setSlots"; slots: (PlayerSeasonId | null)[] }
  | { type: "reset"; formation: Formation; seed: number };

export function createDraftState(formation: Formation, seed: number): DraftState {
  return { formation, slots: formation.slots.map(() => null), selection: null, seed };
}

/**
 * Put a card in a slot, moving it if it is already on the pitch and swapping if the
 * destination is taken. A card is a player-season, so the same man cannot occupy two
 * slots — an XI with a duplicate is one the engine cannot assemble.
 */
function placeCard(state: DraftState, index: number, cardId: PlayerSeasonId): DraftState {
  const slots = [...state.slots];
  const from = slots.indexOf(cardId);
  const displaced = slots[index];
  slots[index] = cardId;
  if (from >= 0 && from !== index) slots[from] = displaced;
  return { ...state, slots, selection: null };
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "selectSlot": {
      if (state.selection?.kind === "card") {
        return placeCard(state, action.index, state.selection.cardId);
      }
      // Clicking the same slot again deselects, rather than trapping the coach in a
      // selection he has to place before he can do anything else.
      if (state.selection?.kind === "slot" && state.selection.index === action.index) {
        return { ...state, selection: null };
      }
      return { ...state, selection: { kind: "slot", index: action.index } };
    }
    case "selectCard": {
      if (state.selection?.kind === "slot") {
        return placeCard(state, state.selection.index, action.cardId);
      }
      if (state.selection?.kind === "card" && state.selection.cardId === action.cardId) {
        return { ...state, selection: null };
      }
      return { ...state, selection: { kind: "card", cardId: action.cardId } };
    }
    case "place":
      return placeCard(state, action.index, action.cardId);
    case "clearSlot": {
      const slots = [...state.slots];
      slots[action.index] = null;
      return { ...state, slots, selection: null };
    }
    case "setFormation": {
      // Players stay where they are. Anything now in the wrong role is reported by
      // validateSquad and blocks Play; dropping them would discard the coach's work
      // invisibly. Every FORMATIONS entry has eleven slots, so indices line up.
      const slots = action.formation.slots.map((_, i) => state.slots[i] ?? null);
      return { ...state, formation: action.formation, slots, selection: null };
    }
    case "setSlots":
      return { ...state, slots: [...action.slots], selection: null };
    case "reset":
      return createDraftState(action.formation, action.seed);
  }
}

export interface SquadError {
  slotIndex: number;
  role: PlayerRole;
  cardId: PlayerSeasonId;
  playerName: string;
}

/**
 * Every placed player who is not eligible for the slot he stands in.
 *
 * ⚠️ In practice this can only fire after a formation change — click-to-place never
 * offers an illegal slot, so the ban is otherwise enforced by construction. That is
 * exactly why it must exist: re-roling the slots underneath a placed XI is easy to do
 * and produces a squad the engine would otherwise be handed.
 */
export function validateSquad(state: DraftState, pool: readonly PoolCard[]): SquadError[] {
  const errors: SquadError[] = [];
  state.slots.forEach((cardId, slotIndex) => {
    if (cardId == null) return;
    const card = pool.find((c) => c.cardId === cardId);
    if (card == null) return;
    const slot = state.formation.slots[slotIndex];
    if (slot == null || canPlay(card, slot.role)) return;
    errors.push({ slotIndex, role: slot.role, cardId, playerName: card.name });
  });
  return errors;
}

/** Incompleteness is not an eligibility offence — it is a separate reason Play is off. */
export function isComplete(state: DraftState): boolean {
  return state.slots.every((s) => s != null);
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node_modules/.bin/vitest run tests/unit/game-draft-state.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Type-check and commit**

```bash
node_modules/.bin/tsc --noEmit
git add src/features/game/view/draft-state.ts tests/unit/game-draft-state.test.ts
git commit -m "feat(game): the draft reducer, with the hard ban that only a formation change can trip"
```

---

## Task 5: `TacticalPitch`

**Files:**

- Create: `src/features/game/components/TacticalPitch.tsx`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/ar.json`
- Test: `tests/unit/game-tactical-pitch.test.tsx`

- [ ] **Step 1: Add the message keys to `en.json`**

Inside the existing flat `"game"` object (the namespace is flat camelCase — do not introduce nesting):

```json
"draftTitle": "Build your XI",
"draftSubtitle": "Pick a slot, then a player. Or a player, then a slot.",
"draftPitchAria": "Formation slots",
"draftPoolAria": "Available players",
"draftEmptySlot": "Empty {role} slot",
"draftFilledSlot": "{name}, {role}",
"draftAutoFill": "Auto-fill",
"draftReroll": "Re-roll",
"draftClear": "Clear",
"draftPlay": "Play match",
"draftFormation": "Formation",
"draftIncomplete": "Fill every slot to play.",
"draftIllegal": "{name} cannot play {role}.",
"draftEligibleCount": "{count} eligible"
```

- [ ] **Step 2: Add the same keys to `ar.json`**

```json
"draftTitle": "ابنِ تشكيلتك",
"draftSubtitle": "اختر مركزًا ثم لاعبًا. أو لاعبًا ثم مركزًا.",
"draftPitchAria": "مراكز التشكيلة",
"draftPoolAria": "اللاعبون المتاحون",
"draftEmptySlot": "مركز {role} شاغر",
"draftFilledSlot": "{name}، {role}",
"draftAutoFill": "ملء تلقائي",
"draftReroll": "إعادة التوزيع",
"draftClear": "مسح",
"draftPlay": "ابدأ المباراة",
"draftFormation": "التشكيلة",
"draftIncomplete": "املأ كل المراكز لبدء المباراة.",
"draftIllegal": "{name} لا يمكنه اللعب في مركز {role}.",
"draftEligibleCount": "{count} مؤهل"
```

- [ ] **Step 3: Write the failing test**

```tsx
// tests/unit/game-tactical-pitch.test.tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { FORMATIONS } from "@/features/game/domain/chaos-draft";
import { renderWithIntl } from "./_helpers/intl";

const { TacticalPitch } = await import("@/features/game/components/TacticalPitch");

const cb: PoolCard = {
  cardId: makeCardId(2, 2020),
  playerId: 2,
  season: 2020,
  name: "Tony Adams",
  role: "CB",
  altRoles: [],
  foot: null,
  height: null,
  provenance: null,
  ratings: null,
  club: "Arsenal",
};

const shape = FORMATIONS[0];
const empty = shape.slots.map(() => null);

describe("TacticalPitch", () => {
  it("renders one control per formation slot", () => {
    renderWithIntl(
      <TacticalPitch
        formation={shape}
        slots={empty}
        cards={[]}
        selectedSlot={null}
        highlighted={[]}
        errors={[]}
        onSelectSlot={vi.fn()}
        reduced
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(shape.slots.length);
  });

  it("shows the player's name once a slot is filled", () => {
    const slots = [...empty];
    slots[2] = cb.cardId;
    renderWithIntl(
      <TacticalPitch
        formation={shape}
        slots={slots}
        cards={[cb]}
        selectedSlot={null}
        highlighted={[]}
        errors={[]}
        onSelectSlot={vi.fn()}
        reduced
      />,
    );
    expect(screen.getByText("Tony Adams")).toBeInTheDocument();
  });

  it("reports the clicked slot index", async () => {
    const onSelectSlot = vi.fn<(i: number) => void>();
    const user = userEvent.setup();
    renderWithIntl(
      <TacticalPitch
        formation={shape}
        slots={empty}
        cards={[]}
        selectedSlot={null}
        highlighted={[]}
        errors={[]}
        onSelectSlot={onSelectSlot}
        reduced
      />,
    );
    await user.click(screen.getAllByRole("button")[3]);
    expect(onSelectSlot).toHaveBeenCalledWith(3);
  });

  it("marks a slot holding an ineligible player", () => {
    const slots = [...empty];
    slots[4] = cb.cardId;
    renderWithIntl(
      <TacticalPitch
        formation={shape}
        slots={slots}
        cards={[cb]}
        selectedSlot={null}
        highlighted={[]}
        errors={[{ slotIndex: 4, role: "RB", cardId: cb.cardId, playerName: "Tony Adams" }]}
        onSelectSlot={vi.fn()}
        reduced
      />,
    );
    expect(screen.getAllByRole("button")[4]).toHaveAttribute("data-invalid", "true");
  });
});
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `node_modules/.bin/vitest run tests/unit/game-tactical-pitch.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 5: Write the component**

```tsx
// src/features/game/components/TacticalPitch.tsx
"use client";
import { useTranslations } from "next-intl";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import type { Formation } from "@/features/game/domain/formation";
import type { SquadError } from "@/features/game/view/draft-state";

interface Props {
  formation: Formation;
  slots: readonly (PlayerSeasonId | null)[];
  cards: readonly PoolCard[];
  selectedSlot: number | null;
  /** Slot indices the currently-held card may legally fill. */
  highlighted: readonly number[];
  errors: readonly SquadError[];
  onSelectSlot: (index: number) => void;
  reduced: boolean;
}

/**
 * The formation as clickable slots, in the Broadcast Teamsheet language — dark ground,
 * cyan keylines, attackers at the top.
 *
 * Presentational on purpose: every piece of state arrives as a prop, so the reducer is
 * testable without rendering and this is testable without the engine.
 *
 * Formation Morph rides an inline `transform` transition rather than a keyframe. The
 * motion audit governs `@keyframes` only, and a slot's position is a layout property —
 * animating it as a transform is both compliant and the only way it can be smooth.
 */
export function TacticalPitch({
  formation,
  slots,
  cards,
  selectedSlot,
  highlighted,
  errors,
  onSelectSlot,
  reduced,
}: Props) {
  const t = useTranslations("game");
  const byId = new Map(cards.map((c) => [c.cardId, c]));
  const invalid = new Set(errors.map((e) => e.slotIndex));
  const rows = [...new Set(formation.slots.map((s) => s.row))].sort((a, b) => b - a);

  return (
    <div
      role="group"
      aria-label={t("draftPitchAria")}
      className="rounded-2xl bg-[radial-gradient(120%_80%_at_50%_-10%,#12202c,#060a0f)] p-4 shadow-2xl ring-1 ring-cyan-400/20"
    >
      {rows.map((row) => (
        <div key={row} className="my-3 flex justify-center gap-3">
          {formation.slots.map((slot, i) => {
            if (slot.row !== row) return null;
            const card = slots[i] != null ? byId.get(slots[i]!) : undefined;
            const isSelected = selectedSlot === i;
            const isLegal = highlighted.includes(i);
            const isInvalid = invalid.has(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelectSlot(i)}
                aria-pressed={isSelected}
                data-invalid={isInvalid ? "true" : undefined}
                aria-label={
                  card
                    ? t("draftFilledSlot", { name: card.name, role: slot.role })
                    : t("draftEmptySlot", { role: slot.role })
                }
                style={{
                  transition: reduced ? undefined : "transform 320ms cubic-bezier(.5,0,.2,1)",
                }}
                className={[
                  "flex h-20 w-20 flex-col items-center justify-center rounded-lg border text-center",
                  isInvalid
                    ? "border-red-500 bg-red-500/15"
                    : isSelected
                      ? "border-cyan-300 bg-cyan-400/20"
                      : isLegal
                        ? "border-emerald-400 bg-emerald-400/10"
                        : card
                          ? "border-cyan-400/30 bg-cyan-400/5"
                          : "border-dashed border-white/25",
                ].join(" ")}
              >
                <span className="font-mono text-[10px] uppercase tracking-wider text-cyan-200/70">
                  {slot.role}
                </span>
                {card ? (
                  <span className="mt-1 line-clamp-2 px-1 text-[11px] font-semibold leading-tight text-white">
                    {card.name}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Run the tests, the guards, and type-check**

Run: `node_modules/.bin/vitest run tests/unit/game-tactical-pitch.test.tsx tests/unit/no-hardcoded-strings.test.ts tests/unit/i18n-catalog-parity.test.ts`
Expected: PASS.

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/next lint --dir src --dir tests`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/game/components/TacticalPitch.tsx tests/unit/game-tactical-pitch.test.tsx src/i18n/messages/en.json src/i18n/messages/ar.json
git commit -m "feat(game): TacticalPitch — clickable formation slots in the broadcast language"
```

---

## Task 6: `CardPool` with Grid Cascade

**Files:**

- Create: `src/features/game/components/CardPool.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/unit/game-card-pool.test.tsx`

- [ ] **Step 1: Add the keyframes to `globals.css`**

Next to the other game keyframes (`chaos-deal-in`, `game-event-in`):

```css
/* Grid Cascade — the pool re-sorts in a staggered wave as eligibility changes.
   Transform + opacity ONLY: the motion audit fails any keyframe animating a layout
   property, and a genuine re-sort moves elements. */
@keyframes draft-cascade {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* The cascade refusing to admit — a stuttered half-step that reverses. */
@keyframes draft-refuse {
  0%,
  100% {
    transform: translateX(0);
  }
  30% {
    transform: translateX(-4px);
  }
  60% {
    transform: translateX(3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .draft-card {
    animation: none !important;
  }
}
```

- [ ] **Step 2: Write the failing test**

```tsx
// tests/unit/game-card-pool.test.tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { renderWithIntl } from "./_helpers/intl";

const { CardPool } = await import("@/features/game/components/CardPool");

const mk = (id: number, name: string, role: "CB" | "CF"): PoolCard => ({
  cardId: makeCardId(id, 2020),
  playerId: id,
  season: 2020,
  name,
  role,
  altRoles: [],
  foot: null,
  height: null,
  provenance: null,
  ratings: null,
  club: "Club",
});

const adams = mk(2, "Tony Adams", "CB");
const henry = mk(3, "Thierry Henry", "CF");
const pool = [adams, henry];

describe("CardPool", () => {
  it("renders every card when nothing is selected", () => {
    renderWithIntl(
      <CardPool
        cards={pool}
        eligible={null}
        placed={[]}
        selectedCard={null}
        onSelectCard={vi.fn()}
        reduced
      />,
    );
    expect(screen.getByRole("button", { name: /Tony Adams/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Thierry Henry/ })).toBeInTheDocument();
  });

  it("disables cards that cannot fill the selected slot", () => {
    // The hard ban enforced by construction: an ineligible card is not clickable, so
    // the coach is never offered a placement the rules would have to reject.
    renderWithIntl(
      <CardPool
        cards={pool}
        eligible={[adams.cardId]}
        placed={[]}
        selectedCard={null}
        onSelectCard={vi.fn()}
        reduced
      />,
    );
    expect(screen.getByRole("button", { name: /Thierry Henry/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Tony Adams/ })).toBeEnabled();
  });

  it("marks a card already on the pitch", () => {
    renderWithIntl(
      <CardPool
        cards={pool}
        eligible={null}
        placed={[adams.cardId]}
        selectedCard={null}
        onSelectCard={vi.fn()}
        reduced
      />,
    );
    expect(screen.getByRole("button", { name: /Tony Adams/ })).toHaveAttribute(
      "data-placed",
      "true",
    );
  });

  it("reports the clicked card", async () => {
    const onSelectCard = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <CardPool
        cards={pool}
        eligible={null}
        placed={[]}
        selectedCard={null}
        onSelectCard={onSelectCard}
        reduced
      />,
    );
    await user.click(screen.getByRole("button", { name: /Thierry Henry/ }));
    expect(onSelectCard).toHaveBeenCalledWith(henry.cardId);
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `node_modules/.bin/vitest run tests/unit/game-card-pool.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the component**

```tsx
// src/features/game/components/CardPool.tsx
"use client";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";

interface Props {
  cards: readonly PoolCard[];
  /** Card ids that may fill the selected slot, or null when no slot is selected. */
  eligible: readonly PlayerSeasonId[] | null;
  placed: readonly PlayerSeasonId[];
  selectedCard: PlayerSeasonId | null;
  onSelectCard: (cardId: PlayerSeasonId) => void;
  reduced: boolean;
}

/**
 * The lower-third pool strip.
 *
 * Grid Cascade: when eligibility changes the eligible cards sort to the front and the
 * whole strip restages in a staggered wave, so THE POOL is the feedback surface — no
 * banner, no toast. The re-order is a React key reorder; the motion is a per-card
 * `animation-delay` on a transform/opacity keyframe, which is what keeps it clear of
 * the motion audit's ban on animating layout properties.
 */
export function CardPool({ cards, eligible, placed, selectedCard, onSelectCard, reduced }: Props) {
  const t = useTranslations("game");
  const eligibleSet = useMemo(() => (eligible ? new Set(eligible) : null), [eligible]);
  const placedSet = useMemo(() => new Set(placed), [placed]);

  const ordered = useMemo(() => {
    if (eligibleSet == null) return [...cards];
    // Eligible first, original order preserved within each group so the cascade reads
    // as a re-sort rather than a reshuffle.
    return [...cards].sort((a, b) => {
      const ea = eligibleSet.has(a.cardId) ? 0 : 1;
      const eb = eligibleSet.has(b.cardId) ? 0 : 1;
      return ea - eb;
    });
  }, [cards, eligibleSet]);

  // Changing this restages the cascade — the eligible set IS the reason to replay it.
  const stageKey = eligible ? eligible.length : -1;

  return (
    <div
      role="group"
      aria-label={t("draftPoolAria")}
      className="mt-4 rounded-xl border border-cyan-400/20 bg-[#060a0f]/80 p-3"
    >
      {eligibleSet != null ? (
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-cyan-200/70">
          {t("draftEligibleCount", { count: eligibleSet.size })}
        </p>
      ) : null}
      <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-6">
        {ordered.map((card, i) => {
          const allowed = eligibleSet == null || eligibleSet.has(card.cardId);
          const isPlaced = placedSet.has(card.cardId);
          return (
            <button
              key={`${stageKey}:${card.cardId}`}
              type="button"
              disabled={!allowed}
              onClick={() => onSelectCard(card.cardId)}
              aria-pressed={selectedCard === card.cardId}
              data-placed={isPlaced ? "true" : undefined}
              style={
                reduced
                  ? undefined
                  : {
                      animation: "draft-cascade 260ms both",
                      animationDelay: `${Math.min(i, 24) * 18}ms`,
                    }
              }
              className={[
                "draft-card rounded-lg border p-2 text-start",
                selectedCard === card.cardId
                  ? "border-cyan-300 bg-cyan-400/20"
                  : isPlaced
                    ? "border-emerald-400/50 bg-emerald-400/10"
                    : "border-white/10 bg-white/5",
                allowed ? "hover:border-cyan-300/60" : "opacity-30",
              ].join(" ")}
            >
              <span className="block truncate text-[11px] font-semibold text-white">
                {card.name}
              </span>
              <span className="block font-mono text-[10px] text-cyan-200/60">{card.role}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests and the motion audit**

Run: `node_modules/.bin/vitest run tests/unit/game-card-pool.test.tsx tests/unit/motion-audit.test.ts tests/unit/no-hardcoded-strings.test.ts`
Expected: PASS. **If the motion audit fails, a keyframe is animating a layout property — the cascade must be transform/opacity only.**

- [ ] **Step 6: Commit**

```bash
git add src/features/game/components/CardPool.tsx tests/unit/game-card-pool.test.tsx src/app/globals.css
git commit -m "feat(game): CardPool with Grid Cascade

The pool is the feedback surface — eligible cards sort to the front and the strip
restages in a staggered wave. Transform/opacity only, reduced-motion gated."
```

---

## Task 7: `DraftHub` container

**Files:**

- Create: `src/features/game/components/DraftHub.tsx`
- Test: `tests/unit/game-draft-hub.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/game-draft-hub.test.tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { DraftHub } = await import("@/features/game/components/DraftHub");

const ROLES = ["GK", "LB", "CB", "RB", "LM", "CM", "RM", "CDM", "CAM", "LW", "RW", "CF"] as const;
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  [0, 1, 2, 3].map((i) => ({
    cardId: makeCardId(1000 + r * 10 + i, 2020),
    playerId: 1000 + r * 10 + i,
    season: 2020,
    name: `${role}-${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: null,
    club: "Club",
  })),
);

describe("DraftHub", () => {
  it("starts with no squad on the pitch", () => {
    // The route is force-static: a squad in the prerendered HTML is served identically
    // to everyone and then visibly swapped (PR #97).
    renderWithIntl(<DraftHub pool={pool} />);
    expect(screen.getByRole("button", { name: /Play match/ })).toBeDisabled();
  });

  it("blocks Play until every slot is filled", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} />);
    expect(screen.getByRole("button", { name: /Play match/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Auto-fill/ }));
    expect(screen.getByRole("button", { name: /Play match/ })).toBeEnabled();
  });

  it("auto-fill produces a squad that passes validation", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} />);
    await user.click(screen.getByRole("button", { name: /Auto-fill/ }));
    expect(screen.queryByText(/cannot play/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node_modules/.bin/vitest run tests/unit/game-draft-hub.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the container**

```tsx
// src/features/game/components/DraftHub.tsx
"use client";
import { useTranslations } from "next-intl";
import { useMemo, useReducer, useState } from "react";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import { FORMATIONS, type PoolCard } from "@/features/game/domain/chaos-draft";
import { fillGaps } from "@/features/game/domain/fill-gaps";
import { mulberry32 } from "@/features/game/domain/rng";
import { eligibleCards, eligibleSlots } from "@/features/game/view/draft-eligibility";
import {
  createDraftState,
  draftReducer,
  isComplete,
  validateSquad,
} from "@/features/game/view/draft-state";
import { randomSeed } from "@/features/game/view/seed";
import { prefersReducedMotion } from "@/utils/motion";
import { CardPool } from "./CardPool";
import { TacticalPitch } from "./TacticalPitch";

/** Fixed for the server render only — the route is force-static. */
const INITIAL_SEED = 20260811;

export function DraftHub({ pool }: { pool: PoolCard[] }) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();
  const [formationIndex, setFormationIndex] = useState(0);
  const [state, dispatch] = useReducer(draftReducer, createDraftState(FORMATIONS[0], INITIAL_SEED));

  const byId = useMemo(() => new Map(pool.map((c) => [c.cardId, c])), [pool]);
  const errors = useMemo(() => validateSquad(state, pool), [state, pool]);
  const complete = isComplete(state);
  const placed = useMemo(
    () => state.slots.filter((s): s is PlayerSeasonId => s != null),
    [state.slots],
  );

  // Selecting a slot filters the pool; selecting a card lights the legal slots. Both
  // directions, because both instincts are common.
  const selectedSlot = state.selection?.kind === "slot" ? state.selection.index : null;
  const selectedCard = state.selection?.kind === "card" ? state.selection.cardId : null;
  const eligible = useMemo(() => {
    if (selectedSlot == null) return null;
    const role = state.formation.slots[selectedSlot].role;
    return eligibleCards(pool, role).map((c) => c.cardId);
  }, [selectedSlot, state.formation, pool]);
  const highlighted = useMemo(() => {
    if (selectedCard == null) return [];
    const card = byId.get(selectedCard);
    return card ? eligibleSlots(state.formation, card) : [];
  }, [selectedCard, state.formation, byId]);

  const autoFill = () => {
    const seed = randomSeed();
    dispatch({
      type: "setSlots",
      slots: fillGaps(pool, state.formation, state.slots, mulberry32(seed)),
    });
  };
  const reroll = () => {
    const seed = randomSeed();
    const empty = state.formation.slots.map(() => null);
    dispatch({ type: "setSlots", slots: fillGaps(pool, state.formation, empty, mulberry32(seed)) });
  };
  const changeFormation = (i: number) => {
    setFormationIndex(i);
    dispatch({ type: "setFormation", formation: FORMATIONS[i] });
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("draftTitle")}</h1>
      <p className="text-muted-foreground mb-4 mt-1 text-sm">{t("draftSubtitle")}</p>

      <div role="group" aria-label={t("draftFormation")} className="mb-3 flex flex-wrap gap-2">
        {FORMATIONS.map((f, i) => (
          <button
            key={f.name}
            type="button"
            onClick={() => changeFormation(i)}
            aria-pressed={formationIndex === i}
            className={
              formationIndex === i
                ? "bg-primary text-primary-foreground rounded-md px-3 py-1.5 font-mono text-xs font-bold"
                : "border-border rounded-md border px-3 py-1.5 font-mono text-xs font-bold"
            }
          >
            {f.name}
          </button>
        ))}
      </div>

      <TacticalPitch
        formation={state.formation}
        slots={state.slots}
        cards={pool}
        selectedSlot={selectedSlot}
        highlighted={highlighted}
        errors={errors}
        onSelectSlot={(index) => dispatch({ type: "selectSlot", index })}
        reduced={reduced}
      />

      <CardPool
        cards={pool}
        eligible={eligible}
        placed={placed}
        selectedCard={selectedCard}
        onSelectCard={(cardId) => dispatch({ type: "selectCard", cardId })}
        reduced={reduced}
      />

      {errors.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {errors.map((e) => (
            <li key={e.slotIndex} className="text-sm font-semibold text-red-400">
              {t("draftIllegal", { name: e.playerName, role: e.role })}
            </li>
          ))}
        </ul>
      ) : null}
      {!complete && errors.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm">{t("draftIncomplete")}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={autoFill}
          className="border-border bg-muted rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {t("draftAutoFill")}
        </button>
        <button
          type="button"
          onClick={reroll}
          className="border-border rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {t("draftReroll")}
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "reset", formation: state.formation, seed: state.seed })}
          className="border-border rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {t("draftClear")}
        </button>
        <button
          type="button"
          disabled={!complete || errors.length > 0}
          className="bg-primary text-primary-foreground ms-auto rounded-md px-5 py-2 text-sm font-bold disabled:opacity-50"
        >
          {t("draftPlay")}
        </button>
      </div>
    </div>
  );
}
```

⚠️ **Play is deliberately inert in this task.** The handoff lands in Task 8, so this commit is a hub you can build a legal XI in but not yet play. Splitting it keeps the validation logic reviewable on its own.

- [ ] **Step 4: Run the tests, types and lint**

Run: `node_modules/.bin/vitest run tests/unit/game-draft-hub.test.tsx`
Expected: PASS, 3 tests.

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/next lint --dir src --dir tests`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/components/DraftHub.tsx tests/unit/game-draft-hub.test.tsx
git commit -m "feat(game): DraftHub container — both paths, both selection directions

Play stays inert until the handoff lands in the next commit, so the validation
logic is reviewable on its own."
```

---

## Task 8: Handoff to the match

**Files:**

- Modify: `src/features/game/components/DraftHub.tsx`
- Test: `tests/unit/game-draft-hub.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/game-draft-hub.test.tsx`:

```tsx
it("plays the drafted XI once it is legal and complete", async () => {
  const user = userEvent.setup();
  renderWithIntl(<DraftHub pool={pool} />);
  await user.click(screen.getByRole("button", { name: /Auto-fill/ }));
  await user.click(screen.getByRole("button", { name: /Play match/ }));
  // The broadcast scoreboard replaces the hub.
  expect(screen.queryByRole("button", { name: /Auto-fill/ })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node_modules/.bin/vitest run tests/unit/game-draft-hub.test.tsx -t "plays the drafted"`
Expected: FAIL — Auto-fill is still in the document, because Play does nothing.

- [ ] **Step 3: Build the team and hand off**

Add to `DraftHub.tsx`:

```tsx
import { opponentSetup } from "@/features/game/domain/opponent";
import { simulate } from "@/features/game/domain/simulate";
import { makeGameTeam } from "@/features/game/domain/team";
import { chaosMatchup } from "@/features/game/domain/chaos-draft";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";
import { MatchView } from "./MatchView";
```

```tsx
const [playing, setPlaying] = useState(false);

/**
 * Assemble the drafted XI into a GameTeam and simulate.
 *
 * ⚠️ Kept as ONE function on purpose: 1807 B replaces this whole body with a redirect
 * into /game/play, and a handoff scattered across the component would be much harder
 * to move.
 */
const model = useMemo(() => {
  if (!playing) return null;
  const players = state.slots
    .map((id) => (id != null ? byId.get(id) : undefined))
    .filter((c): c is PoolCard => c != null);
  const seed = randomSeed();
  // The opponent is an auto-drafted XI, exactly as Chaos does it, so the pitch fills.
  const matchup = chaosMatchup(pool, seed, { home: t("yourXi"), away: t("rivals") });
  const home = makeGameTeam(-1, t("yourXi"), 0, state.formation, players, matchup.home.bench);
  const opponentTeam = matchup.opponent.kind === "squad" ? matchup.opponent.team : matchup.home;
  const result = simulate(
    opponentSetup({
      home,
      homeStyle: matchup.homeStyle,
      opponent: matchup.opponent,
      season: 0,
      seed,
      targetGoalsPerMatch: 2.7,
    }),
  );
  return buildMatchViewModel(home, opponentTeam, result);
}, [playing, state.slots, state.formation, byId, pool, t]);

if (playing && model != null) return <MatchView model={model} />;
```

Place the `if (playing …)` return immediately before the component's main `return`, and wire the Play button:

```tsx
          onClick={() => setPlaying(true)}
```

- [ ] **Step 4: Run the tests, types and lint**

Run: `node_modules/.bin/vitest run tests/unit/game-draft-hub.test.tsx`
Expected: PASS, 4 tests.

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/next lint --dir src --dir tests`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/components/DraftHub.tsx tests/unit/game-draft-hub.test.tsx
git commit -m "feat(game): play the drafted XI

Handoff kept as one function so 1807 B can replace it with a redirect into
/game/play without unpicking it from the component."
```

---

## Task 9: The route

**Files:**

- Create: `src/app/[locale]/game/draft/page.tsx`

- [ ] **Step 1: Write the route**

```tsx
// src/app/[locale]/game/draft/page.tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadChaosPool } from "@/features/game/adapter/chaos-pool";
import { DraftHub } from "@/features/game/components/DraftHub";

// force-static, exactly like /game and /game/chaos. The M71 arc exists to keep every
// route CDN-served; a dynamic render here would put game weight back on a lambda.
export const dynamic = "force-static";
export const revalidate = 86400;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("draftTitle"), description: t("draftSubtitle") };
}

export default async function DraftPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const pool = await loadChaosPool();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <DraftHub pool={pool} />
    </main>
  );
}
```

- [ ] **Step 2: Build and confirm it prerenders**

Run: `node_modules/.bin/next build 2>&1 | grep -E "game"`

Expected — all three routes marked `●`, each with `/en/…` and `/ar/…`:

```
├ ● /[locale]/game
├ ● /[locale]/game/chaos
├ ● /[locale]/game/draft
```

⚠️ If `/game/draft` shows `ƒ` (dynamic) instead of `●`, something in the tree read a request-time value. If `/game` or `/game/chaos` changed, Task 2's refactor was not output-neutral.

- [ ] **Step 3: Confirm the prerendered HTML contains no squad**

```bash
grep -c "draft-card" .next/server/app/en/game/draft.html || echo "no cards prerendered"
```

Expected: the pool renders (it is static), but **no slot holds a player** — the pitch ships empty. Confirm by checking that no `data-placed` attribute appears:

```bash
grep -c 'data-placed' .next/server/app/en/game/draft.html || echo "no placed players — correct"
```

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/game/draft/page.tsx"
git commit -m "feat(game): the /game/draft route, force-static in en + ar"
```

---

## Task 10: Docs and PR

**Files:**

- Modify: `TASKS.md`

- [ ] **Step 1: Run everything**

```bash
node_modules/.bin/vitest run && node_modules/.bin/tsc --noEmit && node_modules/.bin/next lint --dir src --dir tests
```

Expected: all green. Record the final count.

- [ ] **Step 2: Update the ticket**

In `TASKS.md`, under `### TASK-1807`, add shipped notes for sub-project A recording: the both-paths hub, click-to-place in both directions, that the hard ban can only be tripped by a formation change, that `fillGaps` was extracted so Auto-fill and Chaos share selection rules, Grid Cascade being transform-only, and that B (`/game/play`) and C (Draft Room) remain. Leave the ticket status as `📋 Backlog` — A alone does not close it.

- [ ] **Step 3: Commit and open the PR**

```bash
git add TASKS.md
git commit -m "docs(tasks): TASK-1807 A shipped — the /game/draft hub"
git push -u origin feat/task-1807a-draft-hub
```

Open a PR against `main`. ⚠️ The Playwright E2E job is currently failing on every run, including on docs-only diffs — a separate session is fixing it. Do not treat a nav-spec failure as a regression from this work, but **do** check that no `/game` spec failed, since this PR adds a route.

---

## Self-review notes

**Spec coverage.** Both-paths hub → Tasks 7, 8. Click-to-place bidirectional → Task 4. Eligibility highlight both directions → Tasks 3, 7. Hard ban + formation-change offence → Task 4. Auto-fill preserving placed players → Tasks 1, 7. `chaosDraft` sharing the rules without changing output → Task 2. Broadcast Teamsheet → Tasks 5, 6. Grid Cascade transform-only → Task 6. Formation Morph → Task 5 (inline transform transition). Route `force-static`, no squad in prerendered HTML → Tasks 7, 9. Handoff kept movable for B → Task 8. i18n en+ar → Task 5.

**Known gap, deliberate.** The bench comes from `chaosMatchup`'s auto-drafted home side rather than being chosen, per the spec's open question. If the owner wants manual bench selection it is a second pitch panel in C.

**Type consistency.** `PoolCard` throughout (not `EnrichedCard` — the pool is typed `EnrichedCard[]` at the adapter but `PoolCard` is its supertype and all this code needs). `PlayerSeasonId` for every slot value. `SquadError` defined in Task 4 and consumed unchanged in Tasks 5 and 7. `fillGaps` takes an `rng` function in Tasks 1, 2 and 7 alike.

**One thing to watch in Task 4.** The formation-change test picks slot indices from real `FORMATIONS` data. Verify the chosen index genuinely changes role between the two formations before trusting a green — a test that passes because the roles happen to match is testing nothing, which is the same trap the TASK-1830 harness hit.
