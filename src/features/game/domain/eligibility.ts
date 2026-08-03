import type { PlayerRole } from "@/data/schemas";
import type { GamePlayer } from "./player";

/**
 * The sole eligibility rule (owner decision: hard ban, no penalty tier).
 * Mirrors canPlay in @/data/schemas but typed for the game card.
 */
export function canPlay(
  player: Pick<GamePlayer, "role" | "altRoles">,
  slot: PlayerRole,
): boolean {
  return player.role === slot || player.altRoles.includes(slot);
}
