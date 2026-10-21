import { describe, expect, it } from "vitest";
import { formationByName } from "@/features/game/domain/formation";
import {
  absentLine,
  baseValue,
  formatValue,
  isValueLine,
  type ValueLine,
  valueLine,
  valueSeries,
} from "@/features/game/domain/market-value";
import type { MatchResult } from "@/features/game/domain/match-types";
import { simulate } from "@/features/game/domain/simulate";
import { makeGameTeam } from "@/features/game/domain/team";
import { finishSeasonWeek, seasonFixture } from "@/features/game/view/season-match";
import { poolFixture } from "./_helpers/game-pool";

/** TASK-1826 — synthesised values that move with in-run output, derived from stored lines. */
const card = (cardId: string, role: string, overall: number) => ({
  cardId: cardId as `${number}@${number}`,
  role: role as never,
  ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall },
});
const line = (over: Partial<ValueLine> = {}): ValueLine => ({
  week: 0,
  on: [],
  goals: [],
  assists: [],
  conceded: 1,
  result: "d",
  ...over,
});

describe("market value", () => {
  it("bases a value on the rating, rising steeply and clamped to £0.5m–£40m", () => {
    expect(baseValue(60)).toBe(20);
    expect(baseValue(80)).toBeGreaterThan(baseValue(70));
    expect(baseValue(99)).toBe(336);
    expect(baseValue(130)).toBe(400);
    expect(baseValue(0)).toBe(5);
    expect(formatValue(124)).toBe("12.4");
  });

  it("goals, assists and wins raise a value; time out of the side erodes it", () => {
    const st = card("1@2020", "CF", 80);
    const bench = card("2@2020", "CF", 80);
    const s = valueSeries(
      [st, bench],
      [line({ on: [st.cardId], goals: [st.cardId, st.cardId], assists: [], result: "w" })],
    );
    expect(s.get(st.cardId)![1]!).toBeGreaterThan(s.get(st.cardId)![0]!);
    expect(s.get(bench.cardId)![1]!).toBeLessThan(s.get(bench.cardId)![0]!);
  });

  it("a clean sheet pays the keeper and the back line, not the striker", () => {
    const gk = card("1@2020", "GK", 70);
    const cf = card("2@2020", "CF", 70);
    const s = valueSeries([gk, cf], [line({ on: [gk.cardId, cf.cardId], conceded: 0 })]);
    expect(s.get(gk.cardId)![1]! - s.get(gk.cardId)![0]!).toBeGreaterThan(
      s.get(cf.cardId)![1]! - s.get(cf.cardId)![0]!,
    );
  });

  it("⛔ a value can neither collapse nor explode over a long run", () => {
    const c = card("1@2020", "CF", 70);
    const hot = Array.from({ length: 100 }, (_, w) =>
      line({ week: w, on: [c.cardId], goals: [c.cardId, c.cardId], result: "w" }),
    );
    const cold = Array.from({ length: 100 }, (_, w) => line({ week: w }));
    expect(valueSeries([c], hot).get(c.cardId)!.at(-1)).toBe(baseValue(70) * 3);
    expect(valueSeries([c], cold).get(c.cardId)!.at(-1)).toBe(Math.round(baseValue(70) * 0.5));
  });

  it("captures a line from REAL events: scorers, assisters and subs, never a chalked-off goal", () => {
    const pool = poolFixture();
    const f = formationByName("4-4-2 Flat");
    const xi = f.slots.map((s, i) => pool.filter((c) => c.role === s.role)[i % 5]!);
    const bench = pool.filter((c) => !xi.includes(c)).slice(0, 7);
    const home = makeGameTeam(1, "A", 0, f, xi, bench);
    const away = makeGameTeam(
      2,
      "B",
      0,
      f,
      xi.map((c) => pool.find((p) => p.role === c.role && p !== c)!),
    );
    for (let seed = 1; seed <= 30; seed++) {
      const result = simulate({ home, away, seed, targetGoalsPerMatch: 2.7 });
      const l = valueLine(3, result, "home", [...xi, ...bench], xi);
      const counted = result.events.filter(
        (e) =>
          e.kind === "goal" &&
          e.side === "home" &&
          e.disallowedAt == null &&
          e.ownGoalBy == null &&
          e.playerId != null,
      ).length;
      expect(l.goals).toHaveLength(counted);
      expect(l.on.length).toBeGreaterThanOrEqual(11);
      expect(l.conceded).toBe(result.score.away);
      expect(isValueLine(l)).toBe(true);
    }
  });

  it("an absent line is nobody playing, and storage shape is checked", () => {
    expect(absentLine(2, 0, 3)).toEqual(line({ week: 2, conceded: 3, result: "l" }));
    expect(isValueLine({ week: 1 })).toBe(false);
    expect(isValueLine(null)).toBe(false);
  });

  it("⭐ a season week records the coach's line once, at commit (TASK-1811 seam)", () => {
    const pool = poolFixture();
    const f = formationByName("4-4-2 Flat");
    const teams = Array.from({ length: 4 }, (_, t) =>
      makeGameTeam(
        t,
        `T${t}`,
        0,
        f,
        f.slots.map((s, i) => pool.filter((c) => c.role === s.role)[(t + i) % 5]!),
      ),
    );
    const run = { seed: 4, clubs: 4, coach: 0, results: [] };
    const fx = seasonFixture(run, teams)!;
    const played: MatchResult = simulate(fx.setup);
    const next = finishSeasonWeek(run, teams, played);
    expect(next.market).toHaveLength(1);
    expect(next.market![0]!.week).toBe(0);
  });
});
