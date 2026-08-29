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
 * ⛔ THE DESIGN PREMISE WAS WRONG, and measuring is what caught it. The spec reasoned that the
 * effect must be worth "~7 rating points per player" to repay what chemistry costs. It does
 * not: `goalChance` derives its edge as `attack / (attack + oppDefense)`, a BOUNDED RATIO that
 * is deliberately insensitive to power, so a 5.7-point average rating gap is worth well under
 * one win-rate point. Measured over ~3,000 seeded matches per constant, chem XI (chemistry
 * 73.4, rating 82.6) against rating XI (chemistry 32.9, rating 88.3):
 *
 * ```
 *   effect 0     chem 36.6%   rating 37.4%   draw 26.1%   <- chemistry buys nothing: the trap
 *   effect 0.08  chem 37.8%   rating 36.8%   draw 25.4%   <- chosen
 *   effect 0.2   chem 38.7%   rating 35.6%   draw 25.7%
 *   effect 0.4   chem 40.9%   rating 34.3%   draw 24.8%   <- chemistry starts to dominate
 * ```
 *
 * ⚠️ So the needed effect is SMALL, and an earlier sweep at 240 matches looked "saturated"
 * above 0.1 purely because 1–3 point differences are inside the noise at that sample size.
 * Any re-fit needs thousands of matches, not hundreds.
 */

/**
 * How much of a side's attack and defence full chemistry is worth.
 *
 * ⛔ MEASURED (2026-08-28) — 0.08 turns chemistry's ~6-point rating deficit into a ~1-point
 * win-rate advantage: rewarded for playing the mode as intended, never decisive. Changing it
 * changes the outcome of every match ever played or shared in this mode.
 */
export const CHEM_EFFECT = 0.08;

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
