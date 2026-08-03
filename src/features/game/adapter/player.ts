import "server-only";
import { loadPlayer } from "@/data/loaders";
import type { Player } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { GamePlayer } from "@/features/game/domain/player";

/** Pure mapping: a committed player row + its season → a player-season card. */
export function toGamePlayer(player: Player, season: number): GamePlayer {
  return {
    cardId: makeCardId(player.id, season),
    playerId: player.id,
    season,
    name: player.name,
    role: player.role ?? null,
    altRoles: player.altRoles ?? [],
    foot: player.foot ?? null,
    height: player.height ?? null,
    ratings: null,
    provenance: null,
  };
}

/** Server-only: load one player-season card, or null if absent. */
export async function loadGamePlayer(
  playerId: number,
  season: number,
): Promise<GamePlayer | null> {
  const player = await loadPlayer(playerId, season);
  return player ? toGamePlayer(player, season) : null;
}
