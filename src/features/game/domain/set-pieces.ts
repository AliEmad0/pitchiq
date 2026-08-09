import type { FreeKickOutcome, PenaltyOutcome } from "./match-types";

/**
 * TASK-1822 Phase 2 — penalties and direct free kicks.
 *
 * ⚠️ CALIBRATION RULE FOR EVERY PHASE THAT ADDS A WAY TO SCORE. Set-piece goals are
 * SUBTRACTED from the open-play target (`openPlayTarget` below) rather than added on
 * top of it. Without that, `targetGoalsPerMatch` stops meaning anything: each new
 * phase would quietly push goals-per-match higher until the season-authentic
 * calibration — the whole reason the engine takes a target at all — is fiction.
 */

/** Penalties per match. The Premier League runs ~0.25-0.30. */
export const PENALTY_PER_MATCH = 0.28;

/** Dangerous direct free kicks per match. */
export const FREE_KICK_PER_MATCH = 0.55;

/**
 * Branch weights. Real penalty conversion is ~76-79%, and a keeper who saves one
 * concedes the rebound often enough that it belongs in the tree rather than as a
 * footnote.
 */
const PENALTY_BRANCHES: [PenaltyOutcome, number][] = [
  ["scored-placed", 0.42],
  ["scored-top-corner", 0.28],
  ["scored-panenka", 0.04],
  ["saved-held", 0.08],
  ["saved-corner", 0.06],
  ["saved-rebound-goal", 0.03],
  ["wide", 0.05],
  ["post", 0.02],
  ["crossbar", 0.02],
];

const FREE_KICK_BRANCHES: [FreeKickOutcome, number][] = [
  ["wall", 0.38],
  ["wide", 0.34],
  ["saved", 0.21],
  ["scored", 0.07],
];

function pickBranch<T>(branches: [T, number][], r: number): T {
  let acc = 0;
  for (const [value, weight] of branches) {
    acc += weight;
    if (r < acc) return value;
  }
  return branches[branches.length - 1][0];
}

export const resolvePenalty = (r: number): PenaltyOutcome => pickBranch(PENALTY_BRANCHES, r);
export const resolveFreeKick = (r: number): FreeKickOutcome => pickBranch(FREE_KICK_BRANCHES, r);

/** Does this outcome put the ball in the net? */
export const penaltyScored = (o: PenaltyOutcome): boolean =>
  o.startsWith("scored") || o === "saved-rebound-goal";

/** Expected goals per match contributed by set pieces, at the rates above. */
export function setPieceGoalRate(): number {
  const penaltyConversion = PENALTY_BRANCHES.filter(([o]) => penaltyScored(o)).reduce(
    (sum, [, w]) => sum + w,
    0,
  );
  const freeKickConversion = FREE_KICK_BRANCHES.find(([o]) => o === "scored")?.[1] ?? 0;
  return PENALTY_PER_MATCH * penaltyConversion + FREE_KICK_PER_MATCH * freeKickConversion;
}

/**
 * The goals-per-match budget left for open play once set pieces have taken their share.
 *
 * Floored well above zero so an absurd target can never invert the open-play model.
 */
export function openPlayTarget(targetGoalsPerMatch: number): number {
  return Math.max(0.5, targetGoalsPerMatch - setPieceGoalRate());
}
