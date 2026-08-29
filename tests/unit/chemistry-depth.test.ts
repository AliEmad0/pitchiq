import { describe, expect, it } from "vitest";
import { buildPool } from "@/features/game/adapter/pool";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { chemistry, chemistryBreakdown } from "@/features/game/domain/chemistry";
import { roomDeals } from "@/features/game/domain/draft-room";
import { formationByName } from "@/features/game/domain/formation";
import { CHEMISTRY_PACK, type PoolSpec } from "@/features/game/domain/rule-packs";

/**
 * ⛔ THE TEST THAT MATTERS MOST — the discrimination control.
 *
 * TASK-1824's design constraint warned that chemistry can collapse into a flat constant: the
 * pool spans 1992–2026, so a same-club link is rare and a same-era link is common, and a
 * naive weighting leaves every XI scoring the same. If that ever happens this suite fails,
 * and it fails LOUDLY — a green chemistry suite elsewhere would still be green, because the
 * model would be internally consistent and completely pointless.
 *
 * ⚠️ Asserted as PROPERTIES, never golden numbers. The pool moves with every data refresh, so
 * a pinned figure would be re-baselined into meaninglessness within a month; ratios between
 * strategies survive.
 */
const SPEC = CHEMISTRY_PACK.pool as Extract<PoolSpec, { kind: "crossEra" }>;
const SHAPE = formationByName("4-4-2 Flat");
const ROOMS = 40;

/** The coach who takes whatever is in front of him. */
const randomXi = (hands: PoolCard[][], seed: number) => hands.map((h) => h[seed % h.length]!);

/** The coach who picks for links, slot by slot, seeing only what he has already placed. */
function chemistryXi(hands: PoolCard[][]): PoolCard[] {
  const xi: PoolCard[] = [];
  for (const hand of hands) {
    xi.push(
      hand.reduce((best, card) =>
        chemistry([...xi, card], SHAPE) > chemistry([...xi, best], SHAPE) ? card : best,
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

describe("chemistry discriminates", () => {
  it("⛔ a coach who STEERS beats one who does not, by a wide margin", async () => {
    const pool = await buildPool(SPEC);
    let random = 0;
    let steered = 0;
    let rated = 0;
    let rooms = 0;

    for (let seed = 1; seed <= ROOMS; seed++) {
      const hands = roomDeals(pool, SHAPE, seed, { handSize: 5, onePerPlayer: true });
      if (hands.some((h) => h.length === 0)) continue;
      rooms++;
      random += chemistry(randomXi(hands, seed), SHAPE);
      steered += chemistry(chemistryXi(hands), SHAPE);
      rated += chemistry(ratingXi(hands), SHAPE);
    }
    expect(rooms).toBeGreaterThan(30); // a vacuous loop would pass everything below

    const avg = (n: number) => n / rooms;
    // Measured 2026-08-28 at roughly ×3 on the real pool. Asserted at ×2 so a data refresh
    // cannot re-baseline it, but a COLLAPSE cannot hide.
    expect(avg(steered)).toBeGreaterThan(avg(random) * 2);
    // ⭐ And the trade-off is real in the other direction: chasing ratings alone does NOT
    // accidentally produce chemistry. If it did, the mode would be a free win.
    expect(avg(steered)).toBeGreaterThan(avg(rated) * 1.5);
  }, 900_000);

  it("⛔ chemistry COSTS rating — the trade-off that makes it a decision", async () => {
    /**
     * Measured: chasing chemistry costs ~6.8 rating points per player. If this ever reaches
     * zero the mode is a free win — the coach maximises links at no price and there is no
     * decision left to make. This is also the exchange rate `chemistryModifier` pays back.
     */
    const pool = await buildPool(SPEC);
    let chemRating = 0;
    let bestRating = 0;
    let rooms = 0;
    for (let seed = 1; seed <= ROOMS; seed++) {
      const hands = roomDeals(pool, SHAPE, seed, { handSize: 5, onePerPlayer: true });
      if (hands.some((h) => h.length === 0)) continue;
      rooms++;
      const mean = (xi: PoolCard[]) =>
        xi.reduce((a, c) => a + (c.ratings?.overall ?? 0), 0) / xi.length;
      chemRating += mean(chemistryXi(hands));
      bestRating += mean(ratingXi(hands));
    }
    expect(rooms).toBeGreaterThan(30);
    expect(bestRating / rooms - chemRating / rooms).toBeGreaterThan(3);
  }, 900_000);

  it("⚠️ the score is not saturated — a steered XI still has room above it", async () => {
    // A model that pinned every steered XI at 100 would "discriminate" and still be broken:
    // the coach would have nothing left to chase. Real drafts should land well short.
    const pool = await buildPool(SPEC);
    const hands = roomDeals(pool, SHAPE, 42, { handSize: 5, onePerPlayer: true });
    const score = chemistry(chemistryXi(hands), SHAPE);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(90);
  }, 900_000);

  it("reports links a coach would recognise — teammates are RARE, nation is common", async () => {
    // Spec §0.1 on the real pool: the tier mix should reflect the archive, not a flat spread.
    const pool = await buildPool(SPEC);
    const hands = roomDeals(pool, SHAPE, 7, { handSize: 5, onePerPlayer: true });
    const b = chemistryBreakdown(chemistryXi(hands), SHAPE);
    expect(b.none + b.nation + b.club + b.teammates).toBe(23);
    expect(b.nation).toBeGreaterThanOrEqual(b.teammates);
  }, 900_000);
});
