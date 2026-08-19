import type { PlayerSeasonId } from "./card-id";
import type { PoolCard } from "./chaos-draft";
import { canPlay } from "./eligibility";
import type { Formation } from "./formation";

/**
 * Fill the empty slots of a formation with eligible cards, seeded.
 *
 * Extracted from `chaosDraft` so the draft hub's Auto-fill reuses the exact same
 * selection rules. Two things it does that a whole-XI draft cannot:
 *
 *   - it PRESERVES anything already placed, because Auto-fill is a helper and not a
 *     re-roll — quietly replacing the coach's picks would discard his work;
 *   - it takes the formation as an argument rather than choosing one at random.
 *
 * ⚠️ Takes an `rng` FUNCTION, not a seed. `chaosDraft` threads one `mulberry32` stream
 * through the formation pick, the XI and the bench; handing this a seed would start a
 * second stream and change every draft `/game/chaos` has ever produced.
 */
export function fillGaps(
  pool: PoolCard[],
  formation: Formation,
  slots: readonly (PlayerSeasonId | null)[],
  rng: () => number,
  /**
   * playerIds this draft may not touch, on top of whatever is already placed.
   *
   * ⚠️ Omitting it draws exactly as before — the shipped Auto-fill and `/game/chaos` both
   * pass nothing, so their streams are untouched. It exists for a second squad drafted
   * from the same pool, which must not field a man already in the first.
   */
  reserved?: ReadonlySet<number>,
): (PlayerSeasonId | null)[] {
  const out = [...slots];
  // Keyed by playerId, not cardId: the same player in two seasons is two cards but
  // still one man, and he cannot turn out twice in the same XI.
  const used = new Set<number>(reserved ?? []);
  for (const id of out) {
    if (id == null) continue;
    const card = pool.find((c) => c.cardId === id);
    if (card != null) used.add(card.playerId);
  }

  formation.slots.forEach((slot, i) => {
    if (out[i] != null) return;
    const eligible = pool.filter((c) => !used.has(c.playerId) && canPlay(c, slot.role));
    const anyFree = pool.filter((c) => !used.has(c.playerId));
    const from = eligible.length ? eligible : anyFree;
    if (from.length === 0) return;
    const card = from[Math.floor(rng() * from.length)];
    used.add(card.playerId);
    out[i] = card.cardId;
  });

  return out;
}
