# Budget Cap Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Budget Cap Draft — a cross-era pool of real, inflation-indexed Premier League market values drafted under a €100M cap — at `/game/budget`, taking Phase 18 from 5 of 11 modes live to 6.

**Architecture:** Two new pure `domain/` modules (`market-index.ts` holds the frozen inflation table; `budget.ts` holds spend/reserve/ceiling arithmetic), one new `PoolSpec` kind built in the adapter, one new `DraftPolicy` so the rival spends the same cap, and a bespoke `force-static` route like `/game/chaos`. `domain/draft-room.ts` is **not touched** — the no-dead-end guarantee is derived from the already-dealt hands. Budget state is **derived from `picks`, never stored**.

**Tech Stack:** TypeScript, Next.js 15 App Router (RSC, `force-static`), Vitest + happy-dom, Playwright, next-intl, Tailwind v4.

**Spec:** [`docs/superpowers/specs/2026-08-25-task-1810-budget-cap-design.md`](../specs/2026-08-25-task-1810-budget-cap-design.md) — read §0 before changing any constant; most of them are measurements and four obvious alternatives were measured and rejected.

---

## Running commands

Every Node command must go through WSL. **Write the command into a `.sh` file and run that** rather than passing it inline — the Windows `PATH` bleeds into `wsl.exe -- bash -lc '…'` and contains unquoted parentheses (`Program Files (x86)`), which is a bash syntax error:

```bash
wsl.exe -- bash -lc 'cat > /tmp/run.sh <<"EOF"
#!/bin/bash
set -e
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/usr/local/bin:/usr/bin:/bin"
cd /home/aliemad/projects/pitchiq
node_modules/.bin/vitest run tests/unit/<file>.test.ts --reporter=basic
EOF
chmod +x /tmp/run.sh && /tmp/run.sh'
```

Run binaries from `node_modules/.bin/` directly. The one exception is `pnpm lint`, which must go through pnpm (`CI=true pnpm lint`) because `next lint` cannot resolve `eslint-plugin-react-hooks` from a bare node invocation.

⚠️ **WSL outbound network is down.** The full suite and `next build` cannot complete locally (font fetch, photo timeouts). Run targeted test files locally and let CI be the authority.

---

## File Structure

**Create:**

| File                                       | Responsibility                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `src/features/game/domain/market-index.ts` | The frozen per-season inflation table + `indexFactor` / `indexedCost`. Pure.   |
| `src/features/game/domain/budget.ts`       | `budgetView` (spent/remaining/reserve/ceiling) + `canAfford`. Pure.            |
| `scripts/gen-market-index.mjs`             | Regenerates the frozen table from `data/`. Run by hand and by the freeze test. |
| `src/app/[locale]/game/budget/page.tsx`    | The bespoke `force-static` route.                                              |
| `tests/unit/market-index.test.ts`          | Index flatness + the freeze check.                                             |
| `tests/unit/budget.test.ts`                | Reserve/ceiling arithmetic, including the reads-hands-not-pool fixture.        |
| `tests/unit/budget-pool.test.ts`           | Pool shape, pricing, role coverage, golden membership.                         |
| `tests/unit/budget-rival.test.ts`          | The `"budget"` draft policy.                                                   |
| `tests/e2e/game-budget.spec.ts`            | The route drafts an XI and reaches the match.                                  |

**Modify:**

| File                                            | Change                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| `src/features/game/domain/chaos-draft.ts:15`    | `PoolCard` gains `costEur?: number`.                                       |
| `src/features/game/domain/chaos-draft.ts:145`   | `DraftPolicy` gains `"budget"`; `DraftOptions` gains `budget`; new branch. |
| `src/features/game/domain/rule-packs.ts`        | `PoolSpec` += `pricedMarket`, `Constraint` += `budgetCap`, `BUDGET_PACK`.  |
| `src/features/game/adapter/pool.ts:424`         | `pricedMarket` builder + `buildPool` dispatch.                             |
| `src/features/game/components/DraftRoom.tsx:50` | `budget` prop, the meter, unaffordable cards disabled.                     |
| `src/features/game/components/DraftHub.tsx:150` | Pass `budget` through.                                                     |
| `src/features/game/components/GamePlay.tsx:64`  | `budget` prop, threaded to the draft and both replay paths.                |
| `src/features/game/domain/modes.ts`             | `budget` gets `href` + `formats.single: "live"`.                           |
| `messages/en.json`, `messages/ar.json`          | Budget mode + meter keys.                                                  |
| `scripts/warm-e2e-routes.sh`                    | Add `/game/budget`.                                                        |
| `TASKS.md`, `CLAUDE.md`                         | Ticket status + the durable rules this PR earns.                           |

---

## Task 1: The frozen market index

**Files:**

- Create: `scripts/gen-market-index.mjs`
- Create: `src/features/game/domain/market-index.ts`
- Test: `tests/unit/market-index.test.ts`

- [ ] **Step 1: Write the generator**

`scripts/gen-market-index.mjs`:

```js
// Regenerates the frozen table in src/features/game/domain/market-index.ts.
// The basis is the mean of each season's 50 highest market values — see the spec §2.
import { readFileSync } from "node:fs";

const mv = JSON.parse(readFileSync("data/market-values.json", "utf8"));
const MIN_PRICED = 100; // a season with fewer priced players is not a market (2003 has 6)

const out = {};
for (const [season, byPlayer] of Object.entries(mv)) {
  const values = Object.values(byPlayer)
    .map((e) => e.valueEur)
    .filter((v) => typeof v === "number" && v > 0)
    .sort((a, b) => a - b);
  if (values.length < MIN_PRICED) continue;
  const top = values.slice(-50);
  out[season] = Math.round(top.reduce((a, b) => a + b, 0) / top.length);
}
console.log(JSON.stringify(out, null, 2));
```

- [ ] **Step 2: Run it and capture the table**

Run:

```bash
node scripts/gen-market-index.mjs
```

Expected: a JSON object keyed `"2004"`–`"2025"` (22 entries — **2003 must be absent**, it holds only 6 priced players). Keep the output; it is pasted verbatim in Step 3.

- [ ] **Step 3: Write the failing test**

`tests/unit/market-index.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BASE_SEASON,
  TOP50_MEAN_EUR,
  indexFactor,
  indexedCost,
} from "@/features/game/domain/market-index";

describe("market index", () => {
  it("covers 2004-2025 and nothing else", () => {
    const seasons = Object.keys(TOP50_MEAN_EUR).map(Number).sort();
    expect(seasons[0]).toBe(2004);
    expect(seasons.at(-1)).toBe(2025);
    expect(seasons).toHaveLength(22);
    // ⛔ 2003 exists in market-values.json but holds 6 priced players out of 517.
    expect(TOP50_MEAN_EUR[2003]).toBeUndefined();
  });

  it("is the identity at the base season", () => {
    expect(indexFactor(BASE_SEASON)).toBe(1);
  });

  it("returns null for an unpriced season rather than guessing", () => {
    expect(indexFactor(1995)).toBeNull();
    expect(indexFactor(2003)).toBeNull();
    expect(indexedCost(5_000_000, 1995)).toBeNull();
  });

  it("indexes a 2014 price up toward base-season money", () => {
    // Real card: John Terry 2014, EUR 5M. The 2014 factor measured ~2.57x.
    const cost = indexedCost(5_000_000, 2014);
    expect(cost).not.toBeNull();
    expect(cost!).toBeGreaterThan(10_000_000);
    expect(cost!).toBeLessThan(16_000_000);
  });

  it("is FROZEN — the committed table still matches the generator", () => {
    const fresh = JSON.parse(
      execFileSync("node", ["scripts/gen-market-index.mjs"], { encoding: "utf8" }),
    );
    const committed = Object.fromEntries(Object.entries(TOP50_MEAN_EUR).map(([k, v]) => [k, v]));
    expect(committed).toEqual(fresh);
  });

  it("has no era to farm — every rating band stays flat once indexed", () => {
    // The property the top-50 basis was chosen for. A median basis fails this at 1.8x.
    const mv = JSON.parse(readFileSync("data/market-values.json", "utf8"));
    const meanFor = (from: number, to: number) => {
      const costs: number[] = [];
      for (let s = from; s <= to; s++) {
        for (const e of Object.values(mv[String(s)] ?? {}) as { valueEur: number }[]) {
          const c = indexedCost(e.valueEur, s);
          if (c != null) costs.push(c);
        }
      }
      return costs.reduce((a, b) => a + b, 0) / costs.length;
    };
    const oldest = meanFor(2004, 2009);
    const newest = meanFor(2021, 2025);
    const drift = Math.max(oldest, newest) / Math.min(oldest, newest);
    expect(drift).toBeLessThan(1.6); // raw, unindexed, this is ~6.4x
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `node_modules/.bin/vitest run tests/unit/market-index.test.ts --reporter=basic`
Expected: FAIL — `Failed to resolve import "@/features/game/domain/market-index"`.

- [ ] **Step 5: Write the module**

`src/features/game/domain/market-index.ts` — paste the Step 2 output into `TOP50_MEAN_EUR`:

```ts
/**
 * TASK-1810 — cross-era money, made comparable.
 *
 * Premier League market values inflated ~6.4x between 2004 and 2025, so a euro from 2004
 * and a euro from 2025 are not the same unit. Budget Cap shops across the whole priced
 * window at once, which is only coherent once every price is expressed in one year's money.
 *
 * ⛔ The basis is the mean of each season's FIFTY HIGHEST values, and that is a measurement
 * rather than a preference. The middle of the market inflated faster (~6.5x) than the top
 * (~4.3x), so a median basis charges an 88+ player from 2004 EUR 179M against EUR 101M for
 * one from 2024 — a 1.8x penalty for being old, which is the unindexed bug with its sign
 * flipped. On the top-50 basis every rating band is flat to 1.13-1.37x, and the cheap band
 * drifts UP while the elite band drifts DOWN, so there is no single era to farm.
 *
 * ⛔ FROZEN, not recomputed. `market-index.test.ts` regenerates it from `data/` and asserts
 * this copy still matches, so extending the window is a deliberate, reviewed change. If a
 * new season silently entered the table, `top50Mean(BASE)` would move, every historical
 * price would move with it, and the rating-ranked pool would evict cards people have already
 * drafted — `replayWith` returns null on the first card it cannot find, so their share links
 * would die silently and present as "the link is broken". Same discipline as `DAILY_SHAPES`.
 *
 * ⚠️ Freezing THIS table is what freezes the window: the pool is built from the seasons that
 * have a factor, so a 2026 season arriving in `data/` simply has none and is not drafted.
 */

/** The money year every indexed price is expressed in. */
export const BASE_SEASON = 2025;

/** Mean of the 50 highest market values, per season, in euros. Generated — see the file doc. */
export const TOP50_MEAN_EUR: Readonly<Record<number, number>> = Object.freeze({
  // <<< paste the output of `node scripts/gen-market-index.mjs` here, keys unquoted >>>
});

/**
 * How much a euro from `season` is worth in base-season money, or null if unpriced.
 *
 * ⚠️ Null rather than 1: a season with no market data is not "uninflated", it is absent,
 * and defaulting it to parity would price twelve seasons of players at their face value in
 * 2025 money — making every 1990s card look like a bargain that cannot be bought.
 */
export function indexFactor(season: number): number | null {
  const base = TOP50_MEAN_EUR[BASE_SEASON];
  const own = TOP50_MEAN_EUR[season];
  if (base == null || own == null) return null;
  return base / own;
}

/** A real market value, in base-season money. Null when the season is unpriced. */
export function indexedCost(valueEur: number, season: number): number | null {
  const factor = indexFactor(season);
  if (factor == null) return null;
  return Math.round(valueEur * factor);
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `node_modules/.bin/vitest run tests/unit/market-index.test.ts --reporter=basic`
Expected: PASS, 6 tests.

- [ ] **Step 7: Prove the flatness test is not vacuous**

Temporarily change `TOP50_MEAN_EUR` to a median-derived table (halve each pre-2016 entry) and re-run. Expected: the flatness test FAILS. Revert.

⚠️ This project has shipped two vacuous tests on this ticket already. A test that cannot fail is worse than no test, because it reads as coverage.

- [ ] **Step 8: Commit**

```bash
git add scripts/gen-market-index.mjs src/features/game/domain/market-index.ts tests/unit/market-index.test.ts
git commit -m "TASK-1810: frozen cross-era market index"
```

---

## Task 2: Budget arithmetic

**Files:**

- Create: `src/features/game/domain/budget.ts`
- Test: `tests/unit/budget.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/budget.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { budgetView, canAfford } from "@/features/game/domain/budget";

const card = (cardId: string, costEur: number): PoolCard =>
  ({ cardId, playerId: Number(cardId.split("-")[0]), costEur }) as unknown as PoolCard;

describe("budget", () => {
  it("spends nothing and reserves every other hand at the start", () => {
    const hands = [
      [card("1-a", 50_000_000), card("2-a", 3_000_000)],
      [card("3-a", 40_000_000), card("4-a", 5_000_000)],
      [card("5-a", 20_000_000), card("6-a", 7_000_000)],
    ];
    const v = budgetView(hands, [null, null, null], 100_000_000, 0);
    expect(v.spent).toBe(0);
    // The open slot is NOT reserved against itself; the other two contribute their cheapest.
    expect(v.reserve).toBe(12_000_000);
    expect(v.ceiling).toBe(88_000_000);
  });

  it("counts a pick's real cost and drops its slot from the reserve", () => {
    const hands = [
      [card("1-a", 50_000_000), card("2-a", 3_000_000)],
      [card("3-a", 40_000_000), card("4-a", 5_000_000)],
      [card("5-a", 20_000_000), card("6-a", 7_000_000)],
    ];
    const v = budgetView(hands, ["1-a", null, null], 100_000_000, 1);
    expect(v.spent).toBe(50_000_000);
    expect(v.remaining).toBe(50_000_000);
    expect(v.reserve).toBe(7_000_000); // only slot 2 is unfilled and unopened
    expect(v.ceiling).toBe(43_000_000);
  });

  it("reads the HANDS, not the pool — a cheap card elsewhere never covers an expensive slot", () => {
    // ⛔ The fixture that separates a correct implementation from a pool-wide one. Slot 0's
    // hand is all-expensive; a pool-wide `cheapest card overall` would reserve 1M for it and
    // over-spend by 29M. This test is the reason the reserve is defined over hands.
    const hands = [
      [card("1-a", 30_000_000)], // an expensive-only slot, e.g. the keeper hand
      [card("2-a", 1_000_000), card("3-a", 90_000_000)],
    ];
    const v = budgetView(hands, [null, null], 100_000_000, 1);
    expect(v.reserve).toBe(30_000_000);
    expect(v.ceiling).toBe(70_000_000);
  });

  it("always leaves at least one card in the open hand affordable", () => {
    const hands = [
      [card("1-a", 60_000_000), card("2-a", 4_000_000)],
      [card("3-a", 60_000_000), card("4-a", 6_000_000)],
    ];
    // Spend the maximum on slot 0, then check slot 1 still has something.
    const first = budgetView(hands, [null, null], 70_000_000, 0);
    expect(first.ceiling).toBe(64_000_000);
    const second = budgetView(hands, ["1-a", null], 70_000_000, 1);
    expect(hands[1]!.some((c) => canAfford(c, second))).toBe(true);
  });

  it("treats a missing price as unaffordable rather than free", () => {
    const noPrice = { cardId: "9-a", playerId: 9 } as unknown as PoolCard;
    const v = budgetView([[noPrice]], [null], 100_000_000, 0);
    expect(canAfford(noPrice, v)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/vitest run tests/unit/budget.test.ts --reporter=basic`
Expected: FAIL — `Failed to resolve import "@/features/game/domain/budget"`.

- [ ] **Step 3: Write the module**

`src/features/game/domain/budget.ts`:

```ts
import type { PlayerSeasonId } from "./card-id";
import type { PoolCard } from "./chaos-draft";

/**
 * TASK-1810 — the Budget Cap draft's running arithmetic.
 *
 * ⭐ The reserve is computed over the DEALT HANDS, never over the pool, and that one choice
 * is what makes a dead-end structurally impossible instead of something the UI has to check.
 * `roomDeals` deals all eleven hands up front, in slot order, against one shared used-set,
 * so "the cheapest card in each unfilled hand" is a fixed, DISTINCT, role-correct set from
 * the moment the room exists. Two properties follow inductively:
 *
 *   1. Picking at cost <= ceiling leaves remaining >= the sum of the other hands' minimums,
 *      so the last slot is always affordable.
 *   2. The cheapest card in the OPEN hand is always at or below the ceiling, so no hand is
 *      ever entirely dead.
 *
 * ⛔ A pool-wide reserve (`slotsLeft x cheapestCard`) is the obvious form and it UNDER-reserves:
 * the cheapest card in the pool is no use when the unfilled slot is a goalkeeper and that card
 * is a winger. Reading the hands sidesteps role-awareness entirely, because a hand only ever
 * holds cards `canPlay` accepted for its own slot.
 *
 * ⛔ This is also why there is no `affordable` deal option. An earlier design added one so the
 * room would deal a buyable card per hand — but `roomDeals` deals every hand from one seed
 * BEFORE the draft starts, and affordability depends on what has already been spent, which
 * does not exist yet. Do not re-add it; `domain/draft-room.ts` is untouched by this mode.
 *
 * ⚠️ Nothing here is stored. `RoomState` keeps only `picks`, and the whole view is recomputed
 * on every read — the same rule the daily's streaks follow.
 */
export interface BudgetView {
  /** Total cost of the picks made so far. */
  spent: number;
  /** Budget minus spend. NOT what the coach may spend on this pick — see `ceiling`. */
  remaining: number;
  /** Held back so every OTHER unfilled slot can still be filled. */
  reserve: number;
  /** The most this pick may cost. Can go negative only if the budget is below the floor. */
  ceiling: number;
}

/** A card with no price is not free — it is unbuyable. See the pool builder: none should exist. */
const costOf = (card: PoolCard): number | null => card.costEur ?? null;

const cheapestIn = (hand: readonly PoolCard[]): number => {
  let min = Infinity;
  for (const card of hand) {
    const cost = costOf(card);
    if (cost != null && cost < min) min = cost;
  }
  return min === Infinity ? 0 : min;
};

/**
 * @param hands  One hand per slot, in slot order — exactly `roomDeals`' return value.
 * @param picks  One entry per slot, in slot order — `RoomState.picks`.
 * @param budget The pack's `budgetCap` amount.
 * @param open   The slot being drafted, excluded from the reserve. Null once the room is full.
 */
export function budgetView(
  hands: readonly (readonly PoolCard[])[],
  picks: readonly (PlayerSeasonId | null)[],
  budget: number,
  open: number | null,
): BudgetView {
  // Built across ALL hands so a slot locked before the draft still resolves.
  const byId = new Map<string, PoolCard>();
  for (const hand of hands) for (const card of hand) byId.set(card.cardId, card);

  let spent = 0;
  let reserve = 0;
  for (let i = 0; i < picks.length; i++) {
    const picked = picks[i];
    if (picked != null) {
      spent += costOf(byId.get(picked) ?? ({} as PoolCard)) ?? 0;
      continue;
    }
    if (i === open) continue;
    reserve += cheapestIn(hands[i] ?? []);
  }

  const remaining = budget - spent;
  return { spent, remaining, reserve, ceiling: remaining - reserve };
}

/** Can this card be bought right now? An unpriced card never can. */
export function canAfford(card: PoolCard, view: BudgetView): boolean {
  const cost = costOf(card);
  return cost != null && cost <= view.ceiling;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node_modules/.bin/vitest run tests/unit/budget.test.ts --reporter=basic`
Expected: PASS, 5 tests.

- [ ] **Step 5: Prove the hands-not-pool test is not vacuous**

Temporarily replace `cheapestIn(hands[i] ?? [])` with a pool-wide minimum across all hands. Expected: the "reads the HANDS, not the pool" test FAILS with `reserve` 1_000_000 instead of 30_000_000. Revert.

- [ ] **Step 6: Commit**

```bash
git add src/features/game/domain/budget.ts tests/unit/budget.test.ts
git commit -m "TASK-1810: budget spend/reserve/ceiling arithmetic"
```

---

## Task 3: Card price and pack types

**Files:**

- Modify: `src/features/game/domain/chaos-draft.ts:15`
- Modify: `src/features/game/domain/rule-packs.ts`
- Test: `tests/unit/game-rule-packs.test.ts` (existing — extend)

- [ ] **Step 1: Add the price to the card**

`src/features/game/domain/chaos-draft.ts`, replacing line 15:

```ts
/**
 * ⚠️ `costEur` is present only on a `pricedMarket` pool (TASK-1810 Budget Cap), and it is
 * the INDEXED cost in base-season money, not the historical market value. Optional because
 * every other pool has no concept of price; absent means "not for sale in this mode", which
 * `domain/budget.ts` treats as unaffordable rather than free.
 */
export type PoolCard = GamePlayer & { club: string; teamId?: number; costEur?: number };
```

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/game-rule-packs.test.ts`:

```ts
import { BUDGET_PACK, packFor, routedPacks, RULE_PACKS } from "@/features/game/domain/rule-packs";

describe("budget pack", () => {
  it("is a priced cross-era pool under a cap", () => {
    expect(BUDGET_PACK.pool).toEqual({ kind: "pricedMarket", cap: 600, baseSeason: 2025 });
    expect(BUDGET_PACK.constraints).toEqual([{ kind: "budgetCap", amountEur: 100_000_000 }]);
    expect(BUDGET_PACK.opponent).toBe("budget");
    expect(BUDGET_PACK.screens).toBe("legacy");
  });

  it("guarantees no standout — a forced 80+ fights a budget", () => {
    expect(BUDGET_PACK.draft?.standout).toBeUndefined();
    expect(BUDGET_PACK.draft?.onePerPlayer).toBe(true);
  });

  it("has NO chooser, so the parameterised route must never serve it", () => {
    // ⛔ `/game/budget` is a bespoke route like `/game/chaos`. A chooser here would fan out
    // `[mode]/[club]` and break the Vercel build, exactly as Captain's Draft did.
    expect(BUDGET_PACK.chooser).toBeUndefined();
    expect(routedPacks().map((p) => p.id)).not.toContain("budget");
  });

  it("is registered and resolvable by id", () => {
    expect(RULE_PACKS.map((p) => p.id)).toContain("budget");
    expect(packFor("budget")).toBe(BUDGET_PACK);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node_modules/.bin/vitest run tests/unit/game-rule-packs.test.ts --reporter=basic`
Expected: FAIL — `BUDGET_PACK` is not exported.

- [ ] **Step 4: Add the types (NOT the registration yet)**

In `src/features/game/domain/rule-packs.ts`, add to the `PoolSpec` union:

```ts
  | {
      /**
       * The Budget Cap shape (TASK-1810): every priced player-season in the indexed window,
       * one card per distinct player at his best-rated season, rating-ranked and capped.
       *
       * ⛔ The cap is 600 because 900 was measured and rejected — it leaves the achievable XI
       * IDENTICAL at every budget from EUR 60M up, since the extra 300 cards are all rated
       * 64-70 and never enter an optimal team. They would be dealt, never wanted, and cost
       * ~150 KB on a `force-static` page.
       *
       * ⚠️ Stopping at 600 also puts the pool's floor at rating 70, so every card in the mode
       * is a genuine contributor rather than filler.
       */
      kind: "pricedMarket";
      /** Cards on the page after ranking. ~0.5 KB each, so this is a payload decision. */
      cap: number;
      /** The money year every price is expressed in. Frozen — see `domain/market-index.ts`. */
      baseSeason: number;
    };
```

Extend `Constraint`:

```ts
export type Constraint =
  | {
      /** A player is already in the XI before the coach picks anything (Captain's Draft). */
      kind: "captainFirst";
    }
  | {
      /**
       * Every pick costs, and the XI must come in under `amountEur` (Budget Cap, TASK-1810).
       *
       * ⚠️ Unlike `captainFirst` this constraint DOES carry its value. The captain is a route
       * param, so the pack could only declare the rule; the budget is identical for every
       * player of this mode, so it belongs here.
       *
       * ⚠️ A DRAFT-time rule only. `replayWith` must never re-validate it — re-checking a
       * constraint on resolution is how a legal match becomes unresumable after a data change.
       */
      kind: "budgetCap";
      amountEur: number;
    };
```

- [ ] **Step 5: Type-check**

Run: `node_modules/.bin/tsc --noEmit`
Expected: PASS. ⚠️ Vitest does not type-check; a green suite is not evidence the code compiles.

- [ ] **Step 6: Commit**

```bash
git add src/features/game/domain/chaos-draft.ts src/features/game/domain/rule-packs.ts
git commit -m "TASK-1810: card price + pricedMarket/budgetCap pack types"
```

The `game-rule-packs.test.ts` additions stay red until Task 6 registers the pack — that is deliberate, per the `RULE_PACKS` rule.

---

## Task 4: The pool builder

**Files:**

- Modify: `src/features/game/adapter/pool.ts` (add builder; extend `buildPool` at line 424)
- Test: `tests/unit/budget-pool.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/budget-pool.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPool } from "@/features/game/adapter/pool";
import { FORMATIONS } from "@/features/game/domain/chaos-draft";
import { canPlay } from "@/features/game/domain/eligibility";
import { BASE_SEASON, TOP50_MEAN_EUR } from "@/features/game/domain/market-index";

const SPEC = { kind: "pricedMarket", cap: 600, baseSeason: BASE_SEASON } as const;

describe("priced market pool", () => {
  it("is capped, deduped and rating-ranked", async () => {
    const pool = await buildPool(SPEC);
    expect(pool).toHaveLength(600);
    expect(new Set(pool.map((c) => c.playerId)).size).toBe(600); // one card per player
    const ovr = pool.map((c) => c.ratings?.overall ?? 0);
    expect(ovr[0]).toBeGreaterThanOrEqual(ovr.at(-1)!);
    expect(Math.min(...ovr)).toBeGreaterThanOrEqual(70);
  });

  it("prices EVERY card — a free card would break the whole mode", async () => {
    const pool = await buildPool(SPEC);
    // ⛔ The 644 unpriced player-seasons must be FILTERED, not defaulted to zero.
    expect(pool.every((c) => typeof c.costEur === "number" && c.costEur > 0)).toBe(true);
  });

  it("draws only from the indexed window", async () => {
    const pool = await buildPool(SPEC);
    const priced = new Set(Object.keys(TOP50_MEAN_EUR).map(Number));
    expect(pool.every((c) => priced.has(c.season))).toBe(true);
    expect(Math.min(...pool.map((c) => c.season))).toBeGreaterThanOrEqual(2004);
  });

  it("can fill every slot of every formation", async () => {
    const pool = await buildPool(SPEC);
    // Measured green: the thinnest slot has 50 eligible cards. This pins it.
    // ⚠️ Count `canPlay`, never `role` — primary-role counts say 6 RMs and are wrong by 8x.
    for (const formation of FORMATIONS) {
      for (const slot of formation.slots) {
        const eligible = pool.filter((c) => canPlay(c, slot.role));
        expect(eligible.length, `${formation.name} / ${slot.role}`).toBeGreaterThanOrEqual(11);
      }
    }
  });

  it("is a stable set — membership is pinned so a silent shift cannot kill share links", async () => {
    const pool = await buildPool(SPEC);
    expect(pool.map((c) => c.cardId)).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/vitest run tests/unit/budget-pool.test.ts --reporter=basic`
Expected: FAIL — `buildPool` falls through to `clubHistory` for an unknown kind and returns the wrong shape.

- [ ] **Step 3: Write the builder**

In `src/features/game/adapter/pool.ts`, add two imports first:

```ts
import { loadMarketValues } from "@/data/loaders"; // add to the existing loaders import
import { indexedCost } from "@/features/game/domain/market-index";
```

Then add above `buildPool`:

```ts
/**
 * The Budget Cap pool: every priced player-season in the indexed window, bounded.
 *
 * Three steps, in this order:
 *  1. **Filter to priced** — a season with no index factor, and a player with no value, are
 *     both dropped. There are 644 unpriced rows inside the window; a card with no price
 *     cannot be bought, and defaulting one to zero would hand the coach a free superstar.
 *  2. **One card per distinct player** — his best-rated season, exactly as Captain's Draft
 *     does. Without it the cheapest 85+ XI is literally Vardy 2014, Vardy 2021, Vardy 2020,
 *     and a pool where one underpriced man occupies eleven slots is not a market.
 *  3. **Rating-rank and cap.**
 *
 * ⚠️ A rating-ranked cap was expected to destroy the price spread and measurably does not:
 * the pool's median price is EUR 39M yet its cheapest legal XI is EUR 37M, because rating and
 * price correlate at only r ~ 0.52. No stratified price reserve is needed — do not add one.
 *
 * ⛔ The sort MUST tie-break on `cardId`. Two players on the same rating at the cap boundary
 * would otherwise be ordered by the scan's arrival, so the 600th card could change between
 * runs — evicting a card someone drafted and killing his share link.
 */
async function pricedMarket(
  spec: Extract<PoolSpec, { kind: "pricedMarket" }>,
  career: CareerIndex,
): Promise<EnrichedCard[]> {
  const values = await loadMarketValues();
  if (values == null) return [];

  const best = new Map<number, { g: Gathered; cost: number }>();
  for (const { g } of await universe(career)) {
    const raw = values[String(g.card.season)]?.[String(g.card.playerId)]?.valueEur;
    if (raw == null || raw <= 0) continue;
    const cost = indexedCost(raw, g.card.season);
    if (cost == null || cost <= 0) continue;
    const found = best.get(g.card.playerId);
    if (found == null || g.rating > found.g.rating) best.set(g.card.playerId, { g, cost });
  }

  return [...best.values()]
    .sort((a, b) => b.g.rating - a.g.rating || a.g.card.cardId.localeCompare(b.g.card.cardId))
    .slice(0, spec.cap)
    .map((v) => ({ ...v.g.card, costEur: v.cost }));
}
```

Extend the `buildPool` dispatch:

```ts
const pool =
  spec.kind === "topTeams"
    ? await topTeams(spec, career)
    : spec.kind === "captainSynergy"
      ? // `only` is the ICON's playerId here, the same way it is a club id for Legacy.
        await captainSynergy(spec, career, only ?? -1)
      : spec.kind === "pricedMarket"
        ? await pricedMarket(spec, career)
        : await clubHistory(spec, career, only);
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node_modules/.bin/vitest run tests/unit/budget-pool.test.ts --reporter=basic -u`
Expected: PASS, 5 tests, snapshot written. Inspect the snapshot: 600 ids, no duplicates.

- [ ] **Step 5: Prove the pricing test is not vacuous**

Temporarily change `if (raw == null || raw <= 0) continue;` to `const raw = … ?? 0;` with no guard. Expected: the "prices EVERY card" test FAILS. Revert.

- [ ] **Step 6: Commit**

```bash
git add src/features/game/adapter/pool.ts tests/unit/budget-pool.test.ts tests/unit/__snapshots__/budget-pool.test.ts.snap
git commit -m "TASK-1810: pricedMarket pool builder"
```

---

## Task 5: The budget-matched rival

**Files:**

- Modify: `src/features/game/domain/chaos-draft.ts` (`DraftPolicy` at line 145, `DraftOptions`, `chaosDraft`)
- Test: `tests/unit/budget-rival.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/budget-rival.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chaosDraft, type PoolCard } from "@/features/game/domain/chaos-draft";
import { buildPool } from "@/features/game/adapter/pool";
import { BASE_SEASON } from "@/features/game/domain/market-index";

const CAP = 100_000_000;
const SPEC = { kind: "pricedMarket", cap: 600, baseSeason: BASE_SEASON } as const;
const cost = (xi: PoolCard[]) => xi.reduce((a, c) => a + (c.costEur ?? 0), 0);

describe("budget rival", () => {
  it("fields an XI inside the cap", async () => {
    const pool = (await buildPool(SPEC)) as unknown as PoolCard[];
    for (const seed of [1, 2, 3, 7, 99, 12345]) {
      const team = chaosDraft(pool, seed, "Rival", { policy: "budget", budget: CAP });
      expect(team.players).toHaveLength(11);
      expect(cost(team.players as PoolCard[]), `seed ${seed}`).toBeLessThanOrEqual(CAP);
    }
  });

  it("is not the same XI every time — a fixed best XI is the same match forever", async () => {
    const pool = (await buildPool(SPEC)) as unknown as PoolCard[];
    const a = chaosDraft(pool, 1, "Rival", { policy: "budget", budget: CAP });
    const b = chaosDraft(pool, 2, "Rival", { policy: "budget", budget: CAP });
    expect(a.players.map((p) => p.cardId)).not.toEqual(b.players.map((p) => p.cardId));
  });

  it("replays byte-for-byte from the same seed", async () => {
    const pool = (await buildPool(SPEC)) as unknown as PoolCard[];
    const a = chaosDraft(pool, 42, "Rival", { policy: "budget", budget: CAP });
    const b = chaosDraft(pool, 42, "Rival", { policy: "budget", budget: CAP });
    expect(a.players.map((p) => p.cardId)).toEqual(b.players.map((p) => p.cardId));
  });

  it("is competitive — it spends most of the cap rather than bargain-hunting into a weak XI", async () => {
    const pool = (await buildPool(SPEC)) as unknown as PoolCard[];
    const team = chaosDraft(pool, 5, "Rival", { policy: "budget", budget: CAP });
    const mean = team.players.reduce((a, p) => a + (p.ratings?.overall ?? 0), 0) / 11;
    // The coach's optimum at EUR 100M measures 80.8. A rival far below that re-creates the
    // 2026-08-19 balance defect from the other side.
    expect(mean).toBeGreaterThan(74);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/vitest run tests/unit/budget-rival.test.ts --reporter=basic`
Expected: FAIL — `"budget"` is not assignable to `DraftPolicy`.

- [ ] **Step 3: Extend the policy**

In `src/features/game/domain/chaos-draft.ts`:

```ts
/**
 * ⚠️ `budget` (TASK-1810) drafts under a spending cap. It exists because `best` cannot be
 * used here: the unlimited ceiling XI measures mean rating 94.0 against the coach's 80.8 at
 * EUR 100M, a 13-point gap settled by the draft rules before a ball is kicked — precisely the
 * balance defect the owner reported on 2026-08-19.
 */
export type DraftPolicy = "random" | "best" | "strong" | "budget";
```

Add to `DraftOptions`:

```ts
  /**
   * The spending cap for `policy: "budget"`, in indexed euros. Ignored by every other policy.
   */
  budget?: number;
```

Add the helpers beside `strongFor`:

```ts
/**
 * The cheapest unused card `canPlay` accepts for `role`, or 0 if there is none.
 *
 * ⚠️ Takes a MUTABLE used-set so the caller can accumulate a DISTINCT reserve: the same cheap
 * defender must not be counted as cover for three different slots. Over-reserving only makes
 * the rival slightly frugal; under-reserving leaves it unable to fill its last slots.
 */
function cheapestEligible(pool: PoolCard[], role: PlayerRole, used: Set<number>): PoolCard | null {
  let best: PoolCard | null = null;
  for (const card of pool) {
    if (used.has(card.playerId) || !canPlay(card, role)) continue;
    const cost = card.costEur ?? Infinity;
    if (best == null || cost < (best.costEur ?? Infinity)) best = card;
  }
  return best;
}

/** What must be held back to fill every slot AFTER `from`, using distinct cards. */
function reserveAfter(
  pool: PoolCard[],
  slots: readonly FormationSlot[],
  from: number,
  used: ReadonlySet<number>,
): number {
  const claimed = new Set<number>(used);
  let total = 0;
  for (let i = from + 1; i < slots.length; i++) {
    const card = cheapestEligible(pool, slots[i]!.role, claimed);
    if (card == null) continue;
    claimed.add(card.playerId);
    total += card.costEur ?? 0;
  }
  return total;
}

/**
 * A seeded draw from the affordable standouts, or the best affordable card there is.
 *
 * ⛔ The rng is drawn EXACTLY ONCE per slot whether or not anything is affordable — the same
 * discipline `strongFor` documents. A branch that skipped the draw when the band was empty
 * would make the stream depend on how many slots happened to find one, and the bench shares
 * that stream.
 */
function budgetPick(
  pool: PoolCard[],
  role: PlayerRole,
  used: ReadonlySet<number>,
  rng: () => number,
  ceiling: number,
): PoolCard | null {
  const from = candidatesFor(pool, role, used);
  const roll = rng();
  const affordable = from.filter((c) => (c.costEur ?? Infinity) <= ceiling);
  if (affordable.length === 0) return null;
  const band = affordable.filter((c) => (c.ratings?.overall ?? 0) >= STANDOUT_OVR);
  const choices = band.length > 0 ? band : affordable;
  // Sorted before the draw: `pool` order is an input we do not control.
  const sorted = [...choices].sort((a, b) => a.cardId.localeCompare(b.cardId));
  return sorted[Math.floor(roll * sorted.length)] ?? null;
}
```

Add the branch in `chaosDraft`, alongside `strong` and `best`:

```ts
  } else if (policy === "budget") {
    let spent = 0;
    for (let i = 0; i < shape.slots.length; i++) {
      const ceiling = (budget ?? Infinity) - spent - reserveAfter(pool, shape.slots, i, used);
      const card = budgetPick(pool, shape.slots[i]!.role, used, rng, ceiling);
      if (card == null) continue;
      used.add(card.playerId);
      spent += card.costEur ?? 0;
      chosen.push(card);
    }
  } else if (policy === "best") {
```

Destructure `budget` from `options` alongside `policy` and `exclude`.

- [ ] **Step 4: Run it to verify it passes**

Run: `node_modules/.bin/vitest run tests/unit/budget-rival.test.ts --reporter=basic`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify the shipped policies are untouched**

Run: `node_modules/.bin/vitest run tests/unit/game-chaos-draft.test.ts tests/unit/game-draft-policy.test.ts --reporter=basic`
Expected: PASS. ⚠️ If any chaos determinism test moves, the rng discipline was broken — the new branch must draw exactly once per slot and must not touch the stream for other policies.

- [ ] **Step 6: Commit**

```bash
git add src/features/game/domain/chaos-draft.ts tests/unit/budget-rival.test.ts
git commit -m "TASK-1810: budget-matched rival draft policy"
```

---

## Task 6: The pack and its route

⛔ Registration and the route land in **one commit**, because `RULE_PACKS` is what routes a pack.

**Files:**

- Modify: `src/features/game/domain/rule-packs.ts`
- Create: `src/app/[locale]/game/budget/page.tsx`
- Modify: `messages/en.json`, `messages/ar.json`
- Modify: `scripts/warm-e2e-routes.sh`

- [ ] **Step 1: Register the pack**

In `src/features/game/domain/rule-packs.ts`:

```ts
/**
 * Budget Cap Draft.
 *
 * The promise is "EUR 100M, the whole priced archive, find the bargains" — and the rules keep
 * it: every card is a real market value expressed in 2025 money, and the coach's XI must come
 * in under the cap.
 *
 * ⚠️ NO CHOOSER. The pool is one cross-era set, so there is nothing to choose and nothing to
 * put in a route segment — which is why this pack is served by a bespoke `/game/budget` page,
 * exactly as Chaos is, and why `routedPacks()` must never return it.
 *
 * ⚠️ No `standout`: a guaranteed 80+ per hand fights a budget instead of complementing it.
 * What a budget hand needs is a card the coach can still buy, and that falls out of the
 * reserve rule in `domain/budget.ts` without any change to `roomDeals`.
 */
export const BUDGET_PACK: RulePack = {
  id: "budget",
  pool: { kind: "pricedMarket", cap: 600, baseSeason: 2025 },
  screens: "legacy",
  opponent: "budget",
  draft: { handSize: 5, roam: "free", timer: null, lockPicks: true, onePerPlayer: true },
  constraints: [{ kind: "budgetCap", amountEur: 100_000_000 }],
  objective: "win",
};

export const RULE_PACKS: readonly RulePack[] = [
  CHAOS_PACK,
  LEGACY_PACK,
  CAPTAINS_PACK,
  BUDGET_PACK,
];
```

- [ ] **Step 2: Add the i18n keys**

`messages/en.json`, under `game`:

```json
"budgetTitle": "Budget Cap Draft",
"budgetSubtitle": "€100M. Every era on sale. Find the bargains.",
"budgetSpent": "Spent",
"budgetRemaining": "Remaining",
"budgetCeiling": "Max this pick",
"budgetShortfall": "€{amount} over",
"budgetWindow": "Prices cover 2004–2025, in today's money"
```

`messages/ar.json`, same keys, Arabic values. ⚠️ Numbers rendered from these keys must go through `localizeDigits` — `Intl.NumberFormat("ar")` returns Western digits in the browser.

- [ ] **Step 3: Write the route**

`src/app/[locale]/game/budget/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPool, captaincyCounts, refereeNames } from "@/features/game/adapter/pool";
import { GamePlay } from "@/features/game/components/GamePlay";
import { BUDGET_PACK } from "@/features/game/domain/rule-packs";

export const dynamic = "force-static";
export const revalidate = false; // see CLAUDE.md — deploys are the only data change

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("budgetTitle"), description: t("budgetSubtitle") };
}

const budgetOf = (): number => {
  const cap = BUDGET_PACK.constraints.find((c) => c.kind === "budgetCap");
  return cap?.kind === "budgetCap" ? cap.amountEur : 0;
};

export default async function BudgetDraftPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const pool = await buildPool(BUDGET_PACK.pool);
  const captaincies = await captaincyCounts(pool.map((c) => c.playerId));
  const referees = await refereeNames();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      {/* ⚠️ Every input is a PROP off the pack, never a mode check — "modes are rule packs
          (data), not code paths". `GamePlay` must not learn that a mode called budget exists. */}
      <GamePlay
        pool={pool}
        initialPhase="setup"
        draft={BUDGET_PACK.draft}
        screens={BUDGET_PACK.screens}
        opponent={BUDGET_PACK.opponent}
        budget={budgetOf()}
        captaincies={captaincies}
        referees={referees}
      />
    </main>
  );
}
```

- [ ] **Step 4: Warm the route for E2E**

Add `/game/budget` to the route list in `scripts/warm-e2e-routes.sh`. ⚠️ Without it the first test to reach the route pays its dev-server compile inside a 12s `expect` timeout.

- [ ] **Step 5: Run the pack and route guards**

Run: `node_modules/.bin/vitest run tests/unit/game-rule-packs.test.ts tests/unit/game-routes-static.test.ts tests/unit/route-revalidate.test.ts tests/unit/game-modes.test.ts --reporter=basic`
Expected: PASS. The Task 3 assertions go green here.

- [ ] **Step 6: Commit**

```bash
git add src/features/game/domain/rule-packs.ts "src/app/[locale]/game/budget/page.tsx" messages/en.json messages/ar.json scripts/warm-e2e-routes.sh
git commit -m "TASK-1810: register the Budget Cap pack and its route"
```

---

## Task 7: The price on the card, the meter, and disabled cards

**Files:**

- Modify: `src/features/game/components/PlayerCard.tsx`
- Modify: `src/features/game/components/DraftRoom.tsx:50`
- Modify: `src/features/game/components/DraftHub.tsx:150`
- Test: `tests/unit/budget-room.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/budget-room.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DraftRoom } from "@/features/game/components/DraftRoom";
import { PlayerCard } from "@/features/game/components/PlayerCard";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { FORMATIONS } from "@/features/game/domain/chaos-draft";
import { poolFixture } from "./_helpers/game-pool";
import { renderWithIntl } from "./_helpers/intl";

const formation = FORMATIONS[0]!;

/**
 * The shipped fixture, priced. Five cards per role get a wide spread, so at a tight ceiling
 * a hand holds BOTH sides of it — which is what makes the two assertions below meaningful.
 */
const SPREAD = [1_000_000, 4_000_000, 12_000_000, 40_000_000, 90_000_000];
const priced = (): PoolCard[] =>
  poolFixture().map((card, i) => ({ ...card, costEur: SPREAD[i % SPREAD.length]! }));

describe("draft room budget", () => {
  it("shows no meter when the pack declares no budget", () => {
    renderWithIntl(
      <DraftRoom pool={priced()} formation={formation} seed={1} onComplete={() => {}} />,
    );
    expect(screen.queryByTestId("budget-meter")).toBeNull();
  });

  it("shows the meter when it does", () => {
    renderWithIntl(
      <DraftRoom
        pool={priced()}
        formation={formation}
        seed={1}
        onComplete={() => {}}
        budget={100_000_000}
      />,
    );
    expect(screen.getByTestId("budget-meter")).toBeVisible();
  });

  it("disables what the coach cannot afford but never the whole hand", () => {
    // A ceiling that sits inside the spread: 1M and 4M clear it, 40M and 90M do not.
    renderWithIntl(
      <DraftRoom
        pool={priced()}
        formation={formation}
        seed={1}
        onComplete={() => {}}
        budget={20_000_000}
      />,
    );
    const cards = screen.getAllByTestId("room-candidate");
    // ⛔ Dealt but DISABLED, not filtered — seeing what you are priced out of IS the mode.
    expect(cards.some((c) => c.hasAttribute("disabled"))).toBe(true);
    // ⭐ The reserve rule's second property: the open hand always has something clickable.
    expect(cards.some((c) => !c.hasAttribute("disabled"))).toBe(true);
  });

  it("prints the indexed cost on the card face, and nothing else about money", () => {
    // Owner, 2026-08-25: the INDEXED cost only. The card already carries its season, so a
    // 2014 card still reads as one — what is hidden is the historical euro figure.
    const card = { ...poolFixture()[0]!, costEur: 22_000_000 };
    renderWithIntl(<PlayerCard card={card} />);
    expect(screen.getByTestId("card-cost")).toHaveTextContent("22");
  });

  it("prints no cost at all for a card with no price", () => {
    renderWithIntl(<PlayerCard card={poolFixture()[0]!} />);
    expect(screen.queryByTestId("card-cost")).toBeNull();
  });
});
```

⚠️ `PlayerCard`'s real prop names may differ — read the component and match them rather than assuming; the two card tests are the only place this plan touches it.

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/vitest run tests/unit/budget-room.test.tsx --reporter=basic`
Expected: FAIL — `budget` is not a prop of `DraftRoom`.

- [ ] **Step 3: Put the price on the card**

In `PlayerCard.tsx`, render the cost when the card carries one:

```tsx
{
  card.costEur != null && (
    <span data-testid="card-cost" className="pc-cost">
      €{localizeDigits(compactMillions(card.costEur), locale)}M
    </span>
  );
}
```

⚠️ The figure must go through `localizeDigits` (`src/utils/format.ts`) — `Intl.NumberFormat("ar")` returns **Western** digits in the browser, measured, not assumed.

⛔ Only the indexed cost is shown. Do not add the historical value beside it: the owner chose one number for card clarity, and the card's season already carries the provenance.

- [ ] **Step 4: Wire the room**

In `DraftRoom.tsx`, add `budget` to `Props` and the destructure, then after `hands`:

```tsx
// ⚠️ DERIVED on every render, never stored — `RoomState` holds only `picks`.
const view = useMemo(
  () => (budget == null ? null : budgetView(hands, state.picks, budget, state.open)),
  [budget, hands, state.picks, state.open],
);
```

Render the meter above the board when `view != null` (`data-testid="budget-meter"`), showing spent / remaining / max-this-pick through `localizeDigits`. On each candidate card, set `disabled={view != null && !canAfford(card, view)}` and show the shortfall.

⛔ Do not put the disabled styling on an `::after` overlay — a decoration that sits on top swallows the click, which is the exact defect fixed on the Legacy draft pitch (#172).

- [ ] **Step 5: Pass it through `DraftHub`**

Add `budget?: number` to `DraftHub`'s props and forward it to `<DraftRoom budget={budget} …>` at line 150.

- [ ] **Step 6: Run it to verify it passes**

Run: `node_modules/.bin/vitest run tests/unit/budget-room.test.tsx --reporter=basic`
Expected: PASS, 2 tests.

- [ ] **Step 7: Prove the disabled test is not vacuous**

Temporarily remove the `disabled` binding. Expected: the test FAILS. Revert. ⚠️ Also confirm the "never a dead hand" assertion is real by checking the fixture actually contains an affordable card at that ceiling — an assertion that passes because every card is affordable proves nothing.

- [ ] **Step 8: Commit**

```bash
git add src/features/game/components/DraftRoom.tsx src/features/game/components/DraftHub.tsx tests/unit/budget-room.test.tsx
git commit -m "TASK-1810: budget meter and unaffordable-card gating"
```

---

## Task 8: Wire `GamePlay`

**Files:**

- Modify: `src/features/game/components/GamePlay.tsx:64`
- Test: `tests/unit/game-budget-session.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/unit/game-budget-session.test.tsx`. The point of this task is that the budget reaches
**three** places — the draft, and both replay paths — so the test asserts a round trip rather
than a prop.

```tsx
import { describe, expect, it } from "vitest";
import { buildSession } from "@/features/game/view/match-session";
import { buildPool } from "@/features/game/adapter/pool";
import { BASE_SEASON } from "@/features/game/domain/market-index";
import type { PoolCard } from "@/features/game/domain/chaos-draft";

const SPEC = { kind: "pricedMarket", cap: 600, baseSeason: BASE_SEASON } as const;
const CAP = 100_000_000;
const away = (s: { match: { away: { players: { cardId: string }[] } } }) =>
  s.match.away.players.map((p) => p.cardId);

describe("budget session", () => {
  it("rebuilds the SAME rival from the same seed when the budget travels with it", async () => {
    // ⛔ Resume and share both re-run `buildSession` and verify by fingerprint. A replay
    // built without the policy AND its cap drafts a different rival, which the app then
    // reports as a corrupt save — the failure mode #159 hit from the other direction.
    const pool = (await buildPool(SPEC)) as unknown as PoolCard[];
    const xi = pool.slice(0, 11);
    const opts = { opponent: "budget" as const, budget: CAP };
    const live = buildSession(pool, xi, 4242, opts);
    const replay = buildSession(pool, xi, 4242, opts);
    expect(away(replay)).toEqual(away(live));
  });

  it("drafts a DIFFERENT rival if the cap is dropped — which is why it must be threaded", async () => {
    // ⭐ The control. If this passed, the budget would be decorative and the test above
    // would prove nothing.
    const pool = (await buildPool(SPEC)) as unknown as PoolCard[];
    const xi = pool.slice(0, 11);
    const withCap = buildSession(pool, xi, 4242, { opponent: "budget", budget: CAP });
    const without = buildSession(pool, xi, 4242, { opponent: "budget" });
    expect(away(without)).not.toEqual(away(withCap));
  });
});
```

⚠️ `buildSession`'s real signature may differ — read `view/match-session.ts` and match it. The
assertion that matters is _"the same inputs rebuild the same away XI, and dropping the cap
changes it"_, however the call is spelled.

- [ ] **Step 2: Run it to verify it fails**

Run: `node_modules/.bin/vitest run tests/unit/game-budget-session.test.tsx --reporter=basic`
Expected: FAIL — `budget` is not a prop.

- [ ] **Step 3: Add the prop**

In `GamePlay.tsx`, add to the destructure and the type:

```ts
  /**
   * The pack's spending cap, in indexed euros (TASK-1810). Absent = no budget at all.
   *
   * ⛔ Passed to the draft AND to both replay paths, for the same reason `opponent` is: resume
   * and share re-run `buildSession` and verify by fingerprint, so a replay that forgot it
   * drafts a different rival and reads as a corrupt save.
   *
   * ⚠️ A DRAFT-time rule. Nothing on the replay path may REJECT a saved XI for exceeding it —
   * re-validating a constraint on resolution is how a legal match becomes unresumable after a
   * data change.
   */
  budget?: number;
```

Thread it to the draft render and into every `buildSession` / `replayMatch` / `replayShared` call site alongside `opponent`.

- [ ] **Step 4: Run it to verify it passes**

Run: `node_modules/.bin/vitest run tests/unit/game-budget-session.test.tsx tests/unit/game-match-reproducible.test.tsx --reporter=basic`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/components/GamePlay.tsx tests/unit/game-budget-session.test.tsx
git commit -m "TASK-1810: thread the budget through the session and both replay paths"
```

---

## Task 9: Go live

**Files:**

- Modify: `src/features/game/domain/modes.ts`

- [ ] **Step 1: Flip the registry**

```ts
  {
    id: "budget",
    group: "draftPacks",
    emoji: "💰",
    nameKey: "modeBudgetName",
    descriptionKey: "modeBudgetDesc",
    href: "/game/budget",
    // TASK-1810 ships the single-match format. Season is TASK-1811.
    formats: { single: "live", season: "planned" },
    accent: "#34d399",
    ticket: "TASK-1810",
  },
```

- [ ] **Step 2: Re-run EVERYTHING that asserts on mode status**

Run:

```bash
node_modules/.bin/vitest run tests/unit/game-modes.test.ts tests/unit/game-mode-tile.test.tsx tests/unit/game-hub.test.tsx tests/unit/game-routes-static.test.ts --reporter=basic
```

Expected: PASS.

⚠️ **Run these AFTER the flip, not before.** Two tests hardcoded Captain's Draft as their "locked mode" example and both failed the day it shipped, for a reason unrelated to the rule they guard. If any test names a specific locked mode, fix it to derive one: `GAME_MODES.find(m => !isPlayable(m))`.

- [ ] **Step 3: Confirm the gate count**

The gate must now read **6 of 11 unlocked**. Check any test asserting the count and update it.

- [ ] **Step 4: Commit**

```bash
git add src/features/game/domain/modes.ts
git commit -m "TASK-1810: Budget Cap Draft is live — 6 of 11 modes"
```

---

## Task 10: End-to-end

**Files:**

- Create: `tests/e2e/game-budget.spec.ts`

- [ ] **Step 1: Write the spec**

⚠️ Import `test`/`expect` from `tests/e2e/_helpers/test.ts`, never from `@playwright/test` — that wrapper waits for the App Router to mount, and without it a pre-hydration click is silently swallowed and presents as a `toHaveURL` timeout no timeout value can fix.

```ts
import { expect, test } from "./_helpers/test";

test("drafts an XI under the cap and reaches the match", async ({ page }) => {
  await page.goto("/game/budget");
  await expect(page.getByTestId("budget-meter")).toBeVisible();
  // Pick the cheapest affordable card in each of the eleven hands, then play.
  for (let slot = 0; slot < 11; slot++) {
    const enabled = page
      .getByRole("button", { name: /card:/ })
      .and(page.locator(":not([disabled])"));
    await enabled.first().click();
  }
  await expect(page.getByRole("button", { name: /play/i })).toBeEnabled();
});

test("the gate links to the mode", async ({ page }) => {
  await page.goto("/game");
  await expect(page.getByRole("link", { name: /budget cap/i })).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `node_modules/.bin/playwright test tests/e2e/game-budget.spec.ts`
Expected: PASS. ⚠️ If the browser cannot reach `resources.premierleague.com` the suite is not offline and photo loads may stall — that is the known environment issue, not a defect.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/game-budget.spec.ts
git commit -m "TASK-1810: Budget Cap E2E"
```

---

## Task 11: Docs — as part of shipping, not after

**Files:**

- Modify: `TASKS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the ticket**

In `TASKS.md` under TASK-1810, change the progress line to **"PR 4 of 5: Legacy Club, Captain's Draft AND Budget Cap are LIVE. The gate reads 6 of 11 unlocked."** and add a Budget Cap block carrying the measured numbers: the 2004–2025 window and why 2003 does not count, the 6.4× inflation, the top-50 index and the rejected median basis, cap 600 and why 900 was dropped, the €100M curve, and the reserve-over-hands rule.

⛔ The ticket stays `📋 Backlog` until PR 5 — one of five modes ships here, the same discipline TASK-1812 used.

- [ ] **Step 2: Add the durable rules to `CLAUDE.md`**

Under the `features/game/` section, add:

- ⛔ **A cross-era price must be INDEXED, and the basis is the top 50, not the median.**
- ⛔ **A budget draft's reserve is computed over the DEALT HANDS, never the pool** — and that is why there is no `affordable` deal option.
- ⛔ **A pool whose cards carry a price must filter the unpriced, never default them to zero.**
- ⚠️ **Count `canPlay`, not `role`, when auditing pool coverage** — primary-role counts said 6 RMs and were wrong by 8×.
- ⛔ **A frozen factor table freezes the WINDOW** — a new season with no factor is simply not drafted, which is what keeps existing share links alive.

- [ ] **Step 3: Commit**

```bash
git add TASKS.md CLAUDE.md
git commit -m "TASK-1810: document Budget Cap"
```

---

## Task 12: Ship

- [ ] **Step 1: Full local check**

Run: `node_modules/.bin/tsc --noEmit` then `CI=true pnpm lint`
Expected: both clean. ⚠️ Vitest does not type-check — a green suite is not evidence the code compiles.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/task-1810-budget-cap
```

Open the PR against `main` via the REST helper (no `gh` in WSL — token from `~/.git-credentials`).

- [ ] **Step 3: Watch every check**

⛔ **Read commit STATUSES as well as check-runs.** Vercel reports its deployment as a commit status, so a poller that reads only check-runs will call a branch green while its build has failed.

- [ ] **Step 4: Squash-merge on green**

Only when every check AND every status is green.

---

## Notes for the implementer

- **Measure before you change a constant.** Every number in the spec's §0 came from a real measurement over the committed data, and four plausible alternatives were measured and rejected. If you think one is wrong, re-measure it — do not reason about it.
- **Prove each new test can fail.** Two tests on this ticket were vacuous: one asserted a property the bug also satisfied, the other guarded on a button that never appeared. Steps 5–7 of several tasks above exist for this reason; do not skip them.
- **A green suite is not evidence that nothing changed.** Tests asserting relationships (same seed reproduces itself) stay green through a total change in output. Verify user-visible change by measurement.
