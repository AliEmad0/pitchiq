import { premierLeagueSubstitutions } from "../domain/substitution-rules";
import type { HistoricalSchedule, PlayedHistoricalFixture } from "../domain/classic-season";
import { fixtureSeed } from "../domain/season";
import { simulate } from "../domain/simulate";
import type { GameTeam } from "../domain/team";

export interface ClassicResult extends PlayedHistoricalFixture {
  seed: number;
}
export interface ClassicRun {
  seed: number;
  coach: number;
  results: readonly ClassicResult[];
}

/** Fixture ID, not array position: inserting a calendar row must not change another seed. */
export function classicFixtureSeed(seed: number, id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return fixtureSeed(seed, hash >>> 0, 0);
}

/** Advance to and include the next coach fixture. On the coach's last match, finish the
 * remaining rival-only tail too. The table may have unequal played counts after postponements.
 * A supplied played score replaces only that coach fixture, never a rival result.
 */
export function advanceClassic(
  schedule: HistoricalSchedule,
  teams: readonly GameTeam[],
  run: ClassicRun,
  played?: PlayedHistoricalFixture,
): ClassicRun {
  if (
    teams.length !== schedule.clubs ||
    !Number.isInteger(run.coach) ||
    run.coach < 0 ||
    run.coach >= teams.length
  ) {
    throw new Error("Classic league identity mismatch");
  }
  if (
    run.results.length > schedule.fixtures.length ||
    run.results.some(
      (r, i) =>
        r.fixtureId !== schedule.fixtures[i].id ||
        r.seed !== classicFixtureSeed(run.seed, r.fixtureId) ||
        !Number.isSafeInteger(r.homeGoals) ||
        r.homeGoals < 0 ||
        !Number.isSafeInteger(r.awayGoals) ||
        r.awayGoals < 0,
    )
  ) {
    throw new Error("Classic results are not a valid calendar prefix");
  }
  const isCoach = (f: HistoricalSchedule["fixtures"][number]) =>
    f.home === run.coach || f.away === run.coach;
  const next = schedule.fixtures.findIndex((f, i) => i >= run.results.length && isCoach(f));
  if (
    played &&
    (next < 0 ||
      played.fixtureId !== schedule.fixtures[next].id ||
      !Number.isSafeInteger(played.homeGoals) ||
      played.homeGoals < 0 ||
      !Number.isSafeInteger(played.awayGoals) ||
      played.awayGoals < 0)
  ) {
    throw new Error("Played score does not match the next coach fixture");
  }
  if (run.results.length === schedule.fixtures.length) return run;
  const hasLaterCoach = schedule.fixtures.some((f, i) => i > next && isCoach(f));
  const end = next >= 0 && hasLaterCoach ? next + 1 : schedule.fixtures.length;
  const results = [...run.results];
  const rate =
    schedule.fixtures.reduce((sum, f) => sum + f.homeGoals + f.awayGoals, 0) /
    schedule.fixtures.length;
  for (let i = results.length; i < end; i++) {
    const f = schedule.fixtures[i];
    const seed = classicFixtureSeed(run.seed, f.id);
    const score =
      played && i === next
        ? { home: played.homeGoals, away: played.awayGoals }
        : simulate({
            home: teams[f.home],
            away: teams[f.away],
            seed,
            targetGoalsPerMatch: rate,
            substitutions: premierLeagueSubstitutions(teams[f.home].season, f.date),
          }).score;
    results.push({ fixtureId: f.id, seed, homeGoals: score.home, awayGoals: score.away });
  }
  return { ...run, results };
}
