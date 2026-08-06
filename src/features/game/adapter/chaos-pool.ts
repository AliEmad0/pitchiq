import "server-only";
import { loadPlayers, loadStandings } from "@/data/loaders";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { cardBio, loadCareerIndex } from "./card-enrich";
import { loadRatedSquad } from "./ratings";

// The Chaos Draft card pool, assembled at BUILD TIME (the /game/chaos route is
// force-static). A curated spread of seasons across the three provenance eras;
// each season contributes its top teams' best rated cards, enriched with bio +
// career history for the FUT-style card. Bounded so the static payload stays
// modest while giving effectively-infinite re-rolls.
const SEASONS = [1996, 2004, 2008, 2012, 2019, 2023];
const TEAMS_PER_SEASON = 3;
const CARDS_PER_TEAM = 14;

export async function loadChaosPool(): Promise<EnrichedCard[]> {
  const career = await loadCareerIndex();
  const pool: EnrichedCard[] = [];
  for (const season of SEASONS) {
    const [standings, players] = await Promise.all([loadStandings(season), loadPlayers(season)]);
    if (!standings || standings.length === 0) continue;
    const byId = new Map((players ?? []).map((p) => [p.id, p]));
    const top = [...standings].sort((a, b) => a.rank - b.rank).slice(0, TEAMS_PER_SEASON);
    for (const row of top) {
      const squad = await loadRatedSquad(row.teamId, season);
      if (!squad) continue;
      const cards = squad
        .filter((p) => p.ratings != null)
        .sort((a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0))
        .slice(0, CARDS_PER_TEAM)
        .map(
          (p): EnrichedCard => ({
            ...p,
            club: row.teamName,
            ...cardBio(byId.get(p.playerId), p.playerId, season, career),
          }),
        );
      pool.push(...cards);
    }
  }
  return pool;
}
