import type { PlayerSeasonId } from "./card-id";
import type { PoolCard } from "./chaos-draft";

/**
 * TASK-1810 — the Budget Cap draft's running arithmetic.
 *
 * ⭐ The reserve is computed over the DEALT HANDS, never over the pool, and that one choice is
 * what makes a dead-end structurally impossible instead of something the UI has to check.
 * `roomDeals` deals all eleven hands up front, in slot order, against one shared used-set
 * (`onePerPlayer` already guarantees the hands are disjoint), so "the cheapest card in each
 * unfilled hand" is a fixed, DISTINCT, role-correct set from the moment the room exists. Two
 * properties follow inductively:
 *
 *   1. Picking at cost ≤ `ceiling` leaves `remaining` ≥ the sum of the other hands' minimums,
 *      so the invariant is preserved and the last slot is always affordable.
 *   2. The cheapest card in the OPEN hand is, by the same invariant, always at or below the
 *      ceiling — so no hand is ever entirely dead.
 *
 * ⭐ RE-DRAFTING A FILLED SLOT extends both properties rather than breaking them, and it took
 * an owner report to find that it had never been implemented (2026-08-26). When `open` names a
 * slot that already holds someone, that man's fee comes back off `spent` — he is being
 * replaced, so what he cost is money on the table for his replacement. Two things follow:
 *
 *   3. The invariant survives. Picking at cost ≤ `ceiling` leaves `remaining` ≥ the other
 *      hands' minimums by exactly the induction above, because the other slots are untouched.
 *   4. HIS OWN CARD is always affordable, so the hand is never dead. The state before the
 *      re-open was valid — `budget − spent(all) − reserve(other unfilled) ≥ 0` — and expanding
 *      `spent(all)` gives `cost(occupant) ≤ ceiling` directly. He was dealt from THIS hand,
 *      so the coach can always put the veil back the way he found it.
 *
 * ⛔ Without the refund, a full squad is a DEAD END: the ceiling is whatever change is left
 * over (£1.2m against a £120m cap in the shipped report), every card in the hand is dearer
 * than that, and `PitchDraft` had put up a round that could not be dismissed. There was no way
 * out of the page at all. A budget rule that makes a screen unusable is not a difficulty
 * setting — it is the mode's central guarantee failing in the one place nothing checked.
 *
 * ⛔ A pool-wide reserve (`slotsLeft × cheapestCard`) is the obvious form and it UNDER-reserves:
 * the cheapest card in the pool is no use when the unfilled slot is a goalkeeper and that card
 * is a winger. Reading the hands sidesteps role-awareness entirely, because a hand only ever
 * holds cards `canPlay` accepted for its own slot.
 *
 * ⛔ This is also why there is no `affordable` deal option. An earlier design added one so the
 * room would deal a buyable card per hand — but `roomDeals` deals every hand from ONE SEED
 * BEFORE THE DRAFT STARTS, and affordability depends on what has already been spent, which
 * does not exist yet. Do not re-add it: `domain/draft-room.ts` is untouched by this mode.
 *
 * ⚠️ Nothing here is stored. `RoomState` keeps only `picks`, and the whole view is recomputed
 * on every read — the same rule the daily challenge's streaks follow.
 *
 * ⛔ THE GUARANTEE HAS ONE PRECONDITION: the budget must be at least the cost of the cheapest
 * legal XI, i.e. the sum of every hand's cheapest card. Below that the ceiling is negative
 * from the first pick and EVERY card is disabled — correctly, because no legal XI exists.
 * Budget Cap clears it with room to spare (€37M floor against a €100M cap), and the pool's
 * 50+ eligible cards per slot are what keep the floor low. ⚠️ A THIN pool breaks it: with
 * `onePerPlayer`, a role a shape uses twice takes five cards for the first hand and leaves the
 * leftovers for the second, and `roomDeals` deals short rather than padding — so a one-card
 * hand holding an expensive card puts its whole price into the reserve.
 */
export interface BudgetView {
  /** Total cost of the picks made so far. */
  spent: number;
  /** Budget minus spend. NOT what the coach may spend on this pick — see `ceiling`. */
  remaining: number;
  /** Held back so every OTHER unfilled slot can still be filled. */
  reserve: number;
  /** The most this pick may cost. */
  ceiling: number;
}

/**
 * A card with no price is not free, it is unbuyable.
 *
 * ⚠️ The pool builder filters unpriced cards out, so this should be unreachable — but a silent
 * zero here would hand the coach a free superstar, which is the whole mode gone.
 */
const costOf = (card: PoolCard): number | null => card.price ?? null;

const cheapestIn = (hand: readonly PoolCard[]): number => {
  let min = Infinity;
  for (const card of hand) {
    const cost = costOf(card);
    if (cost != null && cost < min) min = cost;
  }
  return min === Infinity ? 0 : min;
};

/**
 * @param hands  One hand per slot, in slot order — exactly `roomDeals`' return value.
 * @param picks  One entry per slot, in slot order — `RoomState.picks`.
 * @param budget The pack's `budgetCap` amount, in tenths of a million (`1000` = £100.0m).
 * @param open   The slot being drafted. It contributes NOTHING to either figure — see the
 *               re-draft note above. Null once the room is full and no slot is on the veil.
 */
export function budgetView(
  hands: readonly (readonly PoolCard[])[],
  picks: readonly (PlayerSeasonId | null)[],
  budget: number,
  open: number | null,
): BudgetView {
  // ⚠️ Built across ALL hands rather than per-slot, so a slot filled before the draft began
  // (the `LockedPick` path) still resolves to a real cost instead of silently costing nothing.
  const byId = new Map<PlayerSeasonId, PoolCard>();
  for (const hand of hands) for (const card of hand) byId.set(card.cardId, card);

  let spent = 0;
  let reserve = 0;
  for (let i = 0; i < picks.length; i++) {
    // ⛔ THE OPEN SLOT CONTRIBUTES NOTHING — not its hand's minimum to the reserve, and not
    // its occupant's fee to the spend. Both halves are the same idea, and only the first of
    // them was ever implemented: the `picked != null` branch used to `continue` before this
    // line was reached, so a slot re-opened to swap someone out kept charging the coach for
    // the man he was replacing. See the re-draft note in this file's header.
    if (i === open) continue;
    const picked = picks[i];
    if (picked != null) {
      const card = byId.get(picked);
      if (card != null) spent += costOf(card) ?? 0;
      continue;
    }
    reserve += cheapestIn(hands[i] ?? []);
  }

  const remaining = budget - spent;
  return { spent, remaining, reserve, ceiling: remaining - reserve };
}

/** Can this card be bought right now? An unpriced card never can. */
export function canAfford(card: PoolCard, view: BudgetView): boolean {
  const cost = costOf(card);
  return cost != null && cost <= view.ceiling;
}

/** How far over the ceiling this card is, or 0 when it is affordable. */
export function shortfall(card: PoolCard, view: BudgetView): number {
  const cost = costOf(card);
  if (cost == null) return 0;
  return Math.max(0, cost - view.ceiling);
}

// ⚠️ Display formatting lives in `domain/price-band.ts#priceLabel` — one place decides how a
// game price reads, so the card badge and the meter beside it can never disagree.
