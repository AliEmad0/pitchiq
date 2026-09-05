import "server-only";
import { loadFixtures, loadStandings } from "@/data/loaders";
import { historicalSchedule } from "../domain/classic-season";
import { seasonTable } from "../domain/season";
import { logger } from "@/utils/logger";

/** Build-time historical identity and target table. Never use all-era Legacy rivals here. */
export async function loadClassicSeason(season: number) {
  const [fixtures, standings] = await Promise.all([loadFixtures(season), loadStandings(season)]);
  if (!fixtures || !standings || standings.length === 0) return null;
  try {
    // Numeric identity is stable even if final ranking or source row order changes.
    const clubIds = standings.map((s) => s.teamId).sort((a, b) => a - b);
    if (new Set(clubIds).size !== clubIds.length) throw new Error("Duplicate historical club");
    const index = new Map(clubIds.map((id, i) => [id, i]));
    const schedule = historicalSchedule(
      clubIds.length,
      fixtures.map((f) => {
        if (f.homeScore == null || f.awayScore == null)
          throw new Error("Unplayed historical fixture");
        return {
          id: f.id,
          date: f.date,
          home: index.get(f.homeTeamId) ?? -1,
          away: index.get(f.awayTeamId) ?? -1,
          homeGoals: f.homeScore,
          awayGoals: f.awayScore,
        };
      }),
    );
    // week/seed are not read by the shared table arithmetic; these are historical scores,
    // not replayable simulation results and must never be persisted as SeasonResult records.
    const derived = seasonTable(
      clubIds.length,
      schedule.fixtures.map((f) => ({ ...f, week: 0, seed: 0 })),
    );
    const table = standings
      .map((s) => {
        const row = derived.find((r) => r.club === index.get(s.teamId))!;
        if (
          row.played !== s.played ||
          row.won !== s.won ||
          row.drawn !== s.drawn ||
          row.lost !== s.lost ||
          row.goalsFor !== s.goalsFor ||
          row.goalsAgainst !== s.goalsAgainst ||
          row.goalDifference !== s.goalsDiff
        )
          throw new Error("Historical standings disagree with fixtures");
        // Preserve published points/rank: future snapshots may include point deductions.
        return { ...row, points: s.points, rank: s.rank, pointsAdjustment: s.points - row.points };
      })
      .sort((a, b) => a.rank - b.rank);
    return { season, clubIds, schedule, table };
  } catch (error) {
    logger.warn("Classic season archive rejected", { season, error: String(error) });
    return null;
  }
}
