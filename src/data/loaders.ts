import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { mergeCaptains } from "@/data/captains-merge";
import { logger } from "@/utils/logger";
import { currentDataSeason } from "@/utils/season";

import {
  EventsFileSchema,
  FixturesFileSchema,
  LeaderboardsSchema,
  LineupsFileSchema,
  MetaSchema,
  PlayersFileSchema,
  SearchIndexSchema,
  StandingsFileSchema,
  TeamsFileSchema,
  CaptainsFileSchema,
  ClubMetadataFileSchema,
  TeamColorsFileSchema,
  ArNameMapSchema,
  ClubLogosFileSchema,
  ManagersFileSchema,
  ManagerBioFileSchema,
  FixtureExtrasFileSchema,
  GoalAttributionSchema,
  type CaptainsFile,
  type ClubMetadataFile,
  type TeamColorsFile,
  type ClubLogosFile,
  type ManagersFile,
  type ManagerBioFile,
  type FixtureExtrasFile,
  type GoalAttribution,
  type Fixture,
  type FixtureLineups,
  type LeaderboardEntry,
  type Leaderboards,
  type MatchEventRaw,
  type Meta,
  type Player,
  type SearchIndex,
  type Standing,
  type Team,
} from "./schemas";

/**
 * Read-side adapter for the committed JSON snapshots.
 *
 * Every loader is server-only (file-system access) and returns:
 * - the typed shape on a successful read
 * - `null` when the season is unsupported (file doesn't exist) or the
 *   JSON is malformed / schema-invalid
 * - `[]` (NOT null) for derived loaders where the underlying file IS
 *   present but the filter matches zero rows (e.g. `loadSquad` for a
 *   team with no players in the dataset)
 *
 * The schemas live in `src/data/schemas.ts`. JSON is validated at the
 * boundary via Zod — corrupt snapshots fail loudly with a logger.warn
 * rather than crashing a Server Component deep in rendering.
 *
 * Why no ESM static-import fast path: see TASK-504 plan §"Critical
 * design decisions" #2. Always-fs-read keeps the season dimension
 * dynamic + the code path uniform.
 */

const DATA_DIR = join(process.cwd(), "data");

/**
 * Read a JSON file from `data/`, parse it, and validate against the
 * supplied Zod schema. Returns `null` on any failure (ENOENT, parse
 * error, schema violation) — caller checks for null and proceeds with
 * the empty-state UX.
 */
async function readJsonUncached<T>(
  filename: string,
  schema: { parse: (input: unknown) => T },
): Promise<T | null> {
  const path = join(DATA_DIR, filename);
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    const isENOENT = err instanceof Error && "code" in err && err.code === "ENOENT";
    if (isENOENT) {
      logger.info("loaders.file_not_found", { path });
    } else {
      logger.warn("loaders.read_failed", {
        path,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
    return null;
  }

  try {
    const json: unknown = JSON.parse(raw);
    return schema.parse(json);
  } catch (err) {
    logger.warn("loaders.parse_or_validate_failed", {
      path,
      reason: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// Files under `data/` are immutable within a deployment (the sync cron commits
// new data → a fresh deploy → fresh instances), so a parsed+validated file can
// be memoized for the lifetime of a warm Fluid instance. This is the fix for
// the Fluid Active-CPU regression: `findPlayerSeasons` re-reads all 34 season
// files on every player-page render — caching makes that one parse per file per
// instance instead of ~35–45 JSON+Zod parses per render.
//
// Gated to production: `next dev` and the test suite always read fresh, so a
// developer editing `data/` locally isn't served a stale in-process copy.
const _dataFileCache = new Map<string, Promise<unknown>>();

/** Test-only: clear the in-process data-file cache between cases. */
export function __resetDataFileCache(): void {
  _dataFileCache.clear();
}

async function readJsonOrNull<T>(
  filename: string,
  schema: { parse: (input: unknown) => T },
): Promise<T | null> {
  if (process.env.NODE_ENV !== "production") {
    return readJsonUncached(filename, schema);
  }
  let cached = _dataFileCache.get(filename) as Promise<T | null> | undefined;
  if (!cached) {
    cached = readJsonUncached(filename, schema);
    _dataFileCache.set(filename, cached);
  }
  return cached;
}

// ---------------------------------------------------------------------------
// Bulk loaders — one JSON file each
// ---------------------------------------------------------------------------

export async function loadMeta(): Promise<Meta | null> {
  return readJsonOrNull("_meta.json", MetaSchema);
}

/** Cross-season search index (TASK-M08) — every player/team across all seasons. */
export async function loadSearchIndex(): Promise<SearchIndex | null> {
  return readJsonOrNull("search-index.json", SearchIndexSchema);
}

/** Hand-authored captain overrides (TASK-M42); `null` when the file is absent. */
export async function loadCaptainOverrides(): Promise<CaptainsFile | null> {
  return readJsonOrNull("captains-overrides.json", CaptainsFileSchema);
}

/**
 * The derived captains map (`captains.json`) with the hand-authored overrides
 * (`captains-overrides.json`) merged on top — overrides win per (season, team).
 * `null` when both files are absent (the captain badge simply doesn't render).
 */
export async function loadCaptains(): Promise<CaptainsFile | null> {
  const derived = await readJsonOrNull("captains.json", CaptainsFileSchema);
  const overrides = await loadCaptainOverrides();
  if (derived === null && overrides === null) return null;
  return mergeCaptains(derived, overrides);
}

/**
 * Club identity facts (city + stadium image) keyed by our teamId (TASK-M19),
 * or `null` when the committed map is absent. Time-invariant, so `getTeam`
 * joins it at read time over the snapshot nulls — no team-file regeneration.
 */
export async function loadClubMetadata(): Promise<ClubMetadataFile | null> {
  return readJsonOrNull("club-metadata.json", ClubMetadataFileSchema);
}

/** Curated club kit colors (home + away hex) keyed by teamId (TASK-M47). */
export async function loadTeamColors(): Promise<TeamColorsFile | null> {
  return readJsonOrNull("team-colors.json", TeamColorsFileSchema);
}

// TASK-1606: Arabic entity-name sidecar maps (`data/i18n/names-ar/*.json`).
// Each is a stable-id → Arabic-name record; `null` when the file is absent
// (the resolver then falls back to the Latin source name).
export async function loadArTeamNames() {
  return readJsonOrNull("i18n/names-ar/teams.json", ArNameMapSchema);
}
export async function loadArPlayerNames() {
  return readJsonOrNull("i18n/names-ar/players.json", ArNameMapSchema);
}
export async function loadArManagerNames() {
  return readJsonOrNull("i18n/names-ar/managers.json", ArNameMapSchema);
}
export async function loadArVenueNames() {
  return readJsonOrNull("i18n/names-ar/venues.json", ArNameMapSchema);
}
export async function loadArCityNames() {
  return readJsonOrNull("i18n/names-ar/cities.json", ArNameMapSchema);
}
export async function loadArRefereeNames() {
  return readJsonOrNull("i18n/names-ar/referees.json", ArNameMapSchema);
}
export async function loadArPositionNames() {
  return readJsonOrNull("i18n/names-ar/positions.json", ArNameMapSchema);
}
export async function loadArNationalityOverrides() {
  return readJsonOrNull("i18n/names-ar/nationalities.json", ArNameMapSchema);
}

/** Historical crest variants keyed by teamId (TASK-M54); see `clubLogo`. */
export async function loadClubLogos(): Promise<ClubLogosFile | null> {
  return readJsonOrNull("club-logos.json", ClubLogosFileSchema);
}

/** TASK-M26: committed per-player goal-attribution map (season-independent). */
export async function loadGoalAttribution(): Promise<GoalAttribution | null> {
  return readJsonOrNull("player-goal-attribution.json", GoalAttributionSchema);
}

/**
 * Combine the modern (SDP 2008-2025) + legacy (Wikipedia 1992-2007) managers
 * files. Season keys must be disjoint — the two builders own non-overlapping
 * eras (TASK-M51).
 */
export function mergeManagersFiles(
  modern: ManagersFile | null,
  legacy: ManagersFile | null,
): ManagersFile | null {
  if (modern === null) return legacy;
  if (legacy === null) return modern;
  for (const k of Object.keys(legacy)) {
    if (k in modern) throw new Error(`managers season key overlap: ${k}`);
  }
  return { ...modern, ...legacy };
}

/**
 * Managers per season → teamId (most matches first). Modern era (2008-2025) from
 * the SDP data (TASK-M48), merged with the legacy era (1992-2007) derived from the
 * Wikipedia manager table + committed fixtures (TASK-M51).
 */
export async function loadManagers(): Promise<ManagersFile | null> {
  const [modern, legacy] = await Promise.all([
    readJsonOrNull("managers.json", ManagersFileSchema),
    readJsonOrNull("managers-legacy.json", ManagersFileSchema),
  ]);
  return mergeManagersFiles(modern, legacy);
}

/**
 * Field-level merge of the override map over the auto bio (TASK-M49). An override
 * wins PER FIELD when non-null, else the auto value is kept — so a photo-only or
 * nationality-only override does NOT wipe a manager's auto DOB/nationality (an
 * object-level spread would). Keys present in either map appear in the result.
 */
export function mergeManagerBioMaps(
  auto: ManagerBioFile | null,
  overrides: ManagerBioFile | null,
): ManagerBioFile {
  const out: ManagerBioFile = {};
  for (const [id, b] of Object.entries(auto ?? {})) out[id] = { ...b };
  for (const [id, o] of Object.entries(overrides ?? {})) {
    const a = out[id];
    out[id] = {
      birthDate: o.birthDate ?? a?.birthDate ?? null,
      dateOfDeath: o.dateOfDeath ?? a?.dateOfDeath ?? null,
      nationality: o.nationality ?? a?.nationality ?? null,
      nationalityCode: o.nationalityCode ?? a?.nationalityCode ?? null,
      photo: o.photo ?? a?.photo ?? null,
    };
  }
  return out;
}

/**
 * Manager DOB / date of death / nationality / photo keyed by PL id, with
 * hand-authored overrides (`manager-bio-overrides.json`) merged field-by-field
 * on top (TASK-M48 / TASK-M49).
 */
export async function loadManagerBios(): Promise<ManagerBioFile | null> {
  const [auto, legacy, overrides] = await Promise.all([
    readJsonOrNull("manager-bio.json", ManagerBioFileSchema),
    readJsonOrNull("manager-bio-legacy.json", ManagerBioFileSchema),
    readJsonOrNull("manager-bio-overrides.json", ManagerBioFileSchema),
  ]);
  if (auto === null && legacy === null && overrides === null) return null;
  // Legacy ids are disjoint from modern ids, so a base merge of auto + legacy is
  // safe; hand-authored overrides win per field on top (TASK-M51).
  return mergeManagerBioMaps(mergeManagerBioMaps(auto, legacy), overrides);
}

/** The stable player id of a team's captain for a season, or null. */
export function captainIdFor(
  captains: CaptainsFile | null,
  season: number,
  teamId: number,
): number | null {
  return captains?.[String(season)]?.[String(teamId)] ?? null;
}

/**
 * The seasons with committed data, newest-first — the source of truth for the
 * `<SeasonSwitcher>` dropdown (TASK-702) so it only offers seasons that
 * actually have JSON files. Reads `_meta.json.seasons`; falls back to just the
 * current data season if the meta file is missing/malformed (defensive — the
 * file is committed, so this should never happen in practice).
 *
 * Filtered to seasons `<= currentDataSeason()`: a season's entity files can be
 * committed before the app switches its default to it (e.g. 2025-26 ships its
 * standings/fixtures in TASK-1201 but stays hidden until TASK-1203 adds players
 * and bumps `LATEST_DATA_SEASON`). This keeps the switcher in lockstep with
 * `parseSeason`'s ceiling so it never offers a season the page would clamp away.
 */
export async function getAvailableSeasons(): Promise<number[]> {
  const ceiling = currentDataSeason();
  const meta = await loadMeta();
  if (meta && meta.seasons.length > 0) {
    return [...meta.seasons].filter((s) => s <= ceiling).sort((a, b) => b - a);
  }
  return [ceiling];
}

export async function loadStandings(season: number): Promise<Standing[] | null> {
  return readJsonOrNull(`standings-${season}.json`, StandingsFileSchema);
}

export async function loadTeams(season: number): Promise<Team[] | null> {
  return readJsonOrNull(`teams-${season}.json`, TeamsFileSchema);
}

export async function loadPlayers(season: number): Promise<Player[] | null> {
  return readJsonOrNull(`players-${season}.json`, PlayersFileSchema);
}

export async function loadFixtures(season: number): Promise<Fixture[] | null> {
  return readJsonOrNull(`fixtures-${season}.json`, FixturesFileSchema);
}

// TASK-M16: per-fixture attendance + venue sidecar (committed, cron never
// regenerates it). Keyed by our fixture id. null when the season has no file.
export async function loadFixtureExtras(season: number): Promise<FixtureExtrasFile | null> {
  return readJsonOrNull(`fixture-extras-${season}.json`, FixtureExtrasFileSchema);
}

/** All four leaderboards for a season in one object (or null if uncovered). */
export async function loadLeaderboards(season: number): Promise<Leaderboards | null> {
  return readJsonOrNull(`leaderboards-${season}.json`, LeaderboardsSchema);
}

export type LeaderboardKind = "scorers" | "assists" | "yellow-cards" | "red-cards";

export async function loadLeaderboard(
  kind: LeaderboardKind,
  season: number,
): Promise<LeaderboardEntry[] | null> {
  const all = await readJsonOrNull(`leaderboards-${season}.json`, LeaderboardsSchema);
  if (!all) return null;
  switch (kind) {
    case "scorers":
      return all.topScorers;
    case "assists":
      return all.topAssists;
    case "yellow-cards":
      return all.topYellowCards;
    case "red-cards":
      return all.topRedCards;
  }
}

// ---------------------------------------------------------------------------
// Lineups + match events (Phase 10 — TheSportsDB; covered seasons ≈ 2019-26)
// ---------------------------------------------------------------------------

/** Whole lineups file for a season, or null when no file exists (uncovered season). */
export async function loadLineups(season: number): Promise<Record<string, FixtureLineups> | null> {
  return readJsonOrNull(`lineups-${season}.json`, LineupsFileSchema);
}

/** One fixture's lineups, or null (season uncovered OR fixture not in the file). */
export async function loadLineup(id: string, season: number): Promise<FixtureLineups | null> {
  const all = await loadLineups(season);
  if (!all) return null;
  return all[id] ?? null;
}

/**
 * One fixture's events. Returns `[]` when the season file exists but the fixture
 * has no events; `null` when the season file is missing entirely (uncovered).
 */
export async function loadEvents(id: string, season: number): Promise<MatchEventRaw[] | null> {
  const all = await readJsonOrNull(`events-${season}.json`, EventsFileSchema);
  if (!all) return null;
  return all[id] ?? [];
}

// ---------------------------------------------------------------------------
// Derived loaders — composed from the bulk loaders above
// ---------------------------------------------------------------------------

export async function loadPlayer(id: number, season: number): Promise<Player | null> {
  const players = await loadPlayers(season);
  if (!players) return null;
  return players.find((p) => p.id === id) ?? null;
}

export async function loadFixture(id: string, season: number): Promise<Fixture | null> {
  const fixtures = await loadFixtures(season);
  if (!fixtures) return null;
  return fixtures.find((f) => f.id === id) ?? null;
}

/**
 * Is a player a squad member of `teamId` this season? True for their primary
 * club OR — for a mid-season transferee (TASK-M07) — any club in their `splits`,
 * so the transferee shows in BOTH clubs' squad grids.
 */
export function playerInSquad(player: Player, teamId: number): boolean {
  return player.teamId === teamId || (player.splits?.some((s) => s.teamId === teamId) ?? false);
}

export async function loadSquad(teamId: number, season: number): Promise<Player[] | null> {
  const players = await loadPlayers(season);
  if (!players) return null;
  return players.filter((p) => playerInSquad(p, teamId));
}

/**
 * Find which committed seasons a (stable, cross-season — TASK-704) player id
 * appears in. Used by `/players/[id]` to distinguish "real player, no data for
 * the selected season" (→ `<DataUnavailable>`) from "unknown id" (→ 404).
 *
 * Returns the player's most-recent name/team + the descending list of seasons
 * they played, or `null` if the id is in no committed season.
 */
export async function findPlayerSeasons(
  id: number,
): Promise<{ name: string; teamId: number; latest: Player; seasons: number[] } | null> {
  const seasons = await getAvailableSeasons(); // newest-first
  const found: number[] = [];
  let latest: Player | null = null;
  for (const season of seasons) {
    const player = await loadPlayer(id, season);
    if (player) {
      found.push(season);
      if (!latest) latest = player; // first hit = newest season
    }
  }
  if (!latest) return null;
  return { name: latest.name, teamId: latest.teamId, latest, seasons: found };
}

/**
 * Find which committed seasons a club appears in, newest-first. A team
 * "existed" in a season if it has a row in that season's standings (it played
 * in the Premier League that year). Used by `/teams/[id]` (TASK-M10) to scope
 * the entity-page season switcher to only the seasons the club existed — so a
 * defunct/relegated side (e.g. Blackpool, one PL season) doesn't offer 2025-26
 * and the empty-state/404 it would land on.
 *
 * Returns `[]` for a team id in no committed season (the page already
 * `notFound()`s unknown teams, so this is the defensive empty case).
 */
export async function findTeamSeasons(teamId: number): Promise<number[]> {
  const seasons = await getAvailableSeasons(); // newest-first
  const found: number[] = [];
  for (const season of seasons) {
    const standings = await loadStandings(season);
    if (standings?.some((row) => row.teamId === teamId)) found.push(season);
  }
  return found;
}

/** Pure: the seasons a manager appears in within a managers file, newest-first.
 * Split out from `findManagerSeasons` so it unit-tests without fs (TASK-M49). */
export function managerSeasonsFrom(file: ManagersFile, id: string): number[] {
  const out: number[] = [];
  for (const [seasonStr, byTeam] of Object.entries(file)) {
    for (const list of Object.values(byTeam)) {
      if (list.some((m) => m.id === id)) {
        out.push(Number(seasonStr));
        break;
      }
    }
  }
  return out.sort((a, b) => b - a); // newest first
}

/** Which committed seasons a manager appears in, newest-first (TASK-M49). Used by
 * the `/managers/[id]` page-local season switcher. Empty for an unknown id. */
export async function findManagerSeasons(id: string): Promise<number[]> {
  const file = await loadManagers();
  if (!file) return [];
  return managerSeasonsFrom(file, id);
}

// ---------------------------------------------------------------------------
// loadTeamStats — derived projection from standings
// ---------------------------------------------------------------------------

/**
 * The columns the Standings snapshot actually contains. Anything richer
 * than this (clean sheets, possession %, per-fixture breakdown) isn't
 * derivable from the standings snapshot alone.
 */
export type TeamStatsLoaderShape = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
};

export async function loadTeamStats(
  teamId: number,
  season: number,
): Promise<TeamStatsLoaderShape | null> {
  const standings = await loadStandings(season);
  if (!standings) return null;
  const row = standings.find((s) => s.teamId === teamId);
  if (!row) return null;
  return {
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
  };
}
