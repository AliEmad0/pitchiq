import { teamChemistryModifier } from "@/features/game/domain/chemistry-modifier";
import { absentLine, valueLine } from "@/features/game/domain/market-value";
import type { MatchConditions, MatchResult, Side } from "@/features/game/domain/match-types";
import {
  type Mentality,
  mentalityModifier,
  mentalityTarget,
} from "@/features/game/domain/mentality";
import {
  fixtureSeed,
  nextWeek,
  recordResult,
  type SeasonResult,
  type SeasonRun,
} from "@/features/game/domain/season";
import { simulate } from "@/features/game/domain/simulate";
import { type CraftedTraits, personalityModifier } from "@/features/game/domain/traits";
import type { GameTeam } from "@/features/game/domain/team";
import { LADDER_CLUBS, LADDER_DAYS, ladderFixtures } from "@/features/game/domain/weekly";
import type { SeasonFixture } from "./season-match";

/** Squads span seasons, so the neutral rate — the same one every drafted match plays to. */
const RATE = 2.7;

/**
 * TASK-1828 — one ladder week in progress. A `SeasonRun` over eight clubs (the coach is index 0)
 * plus the week it belongs to; `results` are the whole league's, stored matchday by matchday.
 */
export type LadderRun = SeasonRun;

export const newLadderRun = (seed: number): LadderRun => ({
  seed,
  clubs: LADDER_CLUBS,
  coach: 0,
  results: [],
});

/** Every matchday recorded — played or no-show. */
export const ladderComplete = (run: SeasonRun): boolean => nextWeek(run) >= LADDER_DAYS;

const other = (s: Side): Side => (s === "home" ? "away" : "home");

/**
 * The coach's next fixture, under the week's conditions and his stance for the day.
 *
 * ⛔ The conditions apply to EVERY fixture of the week, the rival-only ones included — the week's
 * rules are the league's, not the coach's handicap.
 */
export function ladderFixture(
  run: SeasonRun,
  teams: readonly GameTeam[],
  conditions: MatchConditions,
  stance?: Mentality,
  /** TASK-1829 — the coach's crafted badges. */
  crafted?: CraftedTraits,
): SeasonFixture | null {
  const day = nextWeek(run);
  const fixtures = ladderFixtures()[day];
  const index = fixtures?.findIndex(([h, a]) => h === run.coach || a === run.coach) ?? -1;
  if (fixtures == null || index < 0) return null;
  const [h, a] = fixtures[index]!;
  const coachSide: Side = h === run.coach ? "home" : "away";
  const counter = mentalityModifier(coachSide, stance);
  // TASK-1814 — traits play in every ladder fixture; results are stored, never replayed.
  const traits = personalityModifier(
    teams[h]!,
    teams[a]!,
    crafted == null ? undefined : { side: coachSide, traits: crafted },
  );
  return {
    setup: {
      home: teams[h]!,
      away: teams[a]!,
      seed: fixtureSeed(run.seed, day, index),
      targetGoalsPerMatch: mentalityTarget(RATE, stance),
      conditions,
      crisis: true,
      // TASK-1824 — chemistry with role fit leads, as in every other mode.
      modifiers: [
        teamChemistryModifier(teams[h]!, teams[a]!),
        traits,
        ...(counter == null ? [] : [counter]),
      ],
    },
    coachSide,
  };
}

/**
 * Commit one matchday: the coach's played result (or a no-show), every other fixture simulated
 * under the same conditions. ⛔ Atomic and PURE — the whole day lands or none of it does, and
 * the duplicate guard in `recordResult` refuses a day committed twice.
 */
export function finishLadderDay(
  run: LadderRun,
  teams: readonly GameTeam[],
  conditions: MatchConditions,
  played: MatchResult | null,
  stance?: Mentality,
  crafted?: CraftedTraits,
): LadderRun {
  const day = nextWeek(run);
  const fixtures = ladderFixtures()[day];
  if (fixtures == null) throw new Error("the ladder week is already complete");
  const coachFixture = ladderFixture(run, teams, conditions, stance, crafted);
  if (played != null && played.seed !== coachFixture?.setup.seed) {
    throw new Error("result does not belong to the next ladder fixture");
  }
  let next: LadderRun = run;
  fixtures.forEach(([h, a], index) => {
    const seed = fixtureSeed(run.seed, day, index);
    const coachHere = h === run.coach || a === run.coach;
    const coachSide: Side = h === run.coach ? "home" : "away";
    let result: MatchResult;
    if (coachHere) {
      // ⚠️ A no-show is a 0–3 defeat — the season's forfeit score — and nobody appeared.
      result = played ?? {
        score: { home: coachSide === "home" ? 0 : 3, away: coachSide === "away" ? 0 : 3 },
        events: [],
        seed,
      };
      const coach = teams[run.coach]!;
      const line =
        played == null
          ? absentLine(day, result.score[coachSide], result.score[other(coachSide)])
          : valueLine(
              day,
              played,
              coachSide,
              [...coach.players, ...(coach.bench ?? [])],
              coach.players,
            );
      next = { ...next, market: [...(next.market ?? []), line] };
    } else {
      result = simulate({
        home: teams[h]!,
        away: teams[a]!,
        seed,
        targetGoalsPerMatch: RATE,
        conditions,
        modifiers: [
          teamChemistryModifier(teams[h]!, teams[a]!),
          personalityModifier(teams[h]!, teams[a]!),
        ],
        crisis: true,
      });
    }
    const row: SeasonResult = {
      week: day,
      home: h,
      away: a,
      homeGoals: result.score.home,
      awayGoals: result.score.away,
      seed,
    };
    next = recordResult(next, row) as LadderRun;
  });
  return next;
}

/** Close a week that ran out: every matchday still open becomes a no-show. */
export function closeLadderWeek(
  run: LadderRun,
  teams: readonly GameTeam[],
  conditions: MatchConditions,
): LadderRun {
  let next = run;
  while (!ladderComplete(next)) next = finishLadderDay(next, teams, conditions, null);
  return next;
}
