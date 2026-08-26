import { describe, expect, it } from "vitest";
import { buildPool } from "@/features/game/adapter/pool";
import { FORMATIONS } from "@/features/game/domain/chaos-draft";
import { roomDeals } from "@/features/game/domain/draft-room";
import { canPlay } from "@/features/game/domain/eligibility";
import { formationByName } from "@/features/game/domain/formation";
import { BASE_SEASON, TOP50_MEAN_EUR } from "@/features/game/domain/market-index";
import { BUDGET_PACK, type PoolSpec } from "@/features/game/domain/rule-packs";

const SPEC: PoolSpec = { kind: "pricedMarket", cap: 600, baseSeason: BASE_SEASON };
/**
 * ⚠️ Resolved by NAME, never by index. `FORMATIONS`' order is presentation only, and a guard
 * test in `game-formation.test.ts` fails on index access — inserting a shape would otherwise
 * silently repoint every assumption made here.
 */
const SHAPES = ["4-4-2 Flat", "4-4-2 Diamond", "3-4-2-1"].map(formationByName);

/** The pack's own cap — never a second literal that could drift from it. */
const CAP = (() => {
  const c = BUDGET_PACK.constraints.find((x) => x.kind === "budgetCap");
  return c?.kind === "budgetCap" ? c.amount : 0;
})();

// Real committed data, real prices. ⛔ No synthetic pool: the recurring failure in this
// codebase is a fixture that cannot occur.
describe("priced market pool", () => {
  it("is capped, deduped and rating-ranked", async () => {
    const pool = await buildPool(SPEC);
    expect(pool).toHaveLength(600);
    // One card per DISTINCT player. Without this the cheapest 85+ XI is literally
    // Vardy 2014, Vardy 2021, Vardy 2020 — a pool where one underpriced man occupies
    // eleven slots is not a market.
    expect(new Set(pool.map((c) => c.playerId)).size).toBe(600);
    const ovr = pool.map((c) => c.ratings?.overall ?? 0);
    expect(ovr[0]).toBeGreaterThanOrEqual(ovr.at(-1)!);
    expect(Math.min(...ovr)).toBeGreaterThanOrEqual(70);
  }, 300_000);

  it("prices EVERY card — a free card would break the whole mode", async () => {
    const pool = await buildPool(SPEC);
    // ⛔ The 644 unpriced player-seasons inside the window must be FILTERED, never defaulted
    // to zero. A zero is easy to introduce silently and hands the coach a free superstar.
    expect(pool.every((c) => typeof c.price === "number" && c.price > 0)).toBe(true);
  }, 300_000);

  it("draws only from the indexed window", async () => {
    const pool = await buildPool(SPEC);
    const priced = new Set(Object.keys(TOP50_MEAN_EUR).map(Number));
    expect(pool.every((c) => priced.has(c.season))).toBe(true);
    // 1992-2003 has no market data at all, so it is out of this mode entirely.
    expect(Math.min(...pool.map((c) => c.season))).toBeGreaterThanOrEqual(2004);
  }, 300_000);

  it("can fill every slot of every formation", async () => {
    const pool = await buildPool(SPEC);
    // ⚠️ Count `canPlay`, NEVER `role`. Primary-role counts say the pool holds 6 RMs and 8
    // LMs and are wrong by 6-8x — `altRoles` lifts every slot to at least 50 eligible cards.
    // Reading the primary counts alone would say this mode cannot field a 4-4-2.
    for (const formation of FORMATIONS) {
      for (const slot of formation.slots) {
        const eligible = pool.filter((c) => canPlay(c, slot.role));
        expect(eligible.length, `${formation.name} / ${slot.role}`).toBeGreaterThanOrEqual(11);
      }
    }
  }, 300_000);

  it("⛔ a DEALT room is completable, and `cheapest` buys real headroom", async () => {
    /**
     * ⚠️ What binds the draft is the sum of the HANDS' minimums, not the pool's — the reserve
     * in `domain/budget.ts` reads the dealt hands. On the original euro scale that made
     * `DealOptions.cheapest` a FEASIBILITY fix: five random cards per slot put the floor at
     * €137M–265M against a €100M cap, so every card in every hand was disabled and the mode
     * could not be played at all. A browser found it; every unit fixture had missed it,
     * because a hand-crafted pool has a cheap card in every hand by construction.
     *
     * ⭐ Compressing prices into the FPL band changed WHY the option earns its place. Measured
     * across all 20 shapes × 12 seeds, the worst naive floor is now **£65.0m** against a
     * £100.0m cap — feasible everywhere. So `cheapest` is no longer load-bearing for
     * COMPLETION; it is load-bearing for HEADROOM. It drops the floor to £44.3m, about £21m
     * more to spend up with, and guarantees every hand holds an economising option instead of
     * leaving some slots with no cheap card at all.
     */
    const pool = await buildPool(SPEC);
    const floorOf = (hands: { price?: number }[][]) =>
      hands.reduce((sum, h) => sum + Math.min(...h.map((c) => c.price ?? Infinity)), 0);
    const deal = (shape: (typeof FORMATIONS)[number], seed: number, cheapest: boolean) =>
      roomDeals(pool, shape, seed, { handSize: 5, cheapest, onePerPlayer: true });

    let worstNaive = 0;
    for (const shape of SHAPES) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const guaranteed = floorOf(deal(shape, seed, true));
        const naive = floorOf(deal(shape, seed, false));
        const where = `${shape.name} seed ${seed}`;
        // Completable — the property a player feels, and it must hold either way.
        expect(guaranteed, where).toBeLessThanOrEqual(CAP);
        expect(naive, where).toBeLessThanOrEqual(CAP);
        // ⛔ THE CONTROL, restated to what is now true: the guarantee must measurably LOWER
        // the floor. If it ever stops doing that, the option has become pointless.
        expect(guaranteed, where).toBeLessThan(naive);
        worstNaive = Math.max(worstNaive, naive);
      }
    }

    // Pins the headroom the option actually buys, so a future curve change that erodes it
    // surfaces here rather than as a mode that quietly stopped having decisions in it.
    expect(worstNaive).toBeGreaterThan(CAP * 0.4);
  }, 300_000);

  it("is a STABLE set — membership is pinned so a silent shift cannot kill share links", async () => {
    // ⛔ `replayWith` resolves a saved XI against the pool and returns null on the first card
    // it cannot find. If a data correction or a `rate()` change quietly evicted a card at the
    // cap boundary, every share link holding it would die and present as "the link is broken".
    // This snapshot makes that shift fail loudly, at the moment it happens.
    const pool = await buildPool(SPEC);
    expect(pool.map((c) => c.cardId)).toMatchSnapshot();
  }, 300_000);
});
