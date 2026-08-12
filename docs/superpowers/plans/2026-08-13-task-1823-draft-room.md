# The Draft Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A slot-based entry into the draft hub — eleven slots, five eligible candidates each, a pick timer on slots you have not filled yet, any slot clickable at any time.

**Architecture:** The eleven hands are **precomputed in slot order** against one shared used-set, so no player can appear twice and the order you visit slots cannot change what any slot offers. A pure reducer owns picks and which slot is open; the countdown lives in the component and never reaches the domain. On completion the room hands card ids up to `DraftHub`, which already has a `setSlots` action.

**Tech Stack:** TypeScript, React 19, Next 15 (App Router, `force-static`), next-intl, Vitest + happy-dom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-12-task-1823-draft-room-design.md`

---

## Before you start

**Toolchain.** Pin a Linux-only PATH first or the husky hook dies with `exec: node: not found`:

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
```

Run binaries directly (`node_modules/.bin/vitest run`), never `pnpm <script>` — except lint, which needs pnpm's linker and `CI=true` to avoid the no-TTY modules purge:

```bash
source $HOME/.nvm/nvm.sh && nvm use 22 && CI=true pnpm lint
```

Run the unit suite on the **default** vitest pool. Branch off `main` at or after `c3393c8` (TASK-1831), since the room deals against the twenty-shape set.

---

## File Structure

**Create:**

| File                                         | Responsibility                                                        |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `src/features/game/domain/draft-room.ts`     | `roomDeals` — eleven hands of five, precomputed, deterministic. Pure. |
| `src/features/game/view/room-state.ts`       | The reducer: picks, which slot is open, completion. No clock.         |
| `src/features/game/components/DraftRoom.tsx` | Tactics Blueprint layout, Flip Reveal motion, the countdown.          |
| `tests/unit/game-draft-room.test.ts`         |                                                                       |
| `tests/unit/game-room-state.test.ts`         |                                                                       |
| `tests/unit/game-draft-room-view.test.tsx`   |                                                                       |

**Modify:**

| File                                        | Change                                                |
| ------------------------------------------- | ----------------------------------------------------- |
| `src/features/game/components/DraftHub.tsx` | Entry choice; receive the finished XI via `setSlots`. |
| `src/app/globals.css`                       | `room-flip-in` / `room-fold-out` keyframes.           |
| `src/i18n/messages/{en,ar}.json`            | Room copy.                                            |
| `tests/unit/game-draft-hub.test.tsx`        | The entry choice.                                     |
| `TASKS.md`                                  | Flip 1823 and close TASK-1807.                        |

---

### Task 1: `roomDeals` — the precomputed hands

**Files:**

- Create: `src/features/game/domain/draft-room.ts`
- Test: `tests/unit/game-draft-room.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/game-draft-room.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { HAND_SIZE, roomDeals } from "@/features/game/domain/draft-room";
import { canPlay } from "@/features/game/domain/eligibility";
import { formationByName } from "@/features/game/domain/formation";

const ROLES: PlayerRole[] = [
  "GK",
  "RB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "SS",
  "CF",
];

const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 12 }, (_, i) => ({
    cardId: makeCardId(r * 100 + i, 2020),
    playerId: r * 100 + i,
    season: 2020,
    name: `${role}-${i}`,
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
      overall: 50 + i,
    },
    club: "Club",
  })),
);

const shape = formationByName("4-4-2 Flat");

describe("roomDeals", () => {
  it("deals one hand per slot", () => {
    const hands = roomDeals(pool, shape, 42);
    expect(hands).toHaveLength(11);
    for (const h of hands) expect(h).toHaveLength(HAND_SIZE);
  });

  it("is deterministic from the seed", () => {
    const key = (hs: PoolCard[][]) => hs.map((h) => h.map((c) => c.cardId).join(",")).join("|");
    expect(key(roomDeals(pool, shape, 42))).toBe(key(roomDeals(pool, shape, 42)));
  });

  it("different seeds deal differently", () => {
    const key = (hs: PoolCard[][]) => hs.map((h) => h.map((c) => c.cardId).join(",")).join("|");
    expect(key(roomDeals(pool, shape, 1))).not.toBe(key(roomDeals(pool, shape, 2)));
  });

  it("⚠️ every candidate is eligible for its slot — the hard ban, by construction", () => {
    const hands = roomDeals(pool, shape, 42);
    hands.forEach((hand, i) => {
      for (const c of hand) expect(canPlay(c, shape.slots[i].role), `${c.name} @ ${i}`).toBe(true);
    });
  });

  it("⚠️ no player appears in two hands, so a duplicate pick is impossible", () => {
    const ids = roomDeals(pool, shape, 42)
      .flat()
      .map((c) => c.cardId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("⚠️ a starved pool yields a SHORT hand, never an ineligible candidate", () => {
    // The real pool cannot reach this branch (TASK-1831 measured every slot of every
    // shape), so without a deliberately thin pool it would never be exercised — and
    // padding a short hand is the one way an illegal candidate could reach the coach,
    // because this path has no validation behind it.
    const thin = pool
      .filter((c) => c.role !== "CF")
      .concat(pool.filter((c) => c.role === "CF").slice(0, 1));
    const hands = roomDeals(thin, shape, 42);
    const forwards = shape.slots
      .map((s, i) => (s.role === "CF" ? hands[i] : null))
      .filter((h): h is PoolCard[] => h != null);
    expect(forwards.some((h) => h.length < HAND_SIZE)).toBe(true);
    forwards.forEach((h, i) => {
      for (const c of h) expect(canPlay(c, "CF"), `${c.name} in forward hand ${i}`).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node_modules/.bin/vitest run tests/unit/game-draft-room.test.ts
```

Expected: FAIL — `Failed to resolve import ".../draft-room"`.

- [ ] **Step 3: Write the implementation**

Create `src/features/game/domain/draft-room.ts`:

```ts
import type { PoolCard } from "./chaos-draft";
import { canPlay } from "./eligibility";
import type { Formation } from "./formation";
import { mulberry32 } from "./rng";

/** Candidates offered per slot. */
export const HAND_SIZE = 5;

/**
 * Eleven hands of five, one per formation slot.
 *
 * ⚠️ PRECOMPUTED, IN SLOT ORDER, against one shared used-set. Two properties fall out,
 * and both are load-bearing:
 *
 * 1. No player can appear in two hands, so a duplicate pick is impossible by construction.
 * 2. The ORDER THE COACH VISITS SLOTS cannot change what any slot offers. Dealt lazily as
 *    slots were opened, a hand would depend on which slots had already been visited — and
 *    a room would stop replaying from `(seed)` alone, breaking the shareable-room
 *    requirement inherited from TASK-1812.
 *
 * ⚠️ A hand is SHORT rather than padded when a role cannot supply five eligible cards.
 * Padding with ineligible cards is the one way an illegal candidate could be offered,
 * and this path has no validation behind it — the hard ban here is by construction.
 */
export function roomDeals(
  pool: readonly PoolCard[],
  formation: Formation,
  seed: number,
): PoolCard[][] {
  const rng = mulberry32(seed);
  const used = new Set<string>();

  return formation.slots.map((slot) => {
    const bag = pool.filter((c) => !used.has(c.cardId) && canPlay(c, slot.role));
    const hand: PoolCard[] = [];
    while (hand.length < HAND_SIZE && bag.length > 0) {
      const [card] = bag.splice(Math.floor(rng() * bag.length), 1);
      hand.push(card);
      used.add(card.cardId);
    }
    return hand;
  });
}
```

⚠️ **The `rng` is drawn per pick, in slot order.** Do not "optimise" by shuffling each bag independently or by drawing all indices up front — either changes the draw sequence, and every room ever shared by seed would deal differently.

- [ ] **Step 4: Run it to verify it passes**

```bash
node_modules/.bin/vitest run tests/unit/game-draft-room.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: ⚠️ Prove the visit-order property, and prove the test can fail**

Add to the same file:

```ts
it("⚠️ visiting order cannot change any hand", () => {
  // THE property that lets free roam and seed-sharing coexist. Hands are a function of
  // (pool, formation, seed) only — there is no visit order to pass in, and that is the
  // point. Asserted by rebuilding from scratch and comparing.
  const a = roomDeals(pool, shape, 42);
  const b = roomDeals(pool, shape, 42);
  expect(a.map((h) => h.map((c) => c.cardId))).toEqual(b.map((h) => h.map((c) => c.cardId)));
});
```

Then verify the gate is real: temporarily change `roomDeals` to accept a slot order and deal in that order, confirm hands differ between orders, and restore. Record what you saw in the commit message.

- [ ] **Step 6: Commit**

```bash
git add src/features/game/domain/draft-room.ts tests/unit/game-draft-room.test.ts
git commit -m "feat(game): precomputed room hands, deterministic and duplicate-free"
```

---

### Task 2: The room reducer

**Files:**

- Create: `src/features/game/view/room-state.ts`
- Test: `tests/unit/game-room-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/game-room-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formationByName } from "@/features/game/domain/formation";
import { createRoomState, isRoomComplete, roomReducer } from "@/features/game/view/room-state";

const shape = formationByName("4-4-2 Flat");
const start = () => createRoomState(shape);

describe("roomReducer", () => {
  it("opens on the first unfilled slot", () => {
    expect(start().open).toBe(0);
  });

  it("records a pick and advances to the next unfilled slot", () => {
    const s = roomReducer(start(), { type: "pick", index: 0, cardId: "1@2020" });
    expect(s.picks[0]).toBe("1@2020");
    expect(s.open).toBe(1);
  });

  it("⚠️ any slot can be opened at any time", () => {
    const s = roomReducer(start(), { type: "open", index: 7 });
    expect(s.open).toBe(7);
  });

  it("⚠️ re-picking a filled slot replaces rather than appends", () => {
    let s = roomReducer(start(), { type: "pick", index: 3, cardId: "1@2020" });
    s = roomReducer(s, { type: "pick", index: 3, cardId: "2@2020" });
    expect(s.picks[3]).toBe("2@2020");
    expect(s.picks.filter(Boolean)).toHaveLength(1);
  });

  it("advancing from the last unfilled slot closes the room", () => {
    let s = start();
    shape.slots.forEach((_, i) => {
      s = roomReducer(s, { type: "pick", index: i, cardId: `${i}@2020` });
    });
    expect(isRoomComplete(s)).toBe(true);
    expect(s.open).toBeNull();
  });

  it("⚠️ a pick into an out-of-range slot is ignored, not applied", () => {
    const s = start();
    expect(roomReducer(s, { type: "pick", index: 99, cardId: "1@2020" })).toBe(s);
  });

  it("changing formation restarts the room", () => {
    let s = roomReducer(start(), { type: "pick", index: 0, cardId: "1@2020" });
    s = roomReducer(s, { type: "setFormation", formation: formationByName("3-5-2") });
    expect(s.picks.filter(Boolean)).toHaveLength(0);
    expect(s.formation.name).toBe("3-5-2");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node_modules/.bin/vitest run tests/unit/game-room-state.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/features/game/view/room-state.ts`:

```ts
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { Formation } from "@/features/game/domain/formation";

export interface RoomState {
  formation: Formation;
  /** One entry per slot, in slot order. */
  picks: (PlayerSeasonId | null)[];
  /** The slot currently being drafted, or null once every slot is filled. */
  open: number | null;
}

export type RoomAction =
  | { type: "open"; index: number }
  | { type: "pick"; index: number; cardId: PlayerSeasonId }
  | { type: "setFormation"; formation: Formation };

export function createRoomState(formation: Formation): RoomState {
  return { formation, picks: formation.slots.map(() => null), open: 0 };
}

export const isRoomComplete = (s: RoomState): boolean => s.picks.every((p) => p != null);

/** The next slot with no pick, searching forward from `from` then wrapping. */
function nextUnfilled(picks: (PlayerSeasonId | null)[], from: number): number | null {
  for (let i = 1; i <= picks.length; i++) {
    const at = (from + i) % picks.length;
    if (picks[at] == null) return at;
  }
  return null;
}

/**
 * ⚠️ There is NO CLOCK in here. The countdown is view state: a timeout PICKS a card, and
 * that pick is the input. `Date.now()` inside anything the room derives from would break
 * the determinism rule locked for Phase 18 — the same rule that governs the match
 * engine's decision prompts.
 *
 * Out-of-range actions are ignored rather than applied, so the UI cannot drive the room
 * into a state it has no rendering for.
 */
export function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case "open":
      if (action.index < 0 || action.index >= state.picks.length) return state;
      return { ...state, open: action.index };
    case "pick": {
      if (action.index < 0 || action.index >= state.picks.length) return state;
      const picks = [...state.picks];
      picks[action.index] = action.cardId;
      return { ...state, picks, open: nextUnfilled(picks, action.index) };
    }
    case "setFormation":
      // A different shape means different slots and different hands; keeping picks would
      // strand players in roles they were never drafted for.
      return createRoomState(action.formation);
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
node_modules/.bin/vitest run tests/unit/game-room-state.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/view/room-state.ts tests/unit/game-room-state.test.ts
git commit -m "feat(game): the draft-room reducer — free roam, no clock"
```

---

### Task 3: The Flip Reveal keyframes

**Files:**

- Modify: `src/app/globals.css`
- Test: `tests/unit/motion-audit.test.ts` (existing — must stay green)

- [ ] **Step 1: Add the keyframes**

Append to `src/app/globals.css`, beside the other game keyframes:

```css
/* TASK-1823 Draft Room — "Flip Reveal" (animation 07 of 30).
   Candidates arrive face-down and turn over on Y; rejected cards fold away on X, so
   accepting and discarding read as opposites in one physical language.
   ⚠️ transform + opacity only — the motion audit rejects `filter`, and animating `width`
   fails outright. */
@keyframes room-flip-in {
  from {
    opacity: 0;
    transform: rotateY(90deg);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes room-fold-out {
  from {
    opacity: 1;
    transform: none;
  }
  to {
    opacity: 0;
    transform: rotateX(90deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .room-card {
    animation: none !important;
  }
}
```

- [ ] **Step 2: Run the motion audit**

```bash
node_modules/.bin/vitest run tests/unit/motion-audit.test.ts
```

Expected: PASS. The audit enforces the keyframe-property allowlist and the reduce gates; if it fails, the property list above is wrong — fix the CSS, never the audit.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(game): Flip Reveal keyframes for the draft room"
```

---

### Task 4: The room component

**Files:**

- Create: `src/features/game/components/DraftRoom.tsx`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/ar.json`
- Test: `tests/unit/game-draft-room-view.test.tsx`

- [ ] **Step 1: Add the copy**

In `src/i18n/messages/en.json`, inside `"game"`:

```json
    "roomTitle": "Draft Room",
    "roomOpen": "Open the Draft Room",
    "roomBuild": "Build it yourself",
    "roomSlot": "Slot {n} of {total}",
    "roomTimeLeft": "{s}s",
    "roomNoTimer": "No time limit",
    "roomDone": "Squad complete",
    "roomToHub": "Edit in the builder",
    "roomEditing": "Editing a filled slot — no timer",
```

In `src/i18n/messages/ar.json`, same position:

```json
    "roomTitle": "غرفة الاختيار",
    "roomOpen": "افتح غرفة الاختيار",
    "roomBuild": "ابنِ التشكيلة بنفسك",
    "roomSlot": "المركز {n} من {total}",
    "roomTimeLeft": "{s} ث",
    "roomNoTimer": "بلا حد زمني",
    "roomDone": "اكتملت التشكيلة",
    "roomToHub": "التعديل في الباني",
    "roomEditing": "تعديل مركز مكتمل — بلا مؤقت",
```

- [ ] **Step 2: Verify catalog parity**

```bash
node_modules/.bin/vitest run tests/unit/i18n-catalog-parity.test.ts
```

Expected: PASS.

- [ ] **Step 3: Write the failing test**

Create `tests/unit/game-draft-room-view.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { DraftRoom } = await import("@/features/game/components/DraftRoom");

const ROLES: PlayerRole[] = [
  "GK",
  "RB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "SS",
  "CF",
];
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 12 }, (_, i) => ({
    cardId: makeCardId(r * 100 + i, 2020),
    playerId: r * 100 + i,
    season: 2020,
    name: `${role}-${i}`,
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
      overall: 50 + i,
    },
    club: "Club",
  })),
);

const shape = formationByName("4-4-2 Flat");
const render = (onComplete = vi.fn()) =>
  renderWithIntl(<DraftRoom pool={pool} formation={shape} seed={42} onComplete={onComplete} />);

describe("DraftRoom", () => {
  it("offers five candidates for the open slot", () => {
    render();
    expect(screen.getAllByRole("button", { name: /rated/ })).toHaveLength(5);
  });

  it("shows all eleven slots on the board", () => {
    render();
    expect(screen.getAllByRole("button", { name: /slot/i })).toHaveLength(11);
  });

  it("⚠️ any slot can be opened by clicking it", async () => {
    const user = userEvent.setup();
    render();
    const slots = screen.getAllByRole("button", { name: /slot/i });
    await user.click(slots[6]);
    expect(slots[6]).toHaveAttribute("aria-current", "true");
  });

  it("picking fills the slot and moves on", async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getAllByRole("button", { name: /rated/ })[0]);
    const slots = screen.getAllByRole("button", { name: /slot/i });
    expect(slots[1]).toHaveAttribute("aria-current", "true");
  });

  it("⚠️ re-opening a filled slot offers the identical five", async () => {
    const user = userEvent.setup();
    render();
    const first = screen.getAllByRole("button", { name: /rated/ }).map((b) => b.textContent);
    await user.click(screen.getAllByRole("button", { name: /rated/ })[0]);
    await user.click(screen.getAllByRole("button", { name: /slot/i })[0]);
    const again = screen.getAllByRole("button", { name: /rated/ }).map((b) => b.textContent);
    expect(again).toEqual(first);
  });

  it("hands the finished XI up in slot order", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(onComplete);
    for (let i = 0; i < 11; i++) {
      await user.click(screen.getAllByRole("button", { name: /rated/ })[0]);
    }
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toHaveLength(11);
  });
});
```

⚠️ The `/rated/` matcher assumes each candidate button's accessible name contains the word
"rated", as `PlayerCard` does elsewhere in this codebase. Build the room's candidate button
label the same way (`${name}, ${role}, rated ${overall}`) so the matcher holds.

- [ ] **Step 4: Run it to verify it fails**

```bash
node_modules/.bin/vitest run tests/unit/game-draft-room-view.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 5: Write the component**

No timer yet — that is Task 5, so this step stays about layout, picking and handoff.

Create `src/features/game/components/DraftRoom.tsx`:

```tsx
"use client";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useReducer, useRef } from "react";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { roomDeals } from "@/features/game/domain/draft-room";
import type { Formation } from "@/features/game/domain/formation";
import { createRoomState, isRoomComplete, roomReducer } from "@/features/game/view/room-state";
import { prefersReducedMotion } from "@/utils/motion";

interface Props {
  pool: PoolCard[];
  formation: Formation;
  seed: number;
  onComplete: (cardIds: PlayerSeasonId[]) => void;
}

/**
 * The Draft Room — concept 09 "Tactics Blueprint", animation 07 "Flip Reveal".
 *
 * A chalk pitch carries slot identity AND overall progress, so with free roam it doubles
 * as the navigation surface: every slot is clickable at any time, and re-opening a filled
 * one offers the identical five with the current pick marked.
 *
 * ⚠️ The hands are computed ONCE from `(pool, formation, seed)`. They do not depend on
 * which slots have been visited — that is what lets free roam and seed-sharing coexist.
 */
export function DraftRoom({ pool, formation, seed, onComplete }: Props) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();
  const hands = useMemo(() => roomDeals(pool, formation, seed), [pool, formation, seed]);
  const [state, dispatch] = useReducer(roomReducer, formation, createRoomState);
  const byId = useMemo(() => new Map(pool.map((c) => [c.cardId, c])), [pool]);

  // ⚠️ Guarded with a ref: `isRoomComplete` stays true for every subsequent render, and
  // handing the XI up twice would set the builder's slots twice.
  const handedOff = useRef(false);
  useEffect(() => {
    if (handedOff.current || !isRoomComplete(state)) return;
    handedOff.current = true;
    onComplete(state.picks as PlayerSeasonId[]);
  }, [state, onComplete]);

  const rows = Math.max(...formation.slots.map((s) => s.row));
  const open = state.open;
  const hand = open == null ? [] : hands[open];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h2 className="text-xl font-extrabold tracking-tight">{t("roomTitle")}</h2>

      <div className="mt-4 grid gap-5 md:grid-cols-[minmax(200px,300px)_1fr]">
        <div
          role="group"
          aria-label={t("roomTitle")}
          className="border-border relative aspect-[3/4] rounded-md border bg-[#0e1a22]"
        >
          {formation.slots.map((s, i) => {
            const inRow = formation.slots.filter((x) => x.row === s.row).length;
            const picked = state.picks[i];
            const card = picked != null ? byId.get(picked) : undefined;
            return (
              <button
                key={`${s.row}-${s.col}`}
                type="button"
                aria-current={open === i ? "true" : undefined}
                aria-label={t("roomSlot", { n: i + 1, total: formation.slots.length })}
                onClick={() => dispatch({ type: "open", index: i })}
                style={{
                  left: `${(s.col / (inRow + 1)) * 100}%`,
                  top: `${100 - (s.row / (rows + 1)) * 100}%`,
                }}
                className={`absolute grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-mono text-[9px] font-bold ${
                  card ? "bg-amber-400 text-black" : "bg-slate-700 text-slate-300"
                } ${open === i ? "ring-2 ring-cyan-400" : ""}`}
              >
                {card ? card.ratings?.overall : s.role}
              </button>
            );
          })}
        </div>

        <div>
          {open == null ? (
            <p className="text-sm font-bold">{t("roomDone")}</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {hand.map((c) => (
                <button
                  key={c.cardId}
                  type="button"
                  aria-label={`${c.name}, ${c.role}, rated ${c.ratings?.overall ?? 0}`}
                  onClick={() => dispatch({ type: "pick", index: open, cardId: c.cardId })}
                  className={`room-card border-border w-[104px] rounded-md border p-2 text-start ${
                    reduced ? "" : "[animation:room-flip-in_.42s_both]"
                  } ${state.picks[open] === c.cardId ? "ring-2 ring-cyan-400" : ""}`}
                >
                  <span className="block font-mono text-lg font-black">
                    {c.ratings?.overall ?? 0}
                  </span>
                  <span className="block font-mono text-[10px] opacity-70">{c.role}</span>
                  <span className="mt-1 block text-[11px] font-bold">{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

⚠️ **Never import from `@/features/game/adapter/*`** — those are `server-only`; a client
component uses `domain/` and `view/` only.

⚠️ **`&apos;` fails the no-hardcoded-strings AST guard** (it contains the letters "apos")
and a bare `'` fails ESLint `react/no-unescaped-entities` — write `{"'"}`. Every visible
word above already comes through `t()`; the role code and the rating are expressions, which
the guard allows.

- [ ] **Step 6: Run it to verify it passes**

```bash
node_modules/.bin/vitest run tests/unit/game-draft-room-view.test.tsx
```

Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add src/features/game/components/DraftRoom.tsx src/i18n/messages/en.json src/i18n/messages/ar.json tests/unit/game-draft-room-view.test.tsx
git commit -m "feat(game): the Draft Room — Tactics Blueprint, Flip Reveal"
```

---

### Task 5: The timer's two rules

**Files:**

- Modify: `src/features/game/components/DraftRoom.tsx`
- Test: `tests/unit/game-draft-room-view.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/game-draft-room-view.test.tsx`:

```tsx
it("⚠️ a lapsed timer picks the highest-rated candidate", async () => {
  vi.useFakeTimers();
  try {
    renderWithIntl(
      <DraftRoom pool={pool} formation={shape} seed={42} limit={1} onComplete={vi.fn()} />,
    );
    const before = screen.getAllByRole("button", { name: /rated/ });
    const best = before
      .map((b) => Number(/rated (\d+)/.exec(b.getAttribute("aria-label") ?? "")?.[1] ?? 0))
      .reduce((a, b) => Math.max(a, b), 0);
    await vi.advanceTimersByTimeAsync(1500);
    // The keeper slot is now filled, and with the best card available to it.
    const slot0 = screen.getAllByRole("button", { name: /slot/i })[0];
    expect(slot0.textContent).toContain(String(best));
  } finally {
    vi.useRealTimers();
  }
});

it("⚠️ editing a filled slot runs no timer", async () => {
  const user = userEvent.setup();
  renderWithIntl(
    <DraftRoom pool={pool} formation={shape} seed={42} limit={30} onComplete={vi.fn()} />,
  );
  await user.click(screen.getAllByRole("button", { name: /rated/ })[0]);
  await user.click(screen.getAllByRole("button", { name: /slot/i })[0]);
  // Reviewing your own squad must not be punished by a countdown.
  expect(screen.getByText("Editing a filled slot — no timer")).toBeInTheDocument();
});
```

⚠️ `userEvent` and fake timers conflict; the first test therefore uses no `userEvent`.
If a later test needs both, pass `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`.

- [ ] **Step 2: Run them to verify they fail**

```bash
node_modules/.bin/vitest run tests/unit/game-draft-room-view.test.tsx
```

Expected: FAIL — `limit` is not a prop yet.

- [ ] **Step 3: Implement**

Add to `DraftRoom`'s props:

```tsx
  /** Seconds before the room picks for you, or null to disable. Mirrors DecisionPrompt. */
  limit?: number | null;
```

destructure it as `limit = 15`, and add this above the `return`:

```tsx
const editing = open != null && state.picks[open] != null;
const [left, setLeft] = useState<number | null>(limit);

/**
 * ⚠️ The clock runs on UNFILLED slots only.
 *
 * Reviewing your own squad must not be punished by a countdown — a timer firing while
 * the coach compares two players he already owns reads as a bug. And ⚠️ the clock never
 * reaches the domain: a timeout PICKS a card, and that pick is the input, so a lapsed
 * timer is indistinguishable from a deliberate choice on replay.
 *
 * Extendable and disableable (`limit: null`) per WCAG 2.2.1, exactly like DecisionPrompt.
 */
useEffect(() => {
  if (open == null || editing || limit == null) {
    setLeft(null);
    return;
  }
  setLeft(limit);
  const id = window.setInterval(() => setLeft((v) => (v == null ? null : v - 1)), 1000);
  return () => window.clearInterval(id);
}, [open, editing, limit]);

useEffect(() => {
  if (left == null || left > 0 || open == null) return;
  const best = hands[open].reduce((a, b) =>
    (b.ratings?.overall ?? 0) > (a.ratings?.overall ?? 0) ? b : a,
  );
  dispatch({ type: "pick", index: open, cardId: best.cardId });
}, [left, open, hands]);
```

and render the countdown beside the hand:

```tsx
<p className="mb-2 font-mono text-xs font-bold">
  {editing ? t("roomEditing") : left == null ? t("roomNoTimer") : t("roomTimeLeft", { s: left })}
</p>
```

Add `useState` to the React import.

⚠️ **The timeout dispatch lives in its own effect**, keyed on `left`. Firing it from inside
the interval callback would close over a stale `open` after the coach clicks another slot
mid-countdown.

- [ ] **Step 4: Run them to verify they pass**

```bash
node_modules/.bin/vitest run tests/unit/game-draft-room-view.test.tsx
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/components/DraftRoom.tsx tests/unit/game-draft-room-view.test.tsx
git commit -m "feat(game): the room clock — new slots only, timeout takes the best card"
```

---

### Task 6: The hub entry

**Files:**

- Modify: `src/features/game/components/DraftHub.tsx`
- Test: `tests/unit/game-draft-hub.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/game-draft-hub.test.tsx`:

```tsx
it("opens the Draft Room and takes its XI back into the builder", async () => {
  const user = userEvent.setup();
  renderWithIntl(<DraftHub pool={pool} onConfirm={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Open the Draft Room" }));
  expect(screen.getByText("Draft Room")).toBeInTheDocument();

  for (let i = 0; i < 11; i++) {
    await user.click(screen.getAllByRole("button", { name: /rated/ })[0]);
  }
  // The room hands off; the builder takes over with every slot still editable.
  expect(screen.getByRole("button", { name: "Play match" })).toBeEnabled();
});
```

⚠️ The hub's existing fixture pool has 4 cards per role. `roomDeals` needs 5 per slot, so
**widen that fixture to 6 per role** or the keeper hand is short and the loop above stalls.

- [ ] **Step 2: Run it to verify it fails**

```bash
node_modules/.bin/vitest run tests/unit/game-draft-hub.test.tsx
```

Expected: FAIL — no such button.

- [ ] **Step 3: Implement**

In `DraftHub`, add `const [mode, setMode] = useState<"build" | "room">("build")` and a
button labelled `t("roomOpen")`. When `mode === "room"`, render:

```tsx
<DraftRoom
  pool={pool}
  formation={state.formation}
  seed={state.seed}
  onComplete={(cardIds) => {
    dispatch({ type: "setSlots", slots: cardIds });
    setMode("build");
  }}
/>
```

⚠️ **`setSlots` is the existing seam** — the reducer already takes
`(PlayerSeasonId | null)[]`, so the room needs no new action and the XI arrives fully
editable. Do not add a bespoke handoff.

- [ ] **Step 4: Run it to verify it passes**

```bash
node_modules/.bin/vitest run tests/unit/game-draft-hub.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/components/DraftHub.tsx tests/unit/game-draft-hub.test.tsx
git commit -m "feat(game): open the Draft Room from the hub, and take its XI back"
```

---

### Task 7: Full verification

- [ ] **Step 1: Type-check**

```bash
node_modules/.bin/tsc --noEmit
```

Expected: no output. ⚠️ Vitest does not type-check — this is the only thing that catches a
dangling import.

- [ ] **Step 2: Lint**

```bash
source $HOME/.nvm/nvm.sh && nvm use 22 && CI=true pnpm lint
```

Expected: no errors. The no-hardcoded-strings AST guard scans `.tsx`, so every visible word
in `DraftRoom.tsx` must come through `t()`.

- [ ] **Step 3: Full suite**

```bash
node_modules/.bin/vitest run
```

Expected: PASS. Baseline after TASK-1831 is 1,878.

⚠️ The chaos determinism tests and the match harness must be **unmoved** — this ticket adds
no engine surface and does not touch `chaosDraft`. If one moves, something leaked.

- [ ] **Step 4: Build**

```bash
export NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000
node_modules/.bin/next build > /tmp/room-build.log 2>&1; echo "EXIT:$?"
grep -E "/(en|ar)/game" /tmp/room-build.log
```

Expected: all four `/game/*` routes `●` in both locales. Do not pipe to `tail` — the
pipeline exits with tail's status and masks a failed build.

- [ ] **Step 5: Commit any fixes**

```bash
git add -u
git commit -m "fix(game): verification fallout"
```

Skip if nothing changed. ⚠️ Stage explicit paths, never `git add -A`.

---

### Task 8: Documentation

**Files:**

- Modify: `TASKS.md`

- [ ] **Step 1: Flip 1823**

Set the TASK-1823 table row and heading to `✅ Done`, and append a shipped note recording:
the precomputed-hands decision and why visiting order cannot change a hand; that the hard
ban is by construction here with a short hand rather than a padded one; that the timer is
view-only and editing is untimed; and that the room hands off through the existing
`setSlots` seam.

- [ ] **Step 2: Close TASK-1807**

C was the last sub-project. Set the 1807 sub-project table's **C** row to `✅ Done`, change
the row in the Phase-18 table to `✅ Done`, and update the heading from
`📋 Backlog — **A, B1 and B2 are done; C remains**` to `✅ Done (2026-08-13)`.

- [ ] **Step 3: Commit**

```bash
git add TASKS.md
git commit -m "docs(tasks): TASK-1823 shipped — and TASK-1807 is closed"
```

---

## Done when

- Hands are precomputed, duplicate-free, every candidate eligible, short rather than padded.
- Visiting order provably cannot change a hand.
- Any slot is clickable; re-opening a filled slot offers the identical five, untimed.
- A lapsed clock picks the highest-rated candidate and records it as an ordinary pick.
- The finished XI arrives in the builder via `setSlots`, fully editable.
- `tsc`, lint and the full suite are clean; chaos determinism and the match harness unmoved.
- `next build` marks all four `/game/*` routes `●` in both locales.

Then follow [[pitchiq-git-workflow]]: branch → push → PR → watch the three CI gates →
squash-merge on green. Never push to `main`.
