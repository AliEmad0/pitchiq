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
import { powerOf } from "@/features/game/domain/team-power";

/**
 * TASK-1844 Task 5 — re-fit CHEM_EFFECT against the RECALIBRATED engine. THROWAWAY.
 *
 * ⛔ The old 0.08 was fitted when a rating point bought almost nothing. Chemistry costs a
 * measured ~6.8 rating points per player, so the constant that balances the two must move once
 * rating points are worth something. Target: chem XI and rating XI win about equally often,
 * tilted ~1 point toward the coach who played the mode as intended.
 */
const SPEC = CHEMISTRY_PACK.pool as Extract<PoolSpec, { kind: "crossEra" }>;
const SHAPE = formationByName("4-4-2 Flat");
const EFFECTS = [0.02, 0.03, 0.04];
const ROOMS = 30;
const MATCHES_PER_ROOM = 400; // 30 x 400 = 12,000 per constant

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

const meanOvr = (xi: PoolCard[]) =>
  xi.reduce((a, c) => a + (c.ratings?.overall ?? 0), 0) / xi.length;

describe("re-fit CHEM_EFFECT", () => {
  it("sweeps the constant against the recalibrated engine", async () => {
    const pool = await buildPool(SPEC);
    const rooms: Array<{ chem: PoolCard[]; rate: PoolCard[] }> = [];
    for (let seed = 1; rooms.length < ROOMS && seed < 400; seed++) {
      const hands = roomDeals(pool, SHAPE, seed * 7919, { handSize: 5, onePerPlayer: true });
      if (hands.some((h) => h.length === 0)) continue;
      rooms.push({ chem: chemXi(hands), rate: ratingXi(hands) });
    }
    expect(rooms).toHaveLength(ROOMS);

    const chemMean = rooms.reduce((a, r) => a + meanOvr(r.chem), 0) / ROOMS;
    const rateMean = rooms.reduce((a, r) => a + meanOvr(r.rate), 0) / ROOMS;
    const chemScore = rooms.reduce((a, r) => a + chemistry(r.chem, SHAPE), 0) / ROOMS;
    const rateScore = rooms.reduce((a, r) => a + chemistry(r.rate, SHAPE), 0) / ROOMS;
    console.log(
      `chem XI: rating ${chemMean.toFixed(1)} chemistry ${chemScore.toFixed(1)}` +
        ` | rating XI: rating ${rateMean.toFixed(1)} chemistry ${rateScore.toFixed(1)}` +
        ` | chemistry COSTS ${(rateMean - chemMean).toFixed(1)} rating points per player`,
    );

    // ⛔ §0.5's lesson applied to this harness: MEAN OVERALL is not what the engine reads. It
    // aggregates role-weighted attack and defence, so report those too before trusting any fit.
    const power = (pick: (r: (typeof rooms)[number]) => PoolCard[]) => {
      let att = 0;
      let def = 0;
      for (const r of rooms) {
        const p = powerOf(makeGameTeam(1, "x", 2020, SHAPE, pick(r)));
        att += p.attack;
        def += p.defense;
      }
      return `attack ${(att / ROOMS).toFixed(1)} defence ${(def / ROOMS).toFixed(1)}`;
    };
    console.log(`POWER — chem XI: ${power((r) => r.chem)} | rating XI: ${power((r) => r.rate)}`);

    for (const effect of EFFECTS) {
      let chemWins = 0;
      let rateWins = 0;
      let draws = 0;
      let played = 0;
      rooms.forEach((room, i) => {
        const chemTeam = makeGameTeam(1, "Chem", 2020, SHAPE, room.chem);
        const rateTeam = makeGameTeam(2, "Rating", 2020, SHAPE, room.rate);
        const chemOf = chemistry(room.chem, SHAPE);
        const rateOf = chemistry(room.rate, SHAPE);
        for (let m = 0; m < MATCHES_PER_ROOM; m++) {
          // ⛔ EACH PAIRING IS PLAYED BOTH WAYS. A one-sided fixture cannot separate the mode's
          // effect from home advantage, and the first version of this harness had the chemistry
          // XI at home in all 3,000 matches.
          const chemHome = m % 2 === 0;
          const r = simulate({
            home: chemHome ? chemTeam : rateTeam,
            away: chemHome ? rateTeam : chemTeam,
            seed: i * 100003 + m * 31 + Math.round(effect * 1000),
            targetGoalsPerMatch: 2.7,
            modifiers: [
              chemistryModifier(
                chemHome ? { home: chemOf, away: rateOf } : { home: rateOf, away: chemOf },
                effect,
              ),
            ],
          });
          played++;
          const chemGoals = chemHome ? r.score.home : r.score.away;
          const rateGoals = chemHome ? r.score.away : r.score.home;
          if (chemGoals > rateGoals) chemWins++;
          else if (rateGoals > chemGoals) rateWins++;
          else draws++;
        }
      });
      const pct = (x: number) => ((x / played) * 100).toFixed(1);
      console.log(
        `effect ${String(effect).padEnd(5)}: chem ${pct(chemWins)}%  rating ${pct(rateWins)}%` +
          `  draw ${pct(draws)}%  (n=${played})`,
      );
    }
  }, 3_600_000);
});
