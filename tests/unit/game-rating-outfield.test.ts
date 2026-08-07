import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import { DEFENSIVE_ROLES, rateOutfield } from "@/features/game/domain/rating-outfield";
import { makeRatingContext } from "@/features/game/domain/ratings";

const ext = (over: Record<string, number> = {}) => ({
  minutesPlayed: 3420,
  duelsLost: 40,
  groundDuelsWon: 30,
  groundDuelsLost: 20,
  tacklesWon: 12,
  clearances: 100,
  blocks: 10,
  goalsConceded: 40,
  foulsWon: 20,
  foulsConceded: 20,
  ...over,
});

const mk = (id: number, role: string, over: Record<string, unknown> = {}): Player =>
  ({
    id,
    name: `P${id}`,
    teamId: 1,
    teamName: "T",
    position: "Defender",
    role,
    metrics: {
      appearances: 38,
      goals: 0,
      assists: 0,
      tackles: 20,
      interceptions: 20,
      duelsWon: 60,
      passAccuracy: 80,
      keyPasses: 5,
      shotsOnTarget: 2,
      yellowCards: 2,
      redCards: 0,
      extended: ext(),
      ...over,
    },
  }) as unknown as Player;

const cohort = [
  mk(1, "CB"),
  // Better on every validated quality rate, and concedes less on-pitch.
  mk(2, "CB", {
    duelsWon: 90,
    tackles: 20,
    extended: ext({
      duelsLost: 10,
      groundDuelsWon: 50,
      groundDuelsLost: 5,
      tacklesWon: 18,
      goalsConceded: 20,
    }),
  }),
  mk(3, "CF", { goals: 25, shotsOnTarget: 60 }),
  mk(4, "CM"),
  mk(5, "RB"),
  mk(6, "LB"),
  mk(7, "CDM"),
  mk(8, "RW"),
];
const ctx = makeRatingContext(2019, cohort, []);

describe("rateOutfield", () => {
  it("gives the league's top scorer a high attack", () => {
    expect(rateOutfield(cohort[2], ctx).attack).toBeGreaterThan(80);
  });

  it("gives a zero-goal defender a LOW attack, ranked across all outfielders", () => {
    expect(rateOutfield(cohort[0], ctx).attack).toBeLessThan(45);
  });

  it("rewards the better duel and tackle rates with a higher defense", () => {
    expect(rateOutfield(cohort[1], ctx).defense).toBeGreaterThan(
      rateOutfield(cohort[0], ctx).defense,
    );
  });

  it("only applies the structural on-pitch goals-conceded signal to defensive roles", () => {
    expect(DEFENSIVE_ROLES.has("CB")).toBe(true);
    expect(DEFENSIVE_ROLES.has("CDM")).toBe(true);
    expect(DEFENSIVE_ROLES.has("RW")).toBe(false);
    expect(DEFENSIVE_ROLES.has("CF")).toBe(false);
  });

  it("clamps every dimension into 0-100", () => {
    for (const p of cohort) {
      const r = rateOutfield(p, ctx);
      for (const v of [r.attack, r.creation, r.defense, r.physical, r.discipline, r.overall]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("does not attach a goalkeeper block to an outfielder", () => {
    expect(rateOutfield(cohort[0], ctx).gk).toBeUndefined();
  });
});
