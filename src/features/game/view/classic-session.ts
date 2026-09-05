import { premierLeagueSubstitutions } from "../domain/substitution-rules";
import type { ClassicData } from "../domain/classic-data";
import type { SavedClassic } from "../storage/classic-slot";
import { classicLineup } from "../domain/classic-lineup";
import { canPlay } from "../domain/eligibility";
import { formationByName } from "../domain/formation";
import { makeGameTeam } from "../domain/team";
import { classicFixtureSeed, type ClassicRun } from "./classic-run";
import type { SeasonFixture } from "./season-match";

export function classicTeams(
  data: ClassicData,
  clubId: number,
  shape: string,
  cardIds?: readonly string[],
) {
  if (!data.clubIds.includes(clubId)) throw new Error("Unknown Classic club");
  return data.clubIds.map((id) => {
    const club = data.squads.find((c) => c.teamId === id)!;
    const name =
      id === clubId
        ? shape
        : club.formations.includes("4-4-2 Flat")
          ? "4-4-2 Flat"
          : club.formations[0];
    if (!club.formations.includes(name)) throw new Error("Unsupported Classic formation");
    const formation = { ...formationByName(name), season: data.season };
    const players =
      id === clubId && cardIds
        ? cardIds.map((key) => club.pool.find((p) => p.cardId === key))
        : classicLineup(club.pool, formation);
    if (
      !players ||
      players.length !== 11 ||
      players.some((p, i) => !p || !canPlay(p, formation.slots[i].role)) ||
      new Set(players.map((p) => p!.playerId)).size !== 11
    )
      throw new Error("Invalid Classic XI");
    const xi = players.map((p) => p!);
    const used = new Set(xi.map((p) => p.playerId));
    const bench = club.pool
      .filter((p) => !used.has(p.playerId))
      .slice()
      .sort(
        (a, b) =>
          Number(b.role === "GK") - Number(a.role === "GK") ||
          (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0) ||
          a.playerId - b.playerId,
      )
      .slice(0, 7);
    return makeGameTeam(id, club.name, data.season, formation, xi, bench);
  });
}
export function restoreClassic(data: ClassicData, saved: SavedClassic) {
  if (saved.version !== 1 || data.season !== saved.season || data.archiveKey !== saved.archiveKey)
    throw new Error("Classic archive changed");
  const coach = data.clubIds.indexOf(saved.clubId);
  if (
    coach < 0 ||
    saved.results.length > data.schedule.fixtures.length ||
    saved.results.some(
      (r, i) =>
        r.fixtureId !== data.schedule.fixtures[i].id ||
        r.seed !== classicFixtureSeed(saved.seed, r.fixtureId),
    )
  )
    throw new Error("Classic calendar changed");
  return {
    teams: classicTeams(data, saved.clubId, saved.formation, saved.cardIds),
    run: { seed: saved.seed, coach, results: saved.results } satisfies ClassicRun,
  };
}
export function nextClassicFixture(
  data: ClassicData,
  saved: SavedClassic,
): (SeasonFixture & { id: string }) | null {
  const { teams, run } = restoreClassic(data, saved);
  const f = data.schedule.fixtures.find(
    (f, i) => i >= run.results.length && (f.home === run.coach || f.away === run.coach),
  );
  if (!f) return null;
  return {
    id: f.id,
    coachSide: f.home === run.coach ? "home" : "away",
    setup: {
      substitutions: premierLeagueSubstitutions(data.season, f.date),
      home: teams[f.home],
      away: teams[f.away],
      seed: classicFixtureSeed(run.seed, f.id),
      targetGoalsPerMatch:
        data.schedule.fixtures.reduce((n, f) => n + f.homeGoals + f.awayGoals, 0) /
        data.schedule.fixtures.length,
    },
  };
}

/** Rotate only future fixtures. Validate the entire XI before replacing the saved selection. */
export function rotateClassic(
  data: ClassicData,
  saved: SavedClassic,
  cardIds: readonly string[],
): SavedClassic {
  if (!nextClassicFixture(data, saved)) throw new Error("Classic season is complete");
  classicTeams(data, saved.clubId, saved.formation, cardIds);
  return { ...saved, cardIds: [...cardIds] };
}
