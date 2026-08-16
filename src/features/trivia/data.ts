import "server-only";

import {
  getAvailableSeasons,
  loadFixtures,
  loadFixtureExtras,
  loadGoalAttribution,
  loadLeaderboards,
  loadCaptains,
  loadLineups,
  loadManagerEnrichment,
  loadManagerHonoursHistory,
  loadManagers,
  loadPlayerPfaAwards,
  loadPlayers,
  loadSeasonEvents,
  loadSearchIndex,
  loadStandings,
} from "@/data/loaders";
import { getEntityNames } from "@/features/i18n/entity-names";

import { generateTrivia } from "./engine";
import { addArNames, buildNameMap, localizeFactNames } from "./localize-names";
import type { TriviaData, TriviaFact, TriviaScope } from "./types";

/**
 * Loader-backed `TriviaData` for production. The engine + rules stay pure (and
 * unit-testable with synthetic fixtures); THIS module is the server-only seam
 * that wires them to the committed JSON via `src/data/loaders.ts`.
 */
function triviaData(season: number): TriviaData {
  return {
    season,
    standings: (s = season) => loadStandings(s),
    players: (s = season) => loadPlayers(s),
    fixtures: (s = season) => loadFixtures(s),
    leaderboards: (s = season) => loadLeaderboards(s),
    seasons: () => getAvailableSeasons(),
    goalAttribution: () => loadGoalAttribution(),
    managers: () => loadManagers(),
    fixtureExtras: (s = season) => loadFixtureExtras(s),
    // TASK-M82 — see the warning on : everything here is small enough for
    // a request-time read. The 5-8 MB player detail maps deliberately stay out.
    events: (s = season) => loadSeasonEvents(s),
    lineups: (s = season) => loadLineups(s),
    managerEnrichment: () => loadManagerEnrichment(),
    managerHonours: () => loadManagerHonoursHistory(),
    captains: () => loadCaptains(),
    pfaAwards: () => loadPlayerPfaAwards(),
  };
}

/** Provable trivia facts for a scope + season (server-only entry point). */
export async function getTrivia(
  scope: TriviaScope,
  season: number,
  id?: number,
): Promise<TriviaFact[]> {
  const facts = await generateTrivia(triviaData(season), { scope, id });
  // TASK-1606 follow-up: on `/ar`, swap the entity-name string values baked into
  // each fact (club / player / manager / venue) to Arabic — the numbers already
  // localize in `<TriviaCard>`. `/en` returns unchanged.
  const names = await getEntityNames();
  if (!names.isAr) return facts;
  const [index, standings, fixtures] = await Promise.all([
    loadSearchIndex(),
    loadStandings(season),
    loadFixtures(season),
  ]);
  const map = index ? buildNameMap(index) : new Map<string, string>();
  // The search index carries only CANONICAL team names; fixture-derived facts
  // (biggest win, attendance…) use SHORT team names ("Man United", "Leeds") +
  // VENUE names ("Old Trafford") that the index lacks. Resolve those by id from
  // the season's standings + fixtures via the ar teams/venues maps.
  addArNames(map, [
    ...(standings ?? []).map((s) => [s.teamName, names.team(s.teamId, s.teamName)] as const),
    ...(fixtures ?? []).flatMap(
      (f) =>
        [
          [f.homeTeamName, names.team(f.homeTeamId, f.homeTeamName)],
          [f.awayTeamName, names.team(f.awayTeamId, f.awayTeamName)],
          [f.venue, names.venue(f.homeTeamId, f.venue)],
        ] as const,
    ),
  ]);
  return localizeFactNames(facts, map);
}
