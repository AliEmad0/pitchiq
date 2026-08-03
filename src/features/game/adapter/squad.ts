import "server-only";
import { loadPlayers } from "@/data/loaders";
import type { GamePlayer } from "@/features/game/domain/player";
import { toGamePlayer } from "./player";

/**
 * A team's player-season cards for one season.
 * null → unsupported season / malformed file; [] → season loaded, no matching team.
 */
export async function loadGameSquad(
  teamId: number,
  season: number,
): Promise<GamePlayer[] | null> {
  const players = await loadPlayers(season);
  if (players === null) return null;
  return players
    .filter((p) => p.teamId === teamId)
    .map((p) => toGamePlayer(p, season));
}
