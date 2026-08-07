import { describe, expect, it } from "vitest";
import type { Player, Standing } from "@/data/schemas";
import { rateSparse } from "@/features/game/domain/rating-sparse";
import { makeRatingContext } from "@/features/game/domain/ratings";

// Pre-2003 seasons carry ONLY appearances, goals, assists, cards and clean sheets —
// verified across 1996/2000/2002. No tackles, duels or passing data exists at all.
const mk = (id: number, role: string, goals: number, assists: number, cs = 5): Player =>
  ({
    id,
    name: `P${id}`,
    teamId: id <= 4 ? 1 : 2,
    teamName: "T",
    position: "Midfielder",
    role,
    metrics: { appearances: 38, goals, assists, cleanSheets: cs, yellowCards: 2, redCards: 0 },
  }) as unknown as Player;

const cohort = [
  mk(1, "CF", 30, 5),
  mk(2, "CB", 1, 0, 18),
  mk(3, "CM", 8, 12),
  mk(4, "RB", 2, 6),
  mk(5, "CF", 4, 2),
  mk(6, "CB", 0, 1, 3),
  mk(7, "CM", 3, 3),
  mk(8, "LB", 1, 2),
];
const standings = [
  { teamId: 1, goalsFor: 80, goalsAgainst: 20, points: 90 },
  { teamId: 2, goalsFor: 30, goalsAgainst: 70, points: 30 },
] as unknown as Standing[];
const ctx = makeRatingContext(1996, cohort, standings);

describe("rateSparse", () => {
  it("ranks the league's top scorer highest on attack, across all positions", () => {
    const top = rateSparse(cohort[0], ctx).attack;
    for (const p of cohort.slice(1)) expect(rateSparse(p, ctx).attack).toBeLessThan(top);
  });

  it("gives a near-goalless defender a low attack", () => {
    expect(rateSparse(cohort[5], ctx).attack).toBeLessThan(40);
  });

  it("gives a defender at the best defence a higher defense than one at the worst", () => {
    expect(rateSparse(cohort[1], ctx).defense).toBeGreaterThan(rateSparse(cohort[5], ctx).defense);
  });

  it("does not hand a forward the back line's defensive credit", () => {
    // Both play for team 1 (the best defence); the forward must still rate low.
    expect(rateSparse(cohort[0], ctx).defense).toBeLessThan(rateSparse(cohort[1], ctx).defense);
  });

  it("clamps every dimension into 0-100", () => {
    for (const p of cohort) {
      const r = rateSparse(p, ctx);
      for (const v of [r.attack, r.creation, r.defense, r.physical, r.discipline, r.overall]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("attaches no goalkeeper block", () => {
    expect(rateSparse(cohort[0], ctx).gk).toBeUndefined();
  });
});
