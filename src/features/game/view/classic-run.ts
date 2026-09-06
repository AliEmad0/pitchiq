import { availableSeasonTeam, carryInjuries } from "../domain/season-availability";
import type { MatchEvent } from "../domain/match-types";
import type { SeasonInjury } from "../domain/season-availability";
import { premierLeagueSubstitutions } from "../domain/substitution-rules";
import type { HistoricalSchedule, PlayedHistoricalFixture } from "../domain/classic-season";
import { fixtureSeed } from "../domain/season";
import { simulate } from "../domain/simulate";
import type { GameTeam } from "../domain/team";

export interface ClassicResult extends PlayedHistoricalFixture {
  seed: number;
}
export interface ClassicRun {
  injuries?: SeasonInjury[];
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
  played?: PlayedHistoricalFixture & { events?: MatchEvent[] },
  forfeit = false,
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
  let injuries = run.injuries;
  const own = availableSeasonTeam(teams[run.coach], injuries);
  if (!own && (!forfeit || played)) throw new Error("No available Classic XI");
  const rate =
    schedule.fixtures.reduce((sum, f) => sum + f.homeGoals + f.awayGoals, 0) /
    schedule.fixtures.length;
  for (let i = results.length; i < end; i++) {
    const f = schedule.fixtures[i];
    const seed = classicFixtureSeed(run.seed, f.id);
    const result =
      played && i === next
        ? { score: { home: played.homeGoals, away: played.awayGoals }, events: played.events ?? [] }
        : i === next && !own
          ? {
              score: { home: f.home === run.coach ? 0 : 3, away: f.away === run.coach ? 0 : 3 },
              events: [],
            }
          : simulate({
              home: f.home === run.coach ? own! : teams[f.home],
              away: f.away === run.coach ? own! : teams[f.away],
              seed,
              targetGoalsPerMatch: rate,
              substitutions: premierLeagueSubstitutions(teams[f.home].season, f.date),
            });
    const score = result.score;
    if (i === next)
      injuries = carryInjuries(
        injuries ?? [],
        result.events,
        f.home === run.coach ? "home" : "away",
        own ?? teams[run.coach],
      );
    results.push({ fixtureId: f.id, seed, homeGoals: score.home, awayGoals: score.away });
  }
  return { ...run, results, injuries };
}
