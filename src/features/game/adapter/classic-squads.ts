import "server-only";
import { loadPlayers, loadStandings, playerInSquad } from "@/data/loaders";
import { FORMATIONS } from "../domain/chaos-draft";
import { classicLineup } from "../domain/classic-lineup";
import { makeRatingContext } from "../domain/ratings";
import { rate } from "../domain/rate";
import { toGamePlayer } from "./player";

/** One cohort and one rating context per season, shared across every club and shape.
 * Missing legal XIs are reported explicitly for the chooser, never cross-era filled.
 */
export async function loadClassicSquads(season: number) {
  const [players, standings] = await Promise.all([loadPlayers(season), loadStandings(season)]);
  if (!players || !standings?.length) return null;
  const context = makeRatingContext(season, players, standings);
  const rated = new Map(
    players.map((p) => [p.id, { ...toGamePlayer(p, season), ...rate(p, context) }]),
  );
  return standings
    .slice()
    .sort((a, b) => a.teamId - b.teamId)
    .map((club) => {
      const pool = players
        .filter((p) => playerInSquad(p, club.teamId))
        .map((p) => ({
          ...rated.get(p.id)!,
          club: club.teamName,
          teamId: club.teamId,
        }));
      const formations = FORMATIONS.filter((f) => classicLineup(pool, f) != null).map(
        (f) => f.name,
      );
      return { teamId: club.teamId, name: club.teamName, season, pool, formations };
    });
}
