import type { Formation } from "./formation";
import type { GamePlayer } from "./player";

export interface GameTeam {
  teamId: number;
  name: string;
  season: number;
  formation: Formation;
  players: GamePlayer[];
}

export function makeGameTeam(
  teamId: number,
  name: string,
  season: number,
  formation: Formation,
  players: GamePlayer[],
): GameTeam {
  return { teamId, name, season, formation, players };
}
