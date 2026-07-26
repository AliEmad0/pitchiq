import "server-only";

import { getEntityNames, IDENTITY_NAMES, type EntityNames } from "@/features/i18n/entity-names";

import {
  loadPlayer,
  loadPlayers,
  loadCaptains,
  loadClubLogos,
  captainIdFor,
  findPlayerSeasons,
} from "@/data/loaders";
import type { Player as SnapshotP, PlayerRole, PlayerSeasonSplit } from "@/data/schemas";

import type { ComparisonMetrics, Player, PlayerLeaderboardEntry, TeamRef } from "@/types/api";

import { clubLogoFromMap } from "@/utils/club-logo";
import { logger } from "@/utils/logger";
import { seedAge } from "@/utils/age";

import { aggregateCareerMetrics } from "./career-aggregate";
import { getTopAssists, getTopScorers } from "./leaderboards.api";

export type PlayerWithMetrics = {
  player: Player;
  metrics: ComparisonMetrics;
};

/**
 * Return the player's PL-season head-to-head metrics, sourced from the
 * committed player snapshot.
 *
 * The snapshot `Player.metrics` sub-object is structurally identical to
 * `ComparisonMetrics` — same 12 field names, same null-vs-number contract.
 * No PL-row narrowing needed (the snapshot is PL-only by construction).
 *
 * Returns `null` when the season has no committed snapshot (loader returns
 * null) OR the player id doesn't exist in that season's dataset.
 */
export async function getPlayerStats(
  playerId: number,
  season: number,
): Promise<PlayerWithMetrics | null> {
  const player = await loadPlayer(playerId, season);
  if (!player) {
    logger.info("player-stats.not_found", { playerId, season });
    return null;
  }
  return {
    player: toApiPlayer(player, await getEntityNames()),
    metrics: player.metrics,
  };
}

export type PlayerCareer = {
  player: Player;
  metrics: ComparisonMetrics;
  span: { from: number; to: number };
};

/**
 * Career aggregate across every committed season the player appears in
 * (TASK-M24 "All seasons"). Counting stats sum; `passAccuracy` is
 * appearances-weighted (see `aggregateCareerMetrics`). Identity (name/photo/
 * team) comes from the latest season. Returns null when the player is in no
 * committed season.
 */
export async function getPlayerCareer(playerId: number): Promise<PlayerCareer | null> {
  const info = await findPlayerSeasons(playerId);
  if (!info || info.seasons.length === 0) {
    logger.info("player-career.not_found", { playerId });
    return null;
  }
  const rows = (await Promise.all(info.seasons.map((s) => loadPlayer(playerId, s)))).filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );
  if (rows.length === 0) return null;
  return {
    // TASK-1606 follow-up: localize the display name on `/ar` (the compare
    // "All seasons" slot was Latin — this path never threaded the resolver).
    // The OG route calls this outside a `[locale]` context → `getEntityNames`
    // resolves to identity → the OG card stays Latin, as designed.
    player: toApiPlayer(info.latest, await getEntityNames()),
    metrics: aggregateCareerMetrics(rows.map((r) => r.metrics)),
    span: { from: Math.min(...info.seasons), to: Math.max(...info.seasons) },
  };
}

// Slim shape returned to the client search combobox (TASK-404) and the
// slot-picker hydrate path (TASK-405). Just enough to render a list row
// or slot card: avatar, name, current team. Deliberately not exposing the
// full `Player` / `PlayerStatisticsEntry` shape — that would push 30+ KB
// of nested JSON over the wire per query.
export type PlayerSearchHit = {
  id: number;
  name: string;
  team: TeamRef;
  photo: string;
  // Cross-season search (TASK-M11) carries the latest season the player
  // appears in, so the compare slot can default to a season they actually
  // played. Absent for season-scoped search hits.
  season?: number;
  // Slot-card enrichment (TASK-1513) — populated by `getPlayerSlim` so the
  // `/compare` slot card can show position, live age, nationality flag, and
  // the club crest. Absent on search-dropdown / leaderboard-derived hits
  // (those rows don't need them).
  position?: string;
  age?: number | null;
  birthDate?: string | null;
  dateOfDeath?: string | null;
  nationality?: string | null;
  nationalityCode?: string | null;
};

/**
 * Slim shape returned to the client search combobox + slot picker. Same
 * snapshot source as `getPlayerStats` — the loader will dedupe the file
 * read for free if both fire in the same render.
 */
export async function getPlayerSlim(
  playerId: number,
  season: number,
  // Passed by the `/api/players/[id]` route (client slot-card hydrate) from a
  // `?locale=` param, since a Route Handler has no `[locale]` request context.
  locale?: string,
): Promise<PlayerSearchHit | null> {
  const player = await loadPlayer(playerId, season);
  if (!player) {
    logger.info("player-slim.not_found", { playerId, season });
    return null;
  }
  // TASK-1606 follow-up: localize the compare slot card's name / club / position
  // / nationality on `/ar` (they were Latin — the slim path never resolved).
  const names = await getEntityNames(locale);
  return {
    id: player.id,
    name: names.player(player.id, player.name),
    team: {
      id: player.teamId,
      name: names.team(player.teamId, player.teamName),
      logo: clubLogoFromMap(player.teamId, season, await loadClubLogos()),
    },
    photo: player.photo ?? "",
    // TASK-1513: the redesigned compare slot card renders these.
    position: names.position(player.position) ?? player.position,
    age: seedAge(player.birthDate ?? null, player.birthYear ?? null, player.dateOfDeath ?? null),
    birthDate: player.birthDate ?? null,
    dateOfDeath: player.dateOfDeath ?? null,
    nationality: names.nationality(player.nationalityCode ?? null, player.nationality ?? null),
    nationalityCode: player.nationalityCode ?? null,
  };
}

// Full player profile for the `/players/[id]` page (TASK-610): the fields the
// hero + season-stats table need. Unlike `getPlayerStats` (which returns the
// wire `Player`, with no team/position), this keeps the snapshot's
// `team`/`position`. TASK-M15 added age (derived at the season's end),
// full DOB, and nationality — carried on the snapshot row.
export type PlayerProfile = {
  id: number;
  name: string;
  team: TeamRef;
  position: string;
  photo: string;
  // TASK-M40: `age` is the SSR seed (until now / until death); `<PlayerAge>`
  // refines a living player's value live on the client from `birthDate`.
  age: number | null;
  birthDate: string | null;
  dateOfDeath: string | null;
  nationality: string | null;
  nationalityCode: string | null;
  // TASK-M41: this player captained their team in the viewed season.
  isCaptain: boolean;
  // TASK-M70: enriched positional data (from M56). `role` null = unenriched →
  // the hero falls back to the coarse `position`.
  role: PlayerRole | null;
  altRoles: PlayerRole[];
  foot: "left" | "right" | "both" | null;
  height: number | null;
  metrics: ComparisonMetrics;
  // TASK-M07: per-club breakdown for a mid-season transferee (2017-24 era);
  // absent for single-club seasons.
  splits?: PlayerSeasonSplit[];
};

/**
 * Load a single player's profile (hero fields + the 12 ComparisonMetrics) for
 * a season. Returns `null` when the season has no snapshot or the id is absent
 * — the route turns that into `notFound()`.
 */
export async function getPlayerProfile(
  playerId: number,
  season: number,
  locale?: string,
): Promise<PlayerProfile | null> {
  const player = await loadPlayer(playerId, season);
  if (!player) {
    logger.info("player-profile.not_found", { playerId, season });
    return null;
  }
  const captainId = captainIdFor(await loadCaptains(), season, player.teamId);
  const names = await getEntityNames(locale);
  return {
    id: player.id,
    name: names.player(player.id, player.name),
    team: {
      id: player.teamId,
      name: names.team(player.teamId, player.teamName),
      logo: clubLogoFromMap(player.teamId, season, await loadClubLogos()),
    },
    position: names.position(player.position) ?? player.position,
    photo: player.photo ?? "",
    age: seedAge(player.birthDate ?? null, player.birthYear ?? null, player.dateOfDeath ?? null),
    birthDate: player.birthDate ?? null,
    dateOfDeath: player.dateOfDeath ?? null,
    nationality: names.nationality(player.nationalityCode ?? null, player.nationality ?? null),
    nationalityCode: player.nationalityCode ?? null,
    isCaptain: captainId !== null && player.id === captainId,
    role: player.role ?? null,
    altRoles: player.altRoles ?? [],
    foot: player.foot ?? null,
    height: player.height ?? null,
    metrics: player.metrics,
    splits: player.splits,
  };
}

/**
 * Synthesize the wire `Player` shape from a snapshot player row.
 * Only `name` is read by consumers (verified via grep of /compare page +
 * its children); the rest are populated with type-correct safe defaults
 * (empty strings / null / false). Photo passes through with empty-string
 * fallback for the nullable column.
 */
function toApiPlayer(p: SnapshotP, names: EntityNames = IDENTITY_NAMES): Player {
  return {
    id: p.id,
    name: names.player(p.id, p.name),
    firstname: "",
    lastname: "",
    age: 0,
    birth: { date: "", place: null, country: null },
    nationality: "",
    height: null,
    weight: null,
    injured: false,
    photo: p.photo ?? "",
  };
}

/**
 * Return all players whose name contains the query (case-insensitive
 * substring match) for the given season. Sourced from the committed
 * player snapshot.
 *
 * No length-cap on the result set — the snapshot has 527 players for the
 * season and a name-substring filter typically returns single-digit
 * hits in practice. The client combobox can apply its own UI limit.
 *
 * Returns `null` when the season has no committed snapshot.
 */
export async function searchPlayers(
  query: string,
  season: number,
  // Passed by the `/api/players/search` route from a `?locale=` param (Route
  // Handler → no `[locale]` request context). Note: the match is still against
  // the Latin `p.name` (the season files carry no per-player Arabic name — the
  // cross-season `/api/search` index is what matches Arabic queries).
  locale?: string,
): Promise<PlayerSearchHit[] | null> {
  const players = await loadPlayers(season);
  if (!players) {
    logger.warn("players-search.load_failed", { query, season });
    return null;
  }

  const clubLogos = await loadClubLogos();
  const names = await getEntityNames(locale);
  const needle = query.toLowerCase();
  const hits: PlayerSearchHit[] = [];
  for (const p of players) {
    if (!p.name.toLowerCase().includes(needle)) continue;
    hits.push({
      id: p.id,
      name: names.player(p.id, p.name),
      team: {
        id: p.teamId,
        name: names.team(p.teamId, p.teamName),
        logo: clubLogoFromMap(p.teamId, season, clubLogos),
      },
      photo: p.photo ?? "",
    });
  }
  return hits;
}

// Default suggestions when the search box is focused but empty (TASK-604) and
// the compare empty-state card grid (TASK-605). Two sections — top scorers +
// top assists for the season. Each entry carries its leaderboard stat (`goals`
// on scorers, `assists` on assisters) so the compare cards can show a "⚽ 18" /
// "🎯 12" badge; `<PlayerSearch>` ignores the extra field.
export type SuggestedPlayer = PlayerSearchHit & {
  goals?: number;
  assists?: number;
};

export type SuggestedPlayers = {
  topScorers: SuggestedPlayer[];
  topAssists: SuggestedPlayer[];
};

const SUGGESTED_PER_SECTION = 10;

// PlayerLeaderboardEntry (wire shape, photo already joined by leaderboards.api)
// → the slim PlayerSearchHit the picker rows render.
function leaderboardEntryToHit(entry: PlayerLeaderboardEntry): PlayerSearchHit {
  const team = entry.statistics[0]?.team;
  return {
    id: entry.player.id,
    name: entry.player.name,
    team: {
      id: team?.id ?? 0,
      name: team?.name ?? "",
      logo: team?.logo ?? "",
    },
    photo: entry.player.photo,
  };
}

/**
 * Build the focus-state suggestions for `<PlayerSearch>` / the `/compare` card
 * grid: the season's top scorers and top assisters as two `SuggestedPlayer[]`
 * sections. Reuses the leaderboard fetchers (which already rank + join FPL
 * photos), so there's no separate ranking logic here. The synthesized
 * statistics carry the ranking value in `goals.total` (scorers) / `goals.assists`
 * (assisters). Always resolves — an unknown season yields two empty sections.
 */
export async function getSuggestedPlayers(
  season: number,
  // `/api/players/suggested` passes `?locale=` (Route Handler → no request
  // context) so the suggested cards' names localize on `/ar`.
  locale?: string,
): Promise<SuggestedPlayers> {
  const [scorers, assists] = await Promise.all([
    getTopScorers({ season, locale }),
    getTopAssists({ season, locale }),
  ]);
  return {
    topScorers: (scorers ?? []).slice(0, SUGGESTED_PER_SECTION).map((e) => ({
      ...leaderboardEntryToHit(e),
      goals: e.statistics[0]?.goals.total ?? undefined,
    })),
    topAssists: (assists ?? []).slice(0, SUGGESTED_PER_SECTION).map((e) => ({
      ...leaderboardEntryToHit(e),
      assists: e.statistics[0]?.goals.assists ?? undefined,
    })),
  };
}
