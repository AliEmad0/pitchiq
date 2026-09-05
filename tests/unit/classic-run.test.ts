import { expect, it } from "vitest";
import { advanceClassic, classicFixtureSeed } from "@/features/game/view/classic-run";
import { historicalSchedule } from "@/features/game/domain/classic-season";
import { seasonFixtures } from "@/features/game/domain/season";
import { seasonSetup as legacySeasonSetup } from "./_helpers/season";

// Classic has one historical year; Legacy's helper intentionally creates all-era teams.
const seasonSetup = () => {
  const setup = legacySeasonSetup();
  return { ...setup, teams: setup.teams.map((t) => ({ ...t, season: 2003 })) };
};

const fixtures = seasonFixtures(4)
  .flat()
  .map(([home, away], i) => ({
    id: `match-${i}`,
    date: `2003-08-${String(i + 1).padStart(2, "0")}`,
    home,
    away,
    homeGoals: 2,
    awayGoals: 1,
  }));
const schedule = historicalSchedule(4, fixtures);
it("plays the calendar through each coach fixture, including the final rival tail", () => {
  const { teams } = seasonSetup();
  let run = { seed: 44, coach: 0, results: [] as ReturnType<typeof advanceClassic>["results"] };
  let turns = 0;
  while (run.results.length < fixtures.length) {
    run = advanceClassic(schedule, teams, run);
    turns++;
    expect(turns).toBeLessThanOrEqual(6);
  }
  expect(turns).toBe(6);
  expect(run.results.map((r) => r.fixtureId)).toEqual(schedule.fixtures.map((f) => f.id));
  expect(advanceClassic(schedule, teams, run)).toBe(run);
});
it("preserves a played away score, old results and deterministic rival simulations", () => {
  const { teams } = seasonSetup();
  const initial = { seed: 44, coach: fixtures[0].away, results: [] };
  const played = { fixtureId: fixtures[0].id, homeGoals: 0, awayGoals: 7 };
  const next = advanceClassic(schedule, teams, initial, played);
  expect(next.results[0]).toMatchObject(played);
  expect(initial.results).toEqual([]);
  expect(advanceClassic(schedule, teams, initial, played)).toEqual(next);
  expect(advanceClassic(schedule, teams, next).results.slice(0, next.results.length)).toEqual(
    next.results,
  );
  expect(() => advanceClassic(schedule, teams, next, played)).toThrow("next coach");
});
it("rejects foreign or corrupt saved prefixes instead of silently changing their identity", () => {
  const { teams } = seasonSetup();
  const run = {
    seed: 1,
    coach: 0,
    results: [{ fixtureId: "wrong", seed: 2, homeGoals: 0, awayGoals: 0 }],
  };
  expect(() => advanceClassic(schedule, teams, run)).toThrow("calendar prefix");
  expect(classicFixtureSeed(1, "a")).not.toBe(classicFixtureSeed(1, "b"));
});
