import { expect, it } from "vitest";
import { historicalSchedule } from "@/features/game/domain/classic-season";
import { survivalScenario, survivalProgress } from "@/features/game/domain/survival";
import { seasonFixtures } from "@/features/game/domain/season";
import { advanceSurvival, type SurvivalRun } from "@/features/game/view/survival-run";
import { seasonSetup } from "./_helpers/season";

const schedule = historicalSchedule(
  4,
  seasonFixtures(4)
    .flat()
    .map(([home, away], i) => ({
      id: `f${i}`,
      date: `2003-08-${String(i + 1).padStart(2, "0")}`,
      home,
      away,
      homeGoals: 1,
      awayGoals: 1,
    })),
);
const scenario = survivalScenario(schedule, 0, "2003-08-07", 7, 1);
it("starts from actual earlier results and keeps remaining coach fixtures", () => {
  const p = survivalProgress(schedule, scenario, []);
  expect(scenario.start).toBe(6);
  expect(p.own).toMatchObject({ played: 3, points: 3 });
  expect(p.remaining).toHaveLength(3);
  expect(p.pointsNeeded).toBe(4);
  expect(p.status).toBe("in-progress");
});
it("rejects invalid dates, end-of-season starts and corrupt campaign prefixes", () => {
  expect(() => survivalScenario(schedule, 0, "2003-02-30", 7, 1)).toThrow("date");
  expect(() => survivalScenario(schedule, 0, "2003-09-01", 7, 1)).toThrow("mid-season");
  expect(() =>
    survivalProgress(schedule, scenario, [{ fixtureId: "f0", homeGoals: 1, awayGoals: 0 }]),
  ).toThrow("prefix");
  expect(() => survivalProgress(schedule, { ...scenario, start: NaN }, [])).toThrow("scenario");
});
it("does not award safety at a points milestone before the final table", () => {
  const p = survivalProgress(schedule, { ...scenario, targetPoints: 1 }, []);
  expect(p.targetMet).toBe(true);
  expect(p.status).toBe("in-progress");
});
it("reports an unresolved exact boundary tie instead of using club index as safety", () => {
  const results = schedule.fixtures
    .slice(6)
    .map((f) => ({ fixtureId: f.id, homeGoals: 1, awayGoals: 1 }));
  const p = survivalProgress(schedule, scenario, results);
  expect(p.complete).toBe(true);
  expect(p.status).toBe("tiebreak");
});
it("simulates the remaining calendar with immutable baseline, reproducible results and resume", () => {
  const teams = seasonSetup().teams.map((t) => ({ ...t, season: 2003 }));
  const initial: SurvivalRun = { seed: 1811, coach: 0, results: [], scenario };
  const first = advanceSurvival(schedule, teams, initial);
  expect(first.results.length).toBeGreaterThan(0);
  expect(first.results[0].fixtureId).toBe("f6");
  expect(advanceSurvival(schedule, teams, initial)).toEqual(first);
  let run = first;
  for (let i = 0; i < 4 && !survivalProgress(schedule, scenario, run.results).complete; i++)
    run = advanceSurvival(schedule, teams, JSON.parse(JSON.stringify(run)), undefined, true);
  expect(run.results).toHaveLength(6);
  expect(run.results.slice(0, first.results.length)).toEqual(first.results);
  expect(initial.results).toEqual([]);
  expect(advanceSurvival(schedule, teams, run)).toBe(run);
});
it("uses the played away score and rejects duplicate fixture returns", () => {
  const teams = seasonSetup().teams.map((t) => ({ ...t, season: 2003 }));
  const f = schedule.fixtures[6];
  const run: SurvivalRun = {
    seed: 1811,
    coach: f.away,
    results: [],
    scenario: { ...scenario, coach: f.away },
  };
  const score = { fixtureId: f.id, homeGoals: 0, awayGoals: 5 };
  const next = advanceSurvival(schedule, teams, run, score);
  expect(next.results[0]).toMatchObject(score);
  expect(() => advanceSurvival(schedule, teams, next, score)).toThrow("next coach");
});
