import "server-only";

import { getEntityNames, IDENTITY_NAMES, type EntityNames } from "@/features/i18n/entity-names";

import {
  loadSquad,
  loadTeams,
  loadTeamStats,
  loadFixtures,
  loadCaptains,
  loadClubMetadata,
  loadClubLogos,
  captainIdFor,
} from "@/data/loaders";
import { aggregateTeamSeasonStats } from "@/features/teams/team-season-stats";
import type { ClubLogosFile, Player as SnapshotP, Team as SnapshotT } from "@/data/schemas";
import type { SquadPlayer, TeamDetail, TeamStats } from "@/types/api";
import { clubLogoFromMap } from "@/utils/club-logo";
import { logger } from "@/utils/logger";
import { currentDataSeason } from "@/utils/season";
import { seedAge } from "@/utils/age";

/**
 * Return the `TeamDetail` wire envelope for a single Premier League
 * team, sourced from the committed JSON snapshot.
 *
 * **Season-aware (TASK-701)** — defaults to `currentDataSeason()` so existing
 * callers are unaffected, but accepts an explicit season so historical-only
 * clubs (e.g. Stoke, Leeds) resolve when browsing past seasons. A team that
 * never played the requested season returns `null` → the page 404s, which is
 * correct (you can't open Stoke's 2024-25 page — they weren't in the league).
 *
 * The snapshot `Team` carries: id, name, code (3-char), founded, venue (string,
 * not nested), capacity, logo (already `/logos/<id>.png`). The adapter
 * synthesizes the rest of the nested wire shape — `country` ← "England",
 * `national` ← false, `venue.{address,city,surface,image}` ← null. None of
 * those null fields are read by consumers (verified via grep of
 * `src/features/teams/components/`).
 */
export async function getTeam(
  id: number,
  season: number = currentDataSeason(),
  // TASK-M71c: Route Handlers have no [locale] segment — they pass the locale
  // explicitly; RSC callers omit it and getEntityNames() reads the request.
  locale?: string,
): Promise<TeamDetail | null> {
  const [teams, clubMeta, clubLogos] = await Promise.all([
    loadTeams(season),
    loadClubMetadata(),
    loadClubLogos(),
  ]);
  if (!teams) {
    logger.warn("team.load_failed", { id, season });
    return null;
  }
  const team = teams.find((t) => t.id === id);
  if (!team) {
    logger.info("team.not_found", { id, season });
    return null;
  }
  return toTeamDetail(
    team,
    season,
    clubLogos,
    clubMeta?.[String(team.id)],
    await getEntityNames(locale),
  );
}

/**
 * Return the team's squad as `SquadPlayer[]`, sourced from the committed
 * player snapshot filtered by `teamId`.
 *
 * **Season-aware (TASK-701)** — defaults to `currentDataSeason()` so existing
 * callers are unaffected, but accepts an explicit season so a historical team
 * page shows that season's roster.
 *
 * **Partial squad caveat:** `data/players-{season}.json` carries the season's
 * stats-emitting players, so this returns only players with PL stats for the
 * season — players who never made a matchday squad won't appear. Consumers
 * handle the empty path via `<SquadSection>`'s empty-state branch. (All 20 PL
 * teams have rows for 2024-25.)
 *
 * **Position normalization:** the snapshot uses `"Forward"`; the wire shape
 * uses `"Attacker"`. The adapter rewrites so `<SquadGrid>`'s switch keeps
 * working. Other positions pass through.
 */
export async function getSquad(
  id: number,
  season: number = currentDataSeason(),
  // TASK-M71c: explicit locale for Route Handlers (see getTeam).
  locale?: string,
): Promise<SquadPlayer[] | null> {
  const players = await loadSquad(id, season);
  if (!players) {
    logger.warn("squad.load_failed", { id, season });
    return null;
  }
  if (players.length === 0) {
    logger.info("squad.empty", { id, season });
    return [];
  }
  // TASK-M41: mark the season's captain (read-time join; no player-file change).
  const captainId = captainIdFor(await loadCaptains(), season, id);
  const names = await getEntityNames(locale);
  return players.map((p) => toSquadPlayer(p, captainId, names));
}

/**
 * Return a synthesized `TeamStats` envelope for the team's season, sourced
 * from the committed standings snapshot.
 *
 * Goals for/against come from the standings snapshot. The remaining
 * KPIs — clean sheets, failed-to-score, win/lose streaks, longest unbeaten
 * run, per-game shots/corners/fouls, and discipline — are derived read-time
 * from the committed fixtures via `aggregateTeamSeasonStats` (TASK-M17, the
 * same pattern as the Form-column synthesis in TASK-M05). Per-game + card
 * fields are `null` for pre-2000 seasons (no per-match `teamStats`), so those
 * tiles render `—`; results-only fields populate for every season.
 *
 * Home/away goal splits (`goals.for.total.home/away` etc.) are populated
 * with `null` rather than `0` to preserve the wire convention
 * of "not measured ≠ zero" — none of the existing consumers read those
 * sub-fields, but the type contract permits null and modeling it honestly
 * costs nothing.
 */
export async function getTeamStats(season: number, id: number): Promise<TeamStats | null> {
  const stats = await loadTeamStats(id, season);
  if (!stats) {
    logger.warn("team-stats.load_failed", { id, season });
    return null;
  }
  const fixtures = await loadFixtures(season);
  const agg = fixtures ? aggregateTeamSeasonStats(fixtures, id) : null;
  return {
    goals: {
      for: {
        total: { home: null, away: null, total: stats.goalsFor },
      },
      against: {
        total: { home: null, away: null, total: stats.goalsAgainst },
      },
    },
    clean_sheet: { total: agg?.cleanSheets ?? null },
    failed_to_score: { total: agg?.failedToScore ?? null },
    biggest: {
      streak: {
        wins: agg?.longestWinStreak ?? null,
        draws: null,
        loses: agg?.longestLosingStreak ?? null,
      },
    },
    lineups: [],
    longestUnbeaten: agg?.longestUnbeaten ?? null,
    perGame: {
      shots: agg?.avgShots ?? null,
      shotsOnTarget: agg?.avgShotsOnTarget ?? null,
      corners: agg?.avgCorners ?? null,
      fouls: agg?.avgFouls ?? null,
    },
    cards: { yellow: agg?.yellowCards ?? null, red: agg?.redCards ?? null },
  };
}

/**
 * Return all Premier League teams for the given season as `TeamDetail[]`.
 * Used by `generateStaticParams` in `/teams/[id]` and the `/teams` index
 * grid. Unsupported seasons (no `data/teams-{season}.json`) resolve to
 * `null` so the index page renders its "Club list is unavailable" path.
 */
export async function getPLTeams(season: number): Promise<TeamDetail[] | null> {
  const [teams, clubLogos] = await Promise.all([loadTeams(season), loadClubLogos()]);
  if (!teams) {
    logger.warn("teams-list.load_failed", { season });
    return null;
  }
  // The `/teams` index cards show crest + name only — no city/image — so the
  // list deliberately skips the club-metadata join (one fewer read per request).
  // TASK-1606 follow-up: localize the club name on `/ar` (was Latin — the index
  // never threaded the resolver, unlike the detail page's `getTeam`).
  const names = await getEntityNames();
  return teams.map((t) => toTeamDetail(t, season, clubLogos, undefined, names));
}

function toTeamDetail(
  team: SnapshotT,
  season: number,
  clubLogos: ClubLogosFile | null,
  meta?: { city: string | null; stadiumImage: string | null; website?: string | null } | null,
  names: EntityNames = IDENTITY_NAMES,
): TeamDetail {
  return {
    team: {
      id: team.id,
      name: names.team(team.id, team.name),
      logo: clubLogoFromMap(team.id, season, clubLogos), // era-correct crest (TASK-M54)
      code: team.code,
      // Every PL club is English; localize the country on `/ar` via the
      // home-nation override (gb-eng → إنجلترا). Latin fallback keeps `/en`
      // byte-unchanged. Only the detail hero renders this (index cards omit it).
      country: names.nationality("gb-eng", "England") ?? "England",
      founded: team.founded,
      national: false,
      website: meta?.website ?? null, // TASK-M64 (detail hero only; index cards omit it)
    },
    venue: {
      id: null,
      name: names.venue(team.id, team.venue),
      address: null,
      city: names.city(team.id, meta?.city ?? null),
      capacity: team.capacity,
      surface: null,
      image: meta?.stadiumImage ?? null,
    },
  };
}

function toSquadPlayer(
  p: SnapshotP,
  captainId: number | null,
  names: EntityNames = IDENTITY_NAMES,
): SquadPlayer {
  // The snapshot's "Forward" maps to the wire "Attacker" (the latter is what
  // `<SquadGrid>` switches on). Other positions pass through unchanged.
  // NOTE: `position` stays English — `<SquadGrid>` groups on it + localizes the
  // group heading via a key map (TASK-1603), so it must not be translated here.
  const position = p.position === "Forward" ? "Attacker" : p.position;
  return {
    id: p.id,
    name: names.player(p.id, p.name),
    // TASK-M40: `age` is the SSR seed (current age, or frozen at death);
    // `<PlayerAge>` refines living players live from `birthDate`.
    age: seedAge(p.birthDate ?? null, p.birthYear ?? null, p.dateOfDeath ?? null),
    birthDate: p.birthDate ?? null,
    dateOfDeath: p.dateOfDeath ?? null,
    number: null, // snapshot has no kit number
    position,
    photo: p.photo, // nullable photo; consumer falls back to initials
    nationality: names.nationality(p.nationalityCode ?? null, p.nationality ?? null),
    nationalityCode: p.nationalityCode ?? null,
    isCaptain: captainId !== null && p.id === captainId,
  };
}
