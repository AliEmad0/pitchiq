import "server-only";

import { isArchivedPlayer } from "@/data/archive";
import { getAvailableSeasons, loadMarketValueHistory, loadPlayers } from "@/data/loaders";
import { getPlayerProfile } from "@/features/players/api";
import type { PlayerArchive } from "@/features/players/archive-types";
import { getPlayerCareerRecord } from "@/features/players/career-record.api";
import { buildMarketValueStrip } from "@/features/players/market-value";
import { getTrivia } from "@/features/trivia/data";

export interface PlayerSeasons {
  /** Seasons he has a row in, newest first. */
  seasons: number[];
  /** His name on the newest of those rows — what the prerendered page shows. */
  name: string;
}

/** Memoised as a VALUE: build-time data, and a cached promise would pin a render's context. */
let indexValue: Map<number, PlayerSeasons> | null = null;
let indexInflight: Promise<Map<number, PlayerSeasons>> | null = null;

/**
 * Every player id → the seasons he has a row in (newest first) and his latest name.
 *
 * ⭐ The single enumeration both halves of the player split read (TASK-M96 PR B): the
 * `/players/[id]` page prerenders the ids for which `isArchivedPlayer` is false, the archive
 * route the ids for which it is true — so every player is covered exactly once.
 */
export async function playerSeasonIndex(): Promise<Map<number, PlayerSeasons>> {
  if (indexValue) return indexValue;
  indexInflight ??= (async () => {
    const index = new Map<number, PlayerSeasons>();
    for (const season of await getAvailableSeasons()) {
      for (const p of (await loadPlayers(season)) ?? []) {
        const known = index.get(p.id);
        if (known) known.seasons.push(season);
        else index.set(p.id, { seasons: [season], name: p.name });
      }
    }
    indexValue = index;
    indexInflight = null;
    return index;
  })();
  return indexInflight;
}

/**
 * Build one archived player's JSON (see `PlayerArchive`).
 *
 * BUILD TIME ONLY — called from a `force-static` route with a closed param set. It reads the
 * large career files, which is fine at prerender and forbidden on any request-time path
 * (CLAUDE.md, TASK-M82/M92). Measured: ~11 KB per player and ~7 s of build CPU for all 4,578.
 */
export async function buildPlayerArchive(id: number): Promise<PlayerArchive | null> {
  const entry = (await playerSeasonIndex()).get(id);
  if (entry == null || !isArchivedPlayer(entry.seasons)) return null;
  const { seasons, name } = entry;

  const bySeason: PlayerArchive["bySeason"] = {};
  for (const season of seasons) {
    const [profile, facts] = await Promise.all([
      getPlayerProfile(id, season, "en"),
      getTrivia("player", season, id),
    ]);
    bySeason[String(season)] = { profile, facts };
  }

  const [career, history] = await Promise.all([
    getPlayerCareerRecord(id),
    loadMarketValueHistory(),
  ]);
  const points = history?.[String(id)];
  const strip = points && points.length > 0 ? buildMarketValueStrip(points, seasons) : [];

  return {
    id,
    name,
    seasons,
    initialSeason: seasons[0]!,
    bySeason,
    career,
    marketValue: strip.length > 0 ? strip : null,
  };
}
