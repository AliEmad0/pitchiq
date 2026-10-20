import type { Modifier, Side } from "./match-types";

/**
 * TASK-1816 — the What-If boost (owner: "1 in 4" rescues, a boost allowed to get there).
 *
 * MEASURED, not guessed: with no boost, every listed rescue succeeds 0–3% of the time over
 * 300 runs. That is honest football and an unplayable mode. Two levers, because one alone
 * cannot reach the target:
 *
 * 1. **Tempo** — the engine fixes a match's TOTAL chances (`calibrateK`) and weights only
 *    split them, so the remaining 45–65 minutes rarely hold three net goals however the
 *    split falls. `WHAT_IF_TEMPO` multiplies the match's goal rate.
 * 2. **The lift** — the trailing side's attack rises and the leader's falls by the same
 *    amount, per goal of deficit, scaled by how little time is left. ⚠️ Lifting only the
 *    trailing side stalls near a two-thirds share of chances: `rawEdge` saturates at 1 for
 *    the trailer while the leader's edge stays ~0.5. The leader easing off is also the
 *    football: a side three up sits back.
 *
 * Fitted on the shipped list to a mean of ~26% (16–44% per scenario, after the review fixes);
 * the test re-measures.
 * ⛔ One rule for every scenario, passed through `MatchSetup.modifiers` — never added to
 * `BASELINE_MODIFIERS`, so no other mode moves.
 */
export const WHAT_IF_TEMPO = 2;
export const WHAT_IF_BOOST = 21;

export function whatIfBoost(trailing: Side, startMinute: number): Modifier {
  const urgency = Math.sqrt(45 / Math.max(10, 90 - startMinute));
  const leader: Side = trailing === "home" ? "away" : "home";
  return ({ state, side }) => {
    const deficit = state[leader].score - state[trailing].score;
    if (deficit <= 0) return {};
    const lift = WHAT_IF_BOOST * deficit * urgency;
    return side === trailing ? { attack: lift } : { attack: -lift };
  };
}
