import type { MinuteContext, MinuteWeights } from "./match-types";

/**
 * How hard a chosen response tilts a side while its window is open.
 *
 * Deliberately small. The edge function `attack / (attack + oppDefense)` is insensitive
 * by design — a ten-point swing moves a side's share of play by only about 1.5pp — so
 * these are a real but modest tilt rather than a takeover. The outcome that matters
 * (comeback rate) is pinned by `game-match-harness.test.ts`; if that moves, these are
 * too strong.
 */
const OVERLOAD_ATTACK = 6;
const OVERLOAD_DEFENSE = -6;
const STABILIZE_ATTACK = -4;
const STABILIZE_DEFENSE = 6;

/**
 * The coach's response, expressed as a weight contribution rather than an engine branch.
 *
 * This is the seam TASK-1803 locked and TASK-1805 already used for tactical counters:
 * pushing here means the interactive layer adds no branches to the minute loop at all.
 *
 * ⚠️ Returns `{}` for `hold` (the default, and what `defaultAnswer` always answers), so
 * `simulate()` is byte-identical to before the engine became interruptible. If a
 * determinism snapshot ever moves after touching this file, this is the first thing to
 * check.
 */
export function responseModifier(ctx: MinuteContext): Partial<MinuteWeights> {
  const s = ctx.state[ctx.side];
  if (ctx.state.minute > s.respondingUntil) return {};
  if (s.responseChoice === "overload") {
    return { attack: OVERLOAD_ATTACK, defense: OVERLOAD_DEFENSE };
  }
  if (s.responseChoice === "stabilize") {
    return { attack: STABILIZE_ATTACK, defense: STABILIZE_DEFENSE };
  }
  return {};
}
