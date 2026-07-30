import "server-only";

import { getAvailableSeasons, loadStandings } from "@/data/loaders";

export interface SeasonChampion {
  season: number;
  champion: { id: number; name: string } | null;
}

/**
 * TASK-M71a — season → champion for the /seasons directory.
 * Read at build time only (the directory is prerendered), so the 34 standings
 * reads cost nothing at request time. `champion` is null-tolerant: a season
 * with missing standings still gets a card rather than throwing the build.
 */
export async function getSeasonChampions(): Promise<SeasonChampion[]> {
  const seasons = await getAvailableSeasons(); // newest-first
  return Promise.all(
    seasons.map(async (season) => {
      const standings = await loadStandings(season);
      const winner = standings?.find((r) => r.rank === 1);
      return {
        season,
        champion: winner ? { id: winner.teamId, name: winner.teamName } : null,
      };
    }),
  );
}
