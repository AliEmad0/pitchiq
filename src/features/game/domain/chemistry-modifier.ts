import type { Modifier } from "./match-types";

/**
 * TASK-1810 PR 5 — chemistry, as something the match can feel.
 *
 * ⭐ THE CONSTANT IS FITTED BY OUTCOME, not by taste. A chemistry XI and a rating XI must win
 * about equally often, with the tilt toward the coach who played the mode as intended:
 *
 *  - **too small** and chemistry is a TRAP — the mode invites him to draft for links, charges
 *    him ~6 rating points for it, and gives nothing back;
 *  - **too large** and it dominates — quality stops mattering and every coach drafts the same
 *    way, which loses the trade-off from the other side.
 *
 * ⛔ RE-FITTED 2026-09-01 for TASK-1844. The engine's response to a rating gap is now a fitted
 * constant (`POWER_EXPONENT`), and this constant is fitted AGAINST the engine — so it had to
 * move with it. Measured over **12,000** seeded matches per constant, each pairing played BOTH
 * WAYS (see below), chem XI against rating XI:
 *
 * ```
 *   effect 0     chem 37.8%   rating 37.5%   +0.3   <- chemistry buys nothing: the trap
 *   effect 0.02  chem 37.9%   rating 37.2%   +0.7   <- inside the noise floor
 *   effect 0.03  chem 38.6%   rating 36.7%   +1.9   <- CHOSEN
 *   effect 0.04  chem 39.6%   rating 36.2%   +3.4
 *   effect 0.06  chem 40.4%   rating 34.2%   +6.2   <- chemistry starts to dominate
 * ```
 *
 * 0.03 is the SMALLEST constant whose reward is clearly distinguishable from zero (the standard
 * error on the difference is ~0.6 points at this sample size), which is what "rewarded for
 * playing the mode as intended, never decisive" means in numbers.
 *
 * ⛔ TWO MEASUREMENT ERRORS THE RE-FIT CAUGHT, both worth carrying:
 *
 * 1. **The first harness played the chemistry XI at HOME in all 3,000 matches.** A one-sided
 *    fixture cannot separate the mode's effect from home advantage. Playing each pairing both
 *    ways moved the effect-0 result from +4.9 to +0.3.
 * 2. ⭐ **"Chemistry costs ~6.8 rating points per player" is measured in the WRONG UNITS.** That
 *    is a mean-OVERALL figure, and the engine reads role-weighted attack and defence. Measured
 *    there, the chem XI is only 1.9 behind on attack and 1.5 AHEAD on defence — so steering for
 *    links is very nearly free in the terms that decide matches, and the old reasoning about
 *    "repaying a 6-point cost" was answering a question the engine never asked.
 *
 * ⚠️ Any future re-fit needs THOUSANDS of matches. An early sweep at 240 looked "saturated", and
 * even at 3,000 the effect-0 result was off by two points of win rate.
 *
 * <details><summary>The superseded 2026-08-28 fit, kept for the trail</summary>
 *
 * Fitted when `goalChance` derived its edge as `attack / (attack + oppDefense)` — a bounded
 * ratio deliberately insensitive to power — which made a rating point worth almost nothing and
 * so let a much larger constant look balanced:
 *
 * ```
 *   effect 0     chem 36.6%   rating 37.4%
 *   effect 0.08  chem 37.8%   rating 36.8%   <- chosen then
 *   effect 0.4   chem 40.9%   rating 34.3%
 * ```
 *
 * </details>
 */

/**
 * How much of a side's attack and defence full chemistry is worth.
 *
 * ⛔ MEASURED (re-fitted 2026-09-01, TASK-1844) — 0.03 gives a steering coach a **+1.9 point**
 * win-rate edge: rewarded for playing the mode as intended, never decisive. Changing it changes
 * the outcome of every match ever played or shared in this mode.
 *
 * ⚠️ This constant is fitted AGAINST the engine, so it moves whenever `POWER_EXPONENT` does.
 */
export const CHEM_EFFECT = 0.03;

/**
 * A weight contributor scaled by each side's own chemistry.
 *
 * ⚠️ BOTH sides are passed, because one `Modifier` is applied to both: the engine calls it per
 * side, and a modifier that closed over a single score would silently hand the coach's
 * chemistry to his opponent as well.
 *
 * ⚠️ Scales the side's OWN power rather than adding a flat number, so the effect is
 * proportional — a well-drilled weak side gains what a well-drilled strong side gains, in
 * relative terms, instead of chemistry mattering more the worse your players are.
 *
 * ⚠️ Pure and deterministic: it reads only the side's power and a number fixed before kick-off,
 * so the seeded PRNG still decides every outcome and a match replays byte-for-byte.
 */
export function chemistryModifier(
  scores: { home: number; away: number },
  effect: number = CHEM_EFFECT,
): Modifier {
  return ({ state, side }) => {
    const chemistry = side === "home" ? scores.home : scores.away;
    const scale = (Math.max(0, Math.min(100, chemistry)) / 100) * effect;
    const power = state[side].power;
    return { attack: power.attack * scale, defense: power.defense * scale };
  };
}
