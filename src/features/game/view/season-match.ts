import {
  fixtureSeed,
  nextWeek,
  recordResult,
  seasonFixtures,
  type SeasonRun,
} from "@/features/game/domain/season";
import { runMatch, simulate } from "@/features/game/domain/simulate";
import type { MatchResult, MatchSetup, Side } from "@/features/game/domain/match-types";
import type { GameTeam } from "@/features/game/domain/team";
import type { MatchSession } from "./match-session";
import { createStream } from "./match-stream";

export interface SeasonFixture {
  setup: MatchSetup;
  coachSide: Side;
}

/** Preserve the league's teams, home advantage, and fixture seed without re-drafting. */
export function seasonFixture(run: SeasonRun, teams: readonly GameTeam[]): SeasonFixture | null {
  const week = nextWeek(run);
  const fixtures = seasonFixtures(run.clubs)[week];
  const index = fixtures?.findIndex(([h, a]) => h === run.coach || a === run.coach) ?? -1;
  if (index < 0 || fixtures == null) return null;
  const [h, a] = fixtures[index]!;
  return {
    setup: {
      home: teams[h]!,
      away: teams[a]!,
      seed: fixtureSeed(run.seed, week, index),
      targetGoalsPerMatch: 2.7,
    },
    coachSide: h === run.coach ? "home" : "away",
  };
}

export function buildFixtureSession({ setup, coachSide }: SeasonFixture): MatchSession {
  return {
    home: setup.home,
    away: setup.away,
    seed: setup.seed,
    stream: createStream(runMatch(setup), coachSide),
  };
}

/** Commit a whole week atomically. Only the coach's fixture uses the played result. */
export function finishSeasonWeek(
  run: SeasonRun,
  teams: readonly GameTeam[],
  played: MatchResult,
): SeasonRun {
  const fixture = seasonFixture(run, teams);
  if (fixture == null || played.seed !== fixture.setup.seed)
    throw new Error("Result does not belong to the next season fixture");
  const week = nextWeek(run);
  return seasonFixtures(run.clubs)[week]!.reduce((next, [h, a], index) => {
    const seed = fixtureSeed(run.seed, week, index);
    const result =
      h === run.coach || a === run.coach
        ? played
        : simulate({ home: teams[h]!, away: teams[a]!, seed, targetGoalsPerMatch: 2.7 });
    return recordResult(next, {
      week,
      home: h,
      away: a,
      homeGoals: result.score.home,
      awayGoals: result.score.away,
      seed,
    });
  }, run);
}
