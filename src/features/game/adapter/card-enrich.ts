import "server-only";
import { loadPlayers } from "@/data/loaders";
import type { Player } from "@/data/schemas";
import type { CardBio, CardStats } from "@/features/game/domain/player-card";

// Build-time enrichment for the FUT-style card: the bio the game domain drops
// (photo/age/nationality) plus a cross-season CAREER-CLUB history and a few
// headline stats. Runs only under `loadChaosPool` (a force-static route).

const EARLIEST = 1992;
const LATEST = 2025;

let careerIdxCache: Map<number, string[]> | null = null;

/** playerId → distinct PL clubs across every season, in chronological order. */
export async function loadCareerIndex(): Promise<Map<number, string[]>> {
  if (careerIdxCache) return careerIdxCache;
  const map = new Map<number, string[]>();
  for (let season = EARLIEST; season <= LATEST; season++) {
    const players = await loadPlayers(season);
    if (!players) continue;
    for (const p of players) {
      const clubs = map.get(p.id) ?? [];
      if (p.teamName && !clubs.includes(p.teamName)) clubs.push(p.teamName);
      map.set(p.id, clubs);
    }
  }
  careerIdxCache = map;
  return map;
}

function statsOf(row: Player | undefined): CardStats {
  const m = row?.metrics;
  return {
    goals: m?.goals ?? null,
    assists: m?.assists ?? null,
    appearances: m?.appearances ?? null,
    cleanSheets: m?.cleanSheets ?? null,
    yellowCards: m?.yellowCards ?? null,
    redCards: m?.redCards ?? null,
  };
}

/** Assemble the card bio from a player's season row + the career index. */
export function cardBio(
  row: Player | undefined,
  playerId: number,
  season: number,
  career: Map<number, string[]>,
): CardBio {
  return {
    photo: row?.photo ?? null,
    age: row?.birthYear != null ? season - row.birthYear : null,
    nationality: row?.nationality ?? null,
    nationalityCode: row?.nationalityCode ?? null,
    careerClubs: career.get(playerId) ?? (row?.teamName ? [row.teamName] : []),
    stats: statsOf(row),
  };
}
