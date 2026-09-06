import type { HistoricalSchedule } from "../domain/classic-season";
import type { SurvivalScenario } from "../domain/survival";
import { survivalProgress } from "../domain/survival";
import type { GameTeam } from "../domain/team";
import { advanceClassic, classicFixtureSeed, type ClassicRun } from "./classic-run";

/** Results contain only fixtures AFTER takeover. Archive baseline stays separate. */
export interface SurvivalRun extends ClassicRun {
  scenario: SurvivalScenario;
}

export function advanceSurvival(
  schedule: HistoricalSchedule,
  teams: readonly GameTeam[],
  run: SurvivalRun,
  played?: Parameters<typeof advanceClassic>[3],
  forfeit = false,
): SurvivalRun {
  if (run.coach !== run.scenario.coach) throw new Error("Survival club mismatch");
  const progress = survivalProgress(schedule, run.scenario, run.results);
  if (progress.complete) return run;
  // The Classic driver needs a full calendar prefix to skip past the takeover.
  // This temporary adapter is never saved as campaign history.
  const baseline = schedule.fixtures.slice(0, run.scenario.start).map((f) => ({
    fixtureId: f.id,
    homeGoals: f.homeGoals,
    awayGoals: f.awayGoals,
    seed: classicFixtureSeed(run.seed, f.id),
  }));
  const next = advanceClassic(
    schedule,
    teams,
    { ...run, results: [...baseline, ...run.results] },
    played,
    forfeit,
  );
  return { ...run, results: next.results.slice(baseline.length), injuries: next.injuries };
}
