import "server-only";

import { getEntityNames } from "@/features/i18n/entity-names";
import {
  loadClubLogos,
  loadManagers,
  loadManagerBios,
  loadManagerCareerHistory,
  loadManagerEnrichment,
  loadManagerHonoursHistory,
  loadStandings,
  loadTeams,
} from "@/data/loaders";
import type {
  ManagerCareerSpell,
  ManagerEnrichmentSummary,
  ManagerHonourGroup,
} from "@/data/schemas";
import { managedSpells, orderHonourGroups } from "./career-enrichment";
import { clubLogoFromMap } from "@/utils/club-logo";
import { seedAge } from "@/utils/age";
import { countryNameFromCode } from "@/utils/country";

import { aggregateManagerCareer, deriveManagerTitles, type ManagerRecord } from "./manager-stats";

export type ManagerClubRow = {
  teamId: number;
  teamName: string;
  teamLogo: string;
  seasons: number[];
  record: ManagerRecord;
};
export type ManagerSeasonRow = {
  season: number;
  teamId: number;
  teamName: string;
  teamLogo: string;
  record: ManagerRecord;
};
export type ManagerTitleRow = { season: number; teamId: number; teamName: string };

/**
 * A manager's full PL career profile (TASK-M49): identity (photo/nationality/
 * age/deceased), auto-derived PL titles (1st place + primary manager, 2008+),
 * per-club aggregate + per-season records, and the viewed season highlighted.
 * Returns null for an id with no manager data.
 */
export type ManagerProfile = {
  id: string;
  name: string;
  photo: string;
  birthDate: string | null;
  dateOfDeath: string | null;
  age: number | null;
  nationality: string | null;
  nationalityCode: string | null;
  seasons: number[];
  honours: ManagerTitleRow[];
  byClub: ManagerClubRow[];
  bySeason: ManagerSeasonRow[];
  targetSeason: { season: number; rows: ManagerSeasonRow[] } | null;
  totals: ManagerRecord;
  /**
   * TASK-M81 — the full managerial career, beyond the Premier League.
   *
   * Everything above is derived from OUR league data, so it stops at the
   * competition's edge: a manager's honours are the titles his club won in a
   * season we hold. These three carry the rest of the career — European and
   * foreign silverware, and spells at clubs that never played in this league.
   *
   * All three degrade to null/empty. Enrichment covers 140 of 293 managers, so
   * the page must render exactly as before for the rest.
   */
  careerSummary: ManagerEnrichmentSummary | null;
  careerHonours: ManagerHonourGroup[];
  careerSpells: ManagerCareerSpell[];
};

export async function getManagerProfile(
  id: string,
  season?: number,
  // TASK-M71c: explicit locale for Route Handlers (see teams/api.ts getTeam).
  locale?: string,
): Promise<ManagerProfile | null> {
  const managers = await loadManagers();
  if (!managers) return null;
  const career = aggregateManagerCareer(managers, id);
  if (!career) return null;

  const bios = await loadManagerBios();
  const bio = bios?.[id];
  const names = await getEntityNames(locale);

  // TASK-M81: the enrichment layer. Read in parallel and treated as optional —
  // a manager with no Transfermarkt id simply has none of it.
  const [enrichmentMap, honoursMap, careerMap] = await Promise.all([
    loadManagerEnrichment(),
    loadManagerHonoursHistory(),
    loadManagerCareerHistory(),
  ]);
  const careerSummary = enrichmentMap?.[id] ?? null;
  const careerHonours = orderHonourGroups(honoursMap?.[id]?.titles ?? []);
  const careerSpells = managedSpells(careerMap?.[id]?.spells ?? []);

  // Team name lookup: merge loadTeams across the career seasons (newer wins for
  // clubs that changed name); covers defunct clubs not in the current season.
  const teamMaps = await Promise.all(career.seasonsList.map((s) => loadTeams(s)));
  const teamById = new Map<number, { name: string }>();
  for (const teams of teamMaps) for (const t of teams ?? []) teamById.set(t.id, { name: t.name });
  const teamName = (tid: number) => names.team(tid, teamById.get(tid)?.name ?? "");

  // Era-correct crest (TASK-M54): resolve per the relevant season — the row's
  // own season for a per-season row, and the manager's LATEST season at a club
  // for a per-club span row.
  const clubLogos = await loadClubLogos();
  const latestSeasonByTeam = new Map<number, number>();
  for (const s of career.bySeason) {
    const cur = latestSeasonByTeam.get(s.teamId);
    if (cur === undefined || s.season > cur) latestSeasonByTeam.set(s.teamId, s.season);
  }
  const teamLogo = (tid: number, season: number) => clubLogoFromMap(tid, season, clubLogos);

  // Champions per career season → titles where this manager is the primary.
  const standings = await Promise.all(career.seasonsList.map((s) => loadStandings(s)));
  const championBySeason: Record<number, number> = {};
  career.seasonsList.forEach((s, i) => {
    const champ = standings[i]?.find((r) => r.rank === 1);
    if (champ) championBySeason[s] = champ.teamId;
  });
  const honours: ManagerTitleRow[] = deriveManagerTitles(managers, id, championBySeason).map(
    (t) => ({
      season: t.season,
      teamId: t.teamId,
      teamName: teamName(t.teamId),
    }),
  );

  const byClub: ManagerClubRow[] = career.byClub.map((c) => ({
    teamId: c.teamId,
    teamName: teamName(c.teamId),
    teamLogo: teamLogo(c.teamId, latestSeasonByTeam.get(c.teamId) ?? career.seasonsList[0]),
    seasons: c.seasons,
    record: c.record,
  }));
  const bySeason: ManagerSeasonRow[] = career.bySeason.map((s) => ({
    season: s.season,
    teamId: s.teamId,
    teamName: teamName(s.teamId),
    teamLogo: teamLogo(s.teamId, s.season),
    record: s.record,
  }));

  const targetSeason =
    season != null && bySeason.some((r) => r.season === season)
      ? { season, rows: bySeason.filter((r) => r.season === season) }
      : null;

  const nationalityCode = bio?.nationalityCode ?? null;
  return {
    id,
    name: names.manager(id, career.name),
    photo: bio?.photo ?? id,
    birthDate: bio?.birthDate ?? null,
    dateOfDeath: bio?.dateOfDeath ?? null,
    age: seedAge(bio?.birthDate ?? null, null, bio?.dateOfDeath ?? null),
    nationality: names.nationality(
      nationalityCode,
      bio?.nationality ?? countryNameFromCode(nationalityCode),
    ),
    nationalityCode,
    seasons: [...career.seasonsList].reverse(), // newest-first for display
    honours,
    byClub,
    bySeason,
    targetSeason,
    totals: career.totals,
    careerSummary,
    careerHonours,
    careerSpells,
  };
}
