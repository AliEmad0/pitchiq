import { describe, expect, it } from "vitest";
import {
  compareHistoricalRun,
  historicalSchedule,
  type HistoricalFixture,
} from "@/features/game/domain/classic-season";

const fixtures: HistoricalFixture[] = [
  { id: "first", date: "2003-08-16T00:00:00Z", home: 0, away: 1, homeGoals: 2, awayGoals: 1 },
  { id: "second", date: "2004-01-07T00:00:00Z", home: 1, away: 0, homeGoals: 1, awayGoals: 1 },
];

describe("historical schedule", () => {
  it("orders postponed fixtures by actual date and copies inputs", () => {
    const input = fixtures.slice().reverse();
    const before = structuredClone(input);
    const result = historicalSchedule(2, input);
    expect(result.fixtures.map((f) => f.id)).toEqual(["first", "second"]);
    expect(input).toEqual(before);
    expect(result.fixtures[0]).not.toBe(fixtures[0]);
  });
  it("breaks same-date ties by identity independently of input order", () => {
    const input = fixtures.map((f) => ({ ...f, date: fixtures[0].date }));
    expect(historicalSchedule(2, input)).toEqual(historicalSchedule(2, input.slice().reverse()));
  });
  it.each([0, 1, 3, 2.5, NaN])("rejects invalid league size %s", (size) => {
    expect(() => historicalSchedule(size, fixtures)).toThrow();
  });
  it("rejects an incomplete archive", () => {
    expect(() => historicalSchedule(2, fixtures.slice(0, 1))).toThrow("incomplete");
  });
  it.each([
    ["duplicate id", { id: "first" }],
    ["empty id", { id: "" }],
    ["duplicate pair", { home: 0, away: 1 }],
    ["self match", { home: 0, away: 0 }],
    ["unknown club", { home: 3 }],
    ["fractional club", { home: 0.5 }],
    ["negative goals", { homeGoals: -1 }],
    ["fractional goals", { awayGoals: 1.5 }],
    ["invalid date", { date: "invalid" }],
    ["rolled-over date", { date: "2003-02-30" }],
    ["timezone-dependent date", { date: "2003-08-16T12:00:00" }],
  ] as const)("rejects %s", (_, patch) => {
    expect(() => historicalSchedule(2, [fixtures[0], { ...fixtures[1], ...patch }])).toThrow();
  });
});

describe("ghost of the same historical fixtures", () => {
  const schedule = historicalSchedule(2, fixtures);
  it("starts at zero rather than comparing against the full historical season", () => {
    expect(compareHistoricalRun(schedule, 0, [])).toMatchObject({
      played: 0,
      total: 2,
      points: 0,
      historicalPoints: 0,
      pointsDelta: 0,
      complete: false,
    });
  });
  it("compares a draw against the real home win, then a win against the real away draw", () => {
    const first = { fixtureId: "first", homeGoals: 0, awayGoals: 0 };
    expect(compareHistoricalRun(schedule, 0, [first])).toMatchObject({
      points: 1,
      historicalPoints: 3,
      pointsDelta: -2,
      complete: false,
    });
    const result = compareHistoricalRun(schedule, 0, [
      { fixtureId: "second", homeGoals: 0, awayGoals: 2 },
      first,
    ]);
    expect(result).toMatchObject({
      points: 4,
      historicalPoints: 4,
      pointsDelta: 0,
      complete: true,
    });
    expect(result.comparisons[1]).toEqual({
      fixtureId: "second",
      goalsFor: 2,
      goalsAgainst: 0,
      historicalGoalsFor: 1,
      historicalGoalsAgainst: 1,
      points: 3,
      historicalPoints: 1,
      pointsDelta: 2,
    });
  });
  it("orients the same fixture correctly for an away coach", () => {
    expect(
      compareHistoricalRun(schedule, 1, [{ fixtureId: "first", homeGoals: 0, awayGoals: 2 }]),
    ).toMatchObject({ points: 3, historicalPoints: 0, pointsDelta: 3 });
  });
  it.each(["second", "unknown"])("rejects a gap or foreign fixture %s", (fixtureId) => {
    expect(() =>
      compareHistoricalRun(schedule, 0, [{ fixtureId, homeGoals: 0, awayGoals: 0 }]),
    ).toThrow("chronological prefix");
  });
  it("rejects duplicate returns and invalid scores", () => {
    const r = { fixtureId: "first", homeGoals: 0, awayGoals: 0 };
    expect(() => compareHistoricalRun(schedule, 0, [r, r])).toThrow("Duplicate");
    expect(() => compareHistoricalRun(schedule, 0, [{ ...r, awayGoals: NaN }])).toThrow("score");
    expect(() => compareHistoricalRun(schedule, 2, [])).toThrow("coach");
  });
});
