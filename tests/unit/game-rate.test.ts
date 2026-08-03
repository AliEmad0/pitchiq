import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import { rate } from "@/features/game/domain/rate";
import type { RatingContext } from "@/features/game/domain/ratings";

function player(overrides: Partial<Player["metrics"]>, season: number): Player {
  return {
    id: 1, name: "P", role: "CF", altRoles: [], teamId: 1,
    metrics: {
      appearances: 30, goals: 12, assists: 5, yellowCards: 2, redCards: 0, cleanSheets: 0,
      passAccuracy: null, keyPasses: null, tackles: null, interceptions: null,
      duelsWon: null, dribblesCompleted: null, shotsOnTarget: null, ...overrides,
    },
  } as unknown as Player;
}
const ctx = (season: number, p: Player): RatingContext => ({ season, cohort: [p], standings: [] });

describe("rate", () => {
  it("sparse tier when no advanced stats (pre-2003)", () => {
    const p = player({}, 1995);
    const r = rate(p, ctx(1995, p));
    expect(r.provenance.tier).toBe("sparse");
    expect(r.provenance.basis).toEqual({ hasAdvanced: false, hasXg: false });
    expect(r.provenance.season).toBe(1995);
  });

  it("rich tier + hasXg false for the 2003–2016 advanced-but-pre-xG era", () => {
    const p = player({ passAccuracy: 82, keyPasses: 20, tackles: 5, interceptions: 3, duelsWon: 90, dribblesCompleted: 30, shotsOnTarget: 24 }, 2015);
    const r = rate(p, ctx(2015, p));
    expect(r.provenance.tier).toBe("rich");
    expect(r.provenance.basis).toEqual({ hasAdvanced: true, hasXg: false });
  });

  it("rich tier + hasXg true from 2017", () => {
    const p = player({ passAccuracy: 85, keyPasses: 30, tackles: 4, interceptions: 2, duelsWon: 95, dribblesCompleted: 40, shotsOnTarget: 30, xg: 14.2, xa: 6.1 }, 2020);
    const r = rate(p, ctx(2020, p));
    expect(r.provenance.tier).toBe("rich");
    expect(r.provenance.basis).toEqual({ hasAdvanced: true, hasXg: true });
  });
});
