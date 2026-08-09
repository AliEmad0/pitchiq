import type { Formation } from "./formation";
import type { GamePlayer } from "./player";

export interface GameTeam {
  teamId: number;
  name: string;
  season: number;
  formation: Formation;
  players: GamePlayer[];
  /**
   * Substitutes. Optional so every existing caller and fixture still type-checks — a
   * team without one simply cannot make substitutions, and TASK-1822 Phase 4 handles
   * that by leaving the side short rather than inventing a player.
   */
  bench?: GamePlayer[];
}

export function makeGameTeam(
  teamId: number,
  name: string,
  season: number,
  formation: Formation,
  players: GamePlayer[],
  bench: GamePlayer[] = [],
): GameTeam {
  return { teamId, name, season, formation, players, bench };
}
