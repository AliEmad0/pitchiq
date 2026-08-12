import type { PoolCard } from "./chaos-draft";
import { canPlay } from "./eligibility";
import type { Formation } from "./formation";
import { mulberry32 } from "./rng";

/** Candidates offered per slot. */
export const HAND_SIZE = 5;

/**
 * Eleven hands of five, one per formation slot.
 *
 * ⚠️ PRECOMPUTED, IN SLOT ORDER, against one shared used-set. Two properties fall out,
 * and both are load-bearing:
 *
 * 1. No player can appear in two hands, so a duplicate pick is impossible by construction.
 * 2. The ORDER THE COACH VISITS SLOTS cannot change what any slot offers. Dealt lazily as
 *    slots were opened, a hand would depend on which slots had already been visited — and
 *    a room would stop replaying from `(seed)` alone, breaking the shareable-room
 *    requirement inherited from TASK-1812.
 *
 * ⚠️ A hand is SHORT rather than padded when a role cannot supply five eligible cards.
 * Padding with ineligible cards is the one way an illegal candidate could be offered, and
 * this path has no validation behind it — the hard ban here is enforced by construction.
 *
 * ⚠️ The rng is drawn PER PICK, in slot order. Shuffling each bag independently, or
 * drawing all the indices up front, changes the draw sequence — and every room ever
 * shared by seed would then deal differently.
 */
export function roomDeals(
  pool: readonly PoolCard[],
  formation: Formation,
  seed: number,
): PoolCard[][] {
  const rng = mulberry32(seed);
  const used = new Set<string>();

  return formation.slots.map((slot) => {
    const bag = pool.filter((c) => !used.has(c.cardId) && canPlay(c, slot.role));
    const hand: PoolCard[] = [];
    while (hand.length < HAND_SIZE && bag.length > 0) {
      const [card] = bag.splice(Math.floor(rng() * bag.length), 1);
      hand.push(card);
      used.add(card.cardId);
    }
    return hand;
  });
}
