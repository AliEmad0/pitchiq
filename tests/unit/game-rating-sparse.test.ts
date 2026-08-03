import { describe, expect, it } from "vitest";
import type { Player, Standing } from "@/data/schemas";
import { rateSparse } from "@/features/game/domain/rating-sparse";
import type { RatingContext } from "@/features/game/domain/ratings";

function fwd(id: number, teamId: number, goals: number): Player {
  return {
    id, name: `F${id}`, teamId, role: "CF", altRoles: [],
    metrics: {
      appearances: 34, goals, assists: 4, yellowCards: 2, redCards: 0, cleanSheets: 0,
      passAccuracy: null, keyPasses: null, tackles: null, interceptions: null,
      duelsWon: null, dribblesCompleted: null, shotsOnTarget: null,
    },
  } as unknown as Player;
}
const standings: Standing[] = [
  { rank: 1, teamId: 67, teamName: "A", played: 38, won: 27, drawn: 8, lost: 3, goalsFor: 80, goalsAgainst: 30, goalsDiff: 50, points: 89 },
  { rank: 2, teamId: 68, teamName: "B", played: 38, won: 10, drawn: 8, lost: 20, goalsFor: 35, goalsAgainst: 70, goalsDiff: -35, points: 38 },
] as unknown as Standing[];

describe("rateSparse", () => {
  const cohort: Player[] = [fwd(1, 67, 31), fwd(2, 68, 6), fwd(3, 67, 12), fwd(4, 68, 3)];
  const ctx: RatingContext = { season: 1995, cohort, standings };

  it("scores the prolific striker's attack above a low scorer", () => {
    expect(rateSparse(cohort[0], ctx).attack).toBeGreaterThan(rateSparse(cohort[3], ctx).attack);
  });

  it("produces all six dimensions in 0–100 with no advanced stats", () => {
    const r = rateSparse(cohort[0], ctx);
    for (const key of ["attack", "creation", "defense", "physical", "discipline", "overall"] as const) {
      expect(r[key]).toBeGreaterThanOrEqual(0);
      expect(r[key]).toBeLessThanOrEqual(100);
    }
  });

  it("does not crash when the team is missing from the table", () => {
    const orphan = fwd(9, 999, 10);
    expect(() => rateSparse(orphan, { ...ctx, cohort: [...cohort, orphan] })).not.toThrow();
  });
});
