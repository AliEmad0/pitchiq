import "server-only";
import { loadStandings } from "@/data/loaders";
import type { Opponent, TacticalStyle } from "@/features/game/domain/opponent";
import { assembleGameTeam } from "./lineup";

/** A historical opponent from its real standings row (works for all 34 seasons). */
export async function loadRecordOpponent(
  teamId: number,
  season: number,
  style: TacticalStyle = "balanced",
): Promise<Opponent | null> {
  const standings = await loadStandings(season);
  const row = standings?.find((s) => s.teamId === teamId);
  if (!row) return null;
  return {
    kind: "record",
    style,
    record: {
      name: row.teamName,
      played: row.played,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      points: row.points,
      rank: row.rank,
    },
  };
}

/** A modern opponent as a fully-assembled rated XI. */
export async function loadSquadOpponent(
  teamId: number,
  season: number,
  style: TacticalStyle = "balanced",
): Promise<Opponent | null> {
  const team = await assembleGameTeam(teamId, season);
  return team ? { kind: "squad", team, style } : null;
}
