import type { PlayerRole } from "@/data/schemas";
import { chaosDraft, type PoolCard } from "@/features/game/domain/chaos-draft";
import type { SeasonRun } from "@/features/game/domain/season";
import { buildSeasonTeams } from "@/features/game/view/season-league";
const ROLES: PlayerRole[] = [
  "GK",
  "GK",
  "RB",
  "CB",
  "CB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "CF",
  "CF",
  "CF",
];

/** Hoisted for the module mock above, exactly as `season-entry.test.tsx` does it. */
function poolFor(clubId: number): PoolCard[] {
  return ROLES.map((role, i) => ({
    cardId: `${clubId * 100 + i}@2020`,
    playerId: clubId * 100 + i,
    season: 2020,
    name: `C${clubId} Player${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    club: `Club ${clubId}`,
    teamId: clubId,
    ratings: {
      attack: 50 + ((clubId + i) % 9),
      creation: 50,
      defense: 50 + ((clubId + i) % 6),
      physical: 50,
      discipline: 50,
      overall: 60 + ((clubId * 3 + i) % 30),
    },
  }));
}

export function seasonSetup() {
  const leagueIds = [1, 2, 3, 4];
  const seed = 4242;
  const pools = Object.fromEntries(leagueIds.map((id) => [id, poolFor(id)]));
  const drafted = chaosDraft(pools[1]!, seed, "Club 1", { policy: "best" });
  const coachTeam = { ...drafted, teamId: 1, bench: [] };
  const props = {
    coachId: 1,
    coachName: "Club 1",
    seed,
    pools,
    clubNames: Object.fromEntries(leagueIds.map((id) => [id, `Club ${id}`])),
    leagueIds,
    squad: coachTeam.players as PoolCard[],
    formation: coachTeam.formation,
  };
  const teams = buildSeasonTeams({ ...props, coachTeam });
  const run: SeasonRun = { seed, clubs: 4, coach: 0, results: [] };
  return { props, teams, run };
}
