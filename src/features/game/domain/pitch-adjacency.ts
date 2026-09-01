import type { Formation } from "./formation";

/**
 * TASK-1810 PR 5 — which formation slots are NEIGHBOURS on the pitch.
 *
 * ⭐ This is what stops the Chemistry Draft being a set-cover puzzle. Chemistry counts links
 * only between adjacent slots, so WHERE a card is placed decides whether its links pay — the
 * mode becomes spatial rather than a list-matching exercise.
 *
 * ⭐ And it costs nothing to do so: measured 2026-08-28, a coach steering for links still
 * moves **5.8 → 18.9 (×3.23)** under adjacent-only scoring, against ×3.24 counting all 55
 * pairs. Making placement matter is free.
 *
 * ⚠️ Pure geometry over a `Formation`. It knows nothing about cards, players or chemistry,
 * which is what lets the score and the UI share one definition instead of drifting apart —
 * and what makes it exhaustively testable against all 20 shapes.
 */

/**
 * How far apart two slots on NEIGHBOURING lines may sit horizontally and still link, as a
 * fraction of the pitch's width.
 *
 * ⛔ FROZEN, and measured rather than chosen (spec §0.4). The sweep across all 20 shapes:
 *
 * ```
 *   band 0.20 → 14–21 pairs (mean 18.3), GK links 1.9
 *   band 0.26 → 14–25 pairs (mean 20.4), GK links 2.4   ← chosen
 *   band 0.34 → 19–30 pairs (mean 25.1), GK links 3.8
 * ```
 *
 * 0.26 yields ~37% of all pairs with no shape starved (min 14), and — the reason it is the
 * right number rather than merely a middling one — the keeper links to his centre-backs and
 * nobody else, which falls out of the geometry instead of being special-cased.
 *
 * ⛔ Changing it changes every chemistry score ever computed or shared, the same way a
 * `market-index.ts` factor would. A guard test pins the value.
 */
export const ADJACENCY_BAND = 0.26;

/**
 * A slot's horizontal position across the pitch, 0..1.
 *
 * ⛔ NORMALISED, and it has to be: `col` is an index WITHIN its own line, and lines have
 * different widths. A back four's col 2 and a midfield three's col 2 are not the same place,
 * so comparing raw `col` across rows would link a centre-back to a winger. This is the same
 * normalisation `PitchDraft` uses to position the spots, so the graph matches what the coach
 * actually sees.
 */
function xOf(formation: Formation, index: number): number {
  const slot = formation.slots[index]!;
  const inRow = formation.slots.filter((s) => s.row === slot.row).length;
  return slot.col / (inRow + 1);
}

/**
 * ⚠️ Memoised per formation OBJECT. `FORMATIONS` holds twenty frozen literals resolved by
 * name, so identity is stable, and this runs on every render of a draft pitch.
 */
const cache = new WeakMap<Formation, Array<[number, number]>>();

/**
 * Every pair of adjacent slot indices, low index first.
 *
 * Two slots are adjacent when they are:
 *  - on the SAME line and horizontally next to each other (`|col diff| === 1`) — CB–CB,
 *    CM–CM; or
 *  - on NEIGHBOURING lines and within `ADJACENCY_BAND` horizontally — CB–CM, LB–LM.
 *
 * Lines two or more apart never link: a keeper has no chemistry with a striker.
 */
export function adjacentPairs(formation: Formation): Array<[number, number]> {
  const hit = cache.get(formation);
  if (hit != null) return hit;

  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < formation.slots.length; i++) {
    for (let j = i + 1; j < formation.slots.length; j++) {
      const a = formation.slots[i]!;
      const b = formation.slots[j]!;
      const rows = Math.abs(a.row - b.row);
      if (rows > 1) continue;
      if (rows === 0) {
        if (Math.abs(a.col - b.col) === 1) pairs.push([i, j]);
      } else if (Math.abs(xOf(formation, i) - xOf(formation, j)) <= ADJACENCY_BAND) {
        pairs.push([i, j]);
      }
    }
  }

  cache.set(formation, pairs);
  return pairs;
}
