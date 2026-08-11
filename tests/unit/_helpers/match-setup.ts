import type { PlayerRole } from "@/data/schemas";
import type { MatchSetup } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import type { PlayerRatings } from "@/features/game/domain/ratings";
import { makeGameTeam } from "@/features/game/domain/team";

/**
 * A plain, evenly-matched fixture for engine tests that care about the LOOP rather than
 * about ratings. Both sides carry a full bench, because anything exercising
 * substitutions needs one.
 */

const RATINGS: PlayerRatings = {
  attack: 50,
  creation: 50,
  defense: 50,
  physical: 50,
  discipline: 50,
  overall: 50,
};

const XI: PlayerRole[] = ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CAM", "RW", "LW", "CF"];
const BENCH: PlayerRole[] = ["GK", "CB", "CM", "CF", "RW"];

function squad(prefix: string, offset: number, roles: PlayerRole[]): GamePlayer[] {
  return roles.map((role, i) => ({
    cardId: `${offset + i}@2020`,
    playerId: offset + i,
    season: 2020,
    name: `${prefix}${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: RATINGS,
  }));
}

const SHAPE = { name: "", season: 2020, slots: [] };

export const matchSetup = (seed: number): MatchSetup => ({
  home: makeGameTeam(1, "H", 2020, SHAPE, squad("H", 100, XI), squad("HB", 200, BENCH)),
  away: makeGameTeam(2, "A", 2020, SHAPE, squad("A", 300, XI), squad("AB", 400, BENCH)),
  seed,
  targetGoalsPerMatch: 2.7,
});
