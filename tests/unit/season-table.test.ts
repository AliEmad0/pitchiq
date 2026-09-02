import { describe, expect, it } from "vitest";
import { type SeasonResult, seasonTable } from "@/features/game/domain/season";

const r = (home: number, away: number, hg: number, ag: number, week = 0): SeasonResult => ({
  week,
  home,
  away,
  homeGoals: hg,
  awayGoals: ag,
  seed: 1,
});

describe("seasonTable", () => {
  it("awards three for a win and one each for a draw", () => {
    const t = seasonTable(4, [r(0, 1, 2, 0), r(2, 3, 1, 1)]);
    expect(t.find((x) => x.club === 0)!.points).toBe(3);
    expect(t.find((x) => x.club === 1)!.points).toBe(0);
    expect(t.find((x) => x.club === 2)!.points).toBe(1);
    expect(t.find((x) => x.club === 3)!.points).toBe(1);
  });

  it("counts played, won, drawn, lost, for, against and difference", () => {
    const row = seasonTable(2, [r(0, 1, 3, 1), r(1, 0, 2, 2)])[0]!;
    expect(row.club).toBe(0);
    expect({ p: row.played, w: row.won, d: row.drawn, l: row.lost }).toEqual({
      p: 2,
      w: 1,
      d: 1,
      l: 0,
    });
    expect({ gf: row.goalsFor, ga: row.goalsAgainst, gd: row.goalDifference }).toEqual({
      gf: 5,
      ga: 3,
      gd: 2,
    });
  });

  it("⛔ orders by points, then goal difference, then goals scored", () => {
    // Level on points; the better difference goes above.
    const t = seasonTable(4, [r(0, 1, 1, 0), r(2, 3, 5, 0)]);
    expect(t[0]!.club).toBe(2);
    expect(t[1]!.club).toBe(0);
  });

  it("⛔ separates equal points and equal difference by GOALS SCORED", () => {
    // 3-2 and 1-0 are both +1, but the first side scored more.
    const t = seasonTable(4, [r(0, 1, 1, 0), r(2, 3, 3, 2)]);
    expect(t[0]!.club).toBe(2);
    expect(t[0]!.goalDifference).toBe(t[1]!.goalDifference);
  });

  it("⚠️ breaks a DEAD heat deterministically rather than by input order", () => {
    // Identical records must not depend on the order results were appended.
    const a = seasonTable(4, [r(0, 1, 1, 0), r(2, 3, 1, 0)]).map((x) => x.club);
    const b = seasonTable(4, [r(2, 3, 1, 0), r(0, 1, 1, 0)]).map((x) => x.club);
    expect(a).toEqual(b);
  });

  it("lists every club even before a ball is kicked", () => {
    const t = seasonTable(20, []);
    expect(t).toHaveLength(20);
    for (const row of t) expect(row.points).toBe(0);
  });

  it("⛔ conserves points and goals across the whole table", () => {
    const results = [r(0, 1, 2, 1), r(2, 3, 0, 0), r(1, 2, 3, 4, 1), r(3, 0, 1, 1, 1)];
    const t = seasonTable(4, results);
    const draws = results.filter((x) => x.homeGoals === x.awayGoals).length;
    expect(t.reduce((a, x) => a + x.points, 0)).toBe((results.length - draws) * 3 + draws * 2);
    const scored = results.reduce((a, x) => a + x.homeGoals + x.awayGoals, 0);
    expect(t.reduce((a, x) => a + x.goalsFor, 0)).toBe(scored);
    expect(t.reduce((a, x) => a + x.goalsAgainst, 0)).toBe(scored);
    expect(t.reduce((a, x) => a + x.goalDifference, 0)).toBe(0);
  });
});
