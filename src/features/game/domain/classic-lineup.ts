import { canPlay } from "./eligibility";
import type { Formation } from "./formation";
import type { GamePlayer } from "./player";

/** Deterministic legal assignment, with reassignment for versatile players.
 * A greedy pick can spend the only eligible fullback on a CB slot. Never fill a
 * missing role with an ineligible player just to make an XI appear complete.
 */
export function classicLineup(
  pool: readonly GamePlayer[],
  formation: Formation,
  preferred: readonly string[] = [],
): GamePlayer[] | null {
  if (formation.slots.length !== 11) return null;
  const ranked = pool
    .filter((p) => p.ratings != null)
    .slice()
    .sort((a, b) => b.ratings!.overall - a.ratings!.overall || a.playerId - b.playerId);
  const seen = new Set<number>();
  const unique = ranked.filter((p) => {
    if (seen.has(p.playerId)) return false;
    seen.add(p.playerId);
    return true;
  });
  const candidates = formation.slots.map((s, i) =>
    unique
      .filter((p) => canPlay(p, s.role))
      .sort((a, b) => Number(b.cardId === preferred[i]) - Number(a.cardId === preferred[i])),
  );
  const assigned = new Map<number, number>();
  const picks: GamePlayer[] = [];
  const place = (slot: number, visited: Set<number>): boolean => {
    for (const player of candidates[slot]) {
      if (visited.has(player.playerId)) continue;
      visited.add(player.playerId);
      const old = assigned.get(player.playerId);
      if (old == null || place(old, visited)) {
        assigned.set(player.playerId, slot);
        picks[slot] = player;
        return true;
      }
    }
    return false;
  };
  const order = formation.slots
    .map((_, i) => i)
    .sort((a, b) => candidates[a].length - candidates[b].length || a - b);
  return order.every((slot) => place(slot, new Set())) ? picks : null;
}
