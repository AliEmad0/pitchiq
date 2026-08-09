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

/** As `mk`, but with per-player appearances — needed to give the minutes pool a spread. */
const mkA = (
  id: number,
  role: string,
  goals: number,
  assists: number,
  cs: number,
  appearances: number,
): Player =>
  ({
    id,
    name: `P${id}`,
    teamId: id >= 100 ? 100 + (id % 100) : id <= 4 ? 1 : 2,
    teamName: "T",
    position: "Midfielder",
    role,
    metrics: { appearances, goals, assists, cleanSheets: cs, yellowCards: 2, redCards: 0 },
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

  /**
   * The pre-2003 era has NO individual defensive data, so `defense` is built entirely
   * from the team's record and `physical` entirely from availability. For a centre-back
   * those two carry 0.7 + 0.2 = 90% of `overall`, and both saturate together for any
   * first-choice defender at a good defence — measured, 199 sparse defensive-role
   * seasons reached DEF ≥ 90 against just 14 in the rich era, and Hyypiä '99 (DEF 98,
   * PHY 99) rated 94 while Van Dijk '18/19 rated 87 on real measurements.
   *
   * These are PROXIES, not measurements, and a proxy must not be allowed to express the
   * full 0-100 range that a measurement does. Both are damped toward neutral.
   */
  describe("proxy dimensions cannot saturate", () => {
    // A fixture that actually REPRODUCES the defect. The cohort above cannot: every
    // player has the same appearances, so the minutes percentile ties at 0.5, and with
    // only two teams `teamDefense` tops out at 0.75. The real shape needs a league with
    // a spread of defensive records and a spread of playing time, so one ever-present
    // defender at the best defence tops BOTH pools at once — which is exactly the
    // Hyypiä/Riise season.
    const league = [
      ...Array.from({ length: 6 }, (_, i) =>
        mkA(100 + i, "CB", 1, 0, i === 0 ? 21 : 3 + i, i === 0 ? 38 : 20 + i),
      ),
      ...Array.from({ length: 6 }, (_, i) => mkA(200 + i, "CF", 20 - i, 5, 4, 24 + i)),
      ...Array.from({ length: 6 }, (_, i) => mkA(300 + i, "CM", 6, 8, 4, 22 + i)),
    ];
    const leagueStandings = Array.from({ length: 6 }, (_, i) => ({
      teamId: 100 + i,
      goalsFor: 80 - i * 8,
      goalsAgainst: 20 + i * 10,
      points: 90 - i * 10,
    })) as unknown as Standing[];
    const leagueCtx = makeRatingContext(1996, league, leagueStandings);

    /** Ever-present centre-back at the league's best defence — the defect's shape. */
    const bestDefenceCb = rateSparse(league[0], leagueCtx);

    it("does not let a team-derived defense reach the top of the scale", () => {
      expect(bestDefenceCb.defense).toBeLessThan(90);
    });

    it("does not let pure availability reach the top of the scale", () => {
      expect(bestDefenceCb.physical).toBeLessThan(90);
    });

    it("does not rate a defender at a great defence like a great defender", () => {
      // The exact shape of the Hyypiä/Riise defect: 90% of the rating never measured
      // the player, so team quality alone carried them into the 90s.
      expect(bestDefenceCb.overall).toBeLessThan(85);
    });

    it("still ranks defenders by their team's record — the signal is weaker, not gone", () => {
      expect(bestDefenceCb.defense).toBeGreaterThan(rateSparse(league[5], leagueCtx).defense);
    });

    it("leaves a measured dimension alone — goals are real data", () => {
      // The damping must target the proxies, not the era. Measured across the whole
      // dataset, sparse attackers sit only ~5 points above rich ones at p99, versus a
      // 14x difference in defensive saturation.
      expect(rateSparse(cohort[0], ctx).attack).toBeGreaterThan(90);
    });
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
