import anchors from "../data/player-anchors.json";

/**
 * TASK-1821 Layer 2 — the bounded season delta.
 *
 * Layer 1 gives a player-season a HERITAGE ANCHOR (curated tier, decayed by age and
 * minutes). This layer lets that season's statistics move them a little around it.
 *
 * WHY THE DELTA IS RELATIVE, NOT A DIFFERENCE. The design reads "statistics shift a
 * player within ±6 of their anchor", and the literal implementation of that is
 * `clamp(modelOverall - anchor, ±6)`. Measured over all 1,603 anchored seasons that
 * raw gap has median -10, mean -11.1, and 67% of seasons fall outside ±6 — so two
 * thirds of anchored players would pin to exactly `anchor - 6` and the delta would
 * discriminate nothing. The statistical overall and the anchor are simply on
 * different scales; subtracting one from the other is not a signal.
 *
 * So the delta asks a relative question instead: where does this season rank among
 * the player's own ROLE in the SAME SEASON? That is within-role normalisation, which
 * is what PR #99 attempted and #100 reverted — the difference is that here it is
 * bounded to ±6 by construction instead of being an unbounded amplifier off a
 * per-role spread. #99 could move a player thirty points; the worst this can do is
 * six. Ranking inside the role-season also normalises the ERA for free, which
 * matters because the pre-2003 sparse pipeline runs several points hot.
 */

const ANCHORS = anchors as Record<string, number>;

/** The window, in card points, either side of the anchor. Bounded BY CONSTRUCTION. */
export const MAX_DELTA = 6;

/**
 * Minutes at which a season earns the full ±6. Below it the delta shrinks linearly
 * toward zero, so a rotation player topping their cohort on per-90 rates cannot claim
 * a full-season verdict — Benayoun '08 (1,890') out-ranked Rooney on rates alone.
 */
export const FULL_DELTA_MINUTES = 1500;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Where a season sits in its role-season cohort (0 worst, 1 best) → a delta in ±6,
 * shrunk toward zero below the minutes floor.
 *
 * Shrinkage is symmetric: a cameo is pulled back toward its anchor from BOTH sides.
 * Punishing a legend's 400-minute farewell down to anchor-6 would be the same
 * small-sample error as promoting a rotation striker to anchor+6.
 */
export function seasonDelta(percentile: number, minutes: number): number {
  const centered = 2 * clamp01(percentile) - 1;
  const credit = clamp01(minutes / FULL_DELTA_MINUTES);
  return MAX_DELTA * centered * credit;
}

/** Anchor + delta, rounded to a card number and clamped to the 0-100 scale. */
export function applyAnchor(anchor: number, delta: number): number {
  return Math.max(0, Math.min(100, Math.round(anchor + delta)));
}

/** The curated heritage anchor for one player-season, or null if un-anchored. */
export function anchorOf(playerId: number, season: number): number | null {
  return ANCHORS[`${playerId}@${season}`] ?? null;
}
