import { describe, expect, it } from "vitest";
import { buildPool } from "@/features/game/adapter/pool";
import { FORMATIONS } from "@/features/game/domain/chaos-draft";
import { canPlay } from "@/features/game/domain/eligibility";
import { BASE_SEASON, TOP50_MEAN_EUR } from "@/features/game/domain/market-index";
import type { PoolSpec } from "@/features/game/domain/rule-packs";

const SPEC: PoolSpec = { kind: "pricedMarket", cap: 600, baseSeason: BASE_SEASON };

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
    expect(pool.every((c) => typeof c.costEur === "number" && c.costEur > 0)).toBe(true);
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

  it("is a STABLE set — membership is pinned so a silent shift cannot kill share links", async () => {
    // ⛔ `replayWith` resolves a saved XI against the pool and returns null on the first card
    // it cannot find. If a data correction or a `rate()` change quietly evicted a card at the
    // cap boundary, every share link holding it would die and present as "the link is broken".
    // This snapshot makes that shift fail loudly, at the moment it happens.
    const pool = await buildPool(SPEC);
    expect(pool.map((c) => c.cardId)).toMatchSnapshot();
  }, 300_000);
});
