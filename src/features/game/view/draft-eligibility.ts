import type { PlayerRole } from "@/data/schemas";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { canPlay } from "@/features/game/domain/eligibility";
import type { Formation } from "@/features/game/domain/formation";

/**
 * The two directions of the eligibility highlight.
 *
 * ⚠️ Neither falls back to "anyone free" when nothing fits. `chaosDraft` deliberately
 * does fall back, so a thin pool still produces an XI — but the coach must never be
 * OFFERED an illegal placement. The ban is hard, and an empty list is the right answer.
 */

/** Cards that may fill a slot of this role. */
export function eligibleCards(pool: readonly PoolCard[], role: PlayerRole): PoolCard[] {
  return pool.filter((c) => canPlay(c, role));
}

/** Slot indices this card may legally fill, in formation order. */
export function eligibleSlots(formation: Formation, card: PoolCard): number[] {
  const out: number[] = [];
  formation.slots.forEach((slot, i) => {
    if (canPlay(card, slot.role)) out.push(i);
  });
  return out;
}
