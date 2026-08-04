import "server-only";
import { loadStandings } from "@/data/loaders";
import { canPlay } from "@/features/game/domain/eligibility";
import type { Formation } from "@/features/game/domain/formation";
import type { GamePlayer } from "@/features/game/domain/player";
import { type GameTeam, makeGameTeam } from "@/features/game/domain/team";
import { loadFormationTemplates } from "./formation";
import { loadRatedSquad } from "./ratings";

const FALLBACK_442 = (season: number): Formation => ({
  name: "4-4-2",
  season,
  slots: [
    { row: 1, col: 1, role: "GK" },
    { row: 2, col: 1, role: "LB" },
    { row: 2, col: 2, role: "CB" },
    { row: 2, col: 3, role: "CB" },
    { row: 2, col: 4, role: "RB" },
    { row: 3, col: 1, role: "LM" },
    { row: 3, col: 2, role: "CM" },
    { row: 3, col: 3, role: "CM" },
    { row: 3, col: 4, role: "RM" },
    { row: 4, col: 1, role: "CF" },
    { row: 4, col: 2, role: "CF" },
  ],
});

function pickFormation(templates: Formation[], season: number): Formation {
  return templates.find((t) => t.slots.length === 11) ?? FALLBACK_442(season);
}

async function teamName(teamId: number, season: number): Promise<string> {
  const standings = await loadStandings(season);
  return standings?.find((s) => s.teamId === teamId)?.teamName ?? "";
}

/** A real XI: top-rated eligible player per formation slot, ordered to the slots. */
export async function assembleGameTeam(teamId: number, season: number): Promise<GameTeam | null> {
  const squad = await loadRatedSquad(teamId, season);
  if (!squad || squad.length < 11) return null;

  const formation = pickFormation((await loadFormationTemplates(season)) ?? [], season);
  const pool = [...squad].sort((a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0));
  const used = new Set<number>();
  const chosen: GamePlayer[] = [];

  for (const slot of formation.slots) {
    const pick =
      pool.find((p) => !used.has(p.playerId) && canPlay(p, slot.role)) ??
      pool.find((p) => !used.has(p.playerId));
    if (!pick) break;
    used.add(pick.playerId);
    chosen.push(pick);
  }
  if (chosen.length < formation.slots.length) return null;

  return makeGameTeam(teamId, await teamName(teamId, season), season, formation, chosen);
}
