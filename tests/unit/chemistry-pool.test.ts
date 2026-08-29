import { describe, expect, it } from "vitest";
import { buildPool } from "@/features/game/adapter/pool";
import { FORMATIONS } from "@/features/game/domain/chaos-draft";
import { canPlay } from "@/features/game/domain/eligibility";
import { CHEMISTRY_PACK, type PoolSpec } from "@/features/game/domain/rule-packs";

/**
 * TASK-1810 PR 5 — the Chemistry Draft's pool. Spec §2.
 *
 * ⭐ WIDE by measurement, not by preference: a cross-era pool gives the coach ×4.33 depth
 * against ×2.81 for a narrow elite one, because in a dense pool everything links anyway and
 * his choices stop mattering.
 *
 * ⛔ Real committed data, never a synthetic pool — the recurring failure in this codebase is
 * a fixture that cannot occur, and this recipe's whole job is to be shaped like the archive.
 */
const SPEC = CHEMISTRY_PACK.pool as Extract<PoolSpec, { kind: "crossEra" }>;

describe("crossEra pool", () => {
  it("is capped, deduped and rating-ranked", async () => {
    const pool = await buildPool(SPEC);
    expect(pool).toHaveLength(SPEC.cap);
    // One card per DISTINCT player — his best season. Without it the same man occupies
    // several slots and "linking" him to himself would be free chemistry.
    expect(new Set(pool.map((c) => c.playerId)).size).toBe(SPEC.cap);
    const ovr = pool.map((c) => c.ratings?.overall ?? 0);
    expect(ovr[0]).toBeGreaterThanOrEqual(ovr.at(-1)!);
  }, 600_000);

  it("⛔ SPANS THE 1990s — the whole reason the priced pool cannot be reused", async () => {
    /**
     * Budget Cap's `pricedMarket` is bounded by the 2004–2025 value window. Excluding the
     * nineties throws away Manchester United '99 and the Arsenal Invincibles — the most
     * recognisable teammate links in the archive, and precisely the pairs this mode exists
     * to reward. If this assertion ever fails, the mode has quietly lost its best material.
     */
    const seasons = pool_seasons(await buildPool(SPEC));
    expect(Math.min(...seasons)).toBeLessThan(2004);
    expect(Math.max(...seasons)).toBeGreaterThan(2015);
  }, 600_000);

  it("⛔ every card carries the fields the LINKS are computed from", async () => {
    const pool = await buildPool(SPEC);
    // `teamId` is the club's stable identity (a club's NAME changes across seasons), and
    // `season` separates club legends from true teammates. A card missing either is a card
    // that can never link on a club — silently, and only in this mode.
    expect(pool.every((c) => typeof c.teamId === "number")).toBe(true);
    expect(pool.every((c) => Number.isFinite(c.season))).toBe(true);
    // Nationality is the third tier. Coverage is 5,109/5,115 archive-wide, so a rating-ranked
    // 600 should be ~complete; a collapse here would gut the countrymen tier.
    const coded = pool.filter((c) => c.nationalityCode != null).length;
    expect(coded / pool.length).toBeGreaterThan(0.95);
  }, 600_000);

  it("can fill every slot of every formation", async () => {
    const pool = await buildPool(SPEC);
    for (const shape of FORMATIONS) {
      for (const slot of shape.slots) {
        const n = pool.filter((c) => canPlay(c, slot.role)).length;
        expect(n, `${shape.name} ${slot.role}`).toBeGreaterThan(11);
      }
    }
  }, 600_000);

  it("is a STABLE set — a silent shift would kill share links", async () => {
    // The `pricedMarket` lesson: two players level on rating at the cap boundary would
    // otherwise be ordered by scan arrival, so the 600th card could change between builds
    // and evict a card someone had already drafted.
    const a = await buildPool(SPEC);
    const b = await buildPool(SPEC);
    expect(a.map((c) => c.cardId)).toEqual(b.map((c) => c.cardId));
  }, 600_000);
});

function pool_seasons(pool: Awaited<ReturnType<typeof buildPool>>): number[] {
  return pool.map((c) => c.season);
}
