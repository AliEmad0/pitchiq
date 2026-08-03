import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import { rateRich } from "@/features/game/domain/rating-rich";
import type { RatingContext } from "@/features/game/domain/ratings";

function striker(id: number, goals: number): Player {
  return {
    id, name: `S${id}`, role: "CF", altRoles: [],
    metrics: {
      appearances: 30, goals, assists: 5, yellowCards: 2, redCards: 0,
      cleanSheets: 0, passAccuracy: 80, keyPasses: 20, tackles: 5,
      interceptions: 3, duelsWon: 100, dribblesCompleted: 40, shotsOnTarget: goals * 2,
    },
  } as unknown as Player;
}

describe("rateRich", () => {
  const cohort: Player[] = [striker(1, 2), striker(2, 8), striker(3, 15), striker(4, 25)];
  const ctx: RatingContext = { season: 2015, cohort, standings: [] };

  it("scores the top scorer's attack near the top", () => {
    const top = rateRich(cohort[3], ctx); // 25 goals
    const low = rateRich(cohort[0], ctx); // 2 goals
    expect(top.attack).toBeGreaterThan(low.attack);
    expect(top.attack).toBeLessThanOrEqual(100);
    expect(top.attack).toBeGreaterThanOrEqual(0);
  });

  it("produces all six dimensions in 0–100", () => {
    const r = rateRich(cohort[2], ctx);
    for (const key of ["attack", "creation", "defense", "physical", "discipline", "overall"] as const) {
      expect(r[key]).toBeGreaterThanOrEqual(0);
      expect(r[key]).toBeLessThanOrEqual(100);
    }
  });

  it("rewards clean discipline (fewer cards → higher)", () => {
    const clean = { ...cohort[2], metrics: { ...cohort[2].metrics, yellowCards: 0, redCards: 0 } } as Player;
    const dirty = { ...cohort[2], metrics: { ...cohort[2].metrics, yellowCards: 10, redCards: 2 } } as Player;
    const c2 = [cohort[0], cohort[1], clean, dirty];
    expect(rateRich(clean, { ...ctx, cohort: c2 }).discipline)
      .toBeGreaterThan(rateRich(dirty, { ...ctx, cohort: c2 }).discipline);
  });
});
