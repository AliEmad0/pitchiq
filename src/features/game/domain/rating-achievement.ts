import type { PlayerRole } from "@/data/schemas";

/**
 * TASK-1821 Layer 3 — team achievement, and the role amplifier for un-anchored players.
 *
 * Layer 1 gives a heritage anchor, Layer 2 moves a player ±6 within it on that season's
 * statistics. This layer adds the last thing a rating should know: what the team
 * actually won, and a correction for the roles the league-wide dimensions structurally
 * under-rate.
 */

/** The hard top of the rating scale. Nothing this model produces may exceed it. */
export const SCALE_CEILING = 95;

/** Largest achievement boost any player can receive (champions, a full season). */
export const MAX_BOOST = 4;

const FULL_SEASON_MINUTES = 3420;

/**
 * Team achievement, from the committed standings.
 *
 * Minutes-weighted, and that is not decoration. Layer 1 shipped a flat silverware term
 * and it put squad players from dynasty clubs (Aké, Ederson, Jesus, Milner) above
 * Shearer and Henry — a title says as much about the club as the player, so a fringe
 * champion earns a fraction of a regular's credit.
 */
export function achievementBoost(rank: number | null, minutes: number): number {
  if (rank == null) return 0;
  const base = rank === 1 ? MAX_BOOST : rank === 2 ? 3 : rank <= 4 ? 1.5 : 0;
  const share = Math.max(0, Math.min(1, minutes / FULL_SEASON_MINUTES));
  return base * share;
}

/**
 * Per-role correction for UN-ANCHORED players, hard-clamped to 0.8–1.2.
 *
 * Derived from the median `overall` of each role's un-anchored population **pooled
 * across all 34 seasons**, against the median role median. Pooling across seasons is
 * mandatory: PR #99 computed its per-role spread within a single season, where LM
 * fielded 8 players, and a statistic over 8 players cannot carry a scale.
 *
 * The clamp is the floor whose absence caused the #100 revert — there, amplification
 * ran to 5.0×. `tests/unit/game-rating-harness.test.ts` re-derives these factors from
 * live data and fails if the committed table drifts, so a data refresh that moves the
 * league cannot leave this silently stale.
 */
export const ROLE_AMPLIFIERS: Record<PlayerRole, number> = {
  GK: 1.2,
  LB: 1.1,
  CM: 1.078,
  RB: 1.078,
  CDM: 1.078,
  LM: 1.0,
  RM: 1.0,
  CB: 0.965,
  CAM: 0.887,
  RW: 0.873,
  LW: 0.859,
  SS: 0.809,
  CF: 0.809,
};

/**
 * Apply the role correction by scaling the player's DISTANCE BELOW the ceiling.
 *
 * ⚠️ NEVER multiply the rating itself. `overall * 1.2` corrects a role's median but
 * inflates its top, because the top of the role is multiplied too — measured, that put
 * Steve Staunton, Nigel Winterburn, Ian Harte and Hugo Lloris on exactly 100. Scaling
 * the gap to the ceiling lifts the cohort without the ceiling ever being reached, and
 * stays monotonic so nobody is reordered inside their role.
 */
export function amplifyUnanchored(overall: number, role: PlayerRole | null): number {
  const factor = role == null ? 1 : ROLE_AMPLIFIERS[role];
  const lifted = SCALE_CEILING - (SCALE_CEILING - overall) / factor;
  return Math.max(0, Math.min(SCALE_CEILING, lifted));
}
