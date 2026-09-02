import { describe, expect, it } from "vitest";
import { loadStandings } from "@/data/loaders";
import { assembleGameTeam } from "@/features/game/adapter/lineup";
import {
  fixtureSeed,
  isComplete,
  recordResult,
  seasonFixtures,
  seasonTable,
  type SeasonRun,
} from "@/features/game/domain/season";
import { simulate } from "@/features/game/domain/simulate";
import type { GameTeam } from "@/features/game/domain/team";

/**
 * ⛔ THE TEST THAT MATTERS MOST for the season spine.
 *
 * Everything else in `domain/season.ts` is arithmetic over fixtures. This proves the spine
 * produces a LEAGUE — over real clubs, real squads, and the real match engine.
 */
const SEASON = 2015;

async function realLeague(count: number): Promise<GameTeam[]> {
  const rows = await loadStandings(SEASON);
  expect(rows).not.toBeNull();
  const teams: GameTeam[] = [];
  for (const row of rows!.slice(0, count)) {
    const team = await assembleGameTeam(row.teamId, SEASON);
    expect(team).not.toBeNull();
    teams.push(team!);
  }
  return teams;
}

describe("a simulated season behaves like a league", () => {
  it("⛔ plays all 380 fixtures and produces a real-shaped table", async () => {
    const teams = await realLeague(20);
    expect(teams).toHaveLength(20);

    let run: SeasonRun = { seed: 4242, clubs: 20, coach: 0, results: [] };
    const started = Date.now();
    seasonFixtures(20).forEach((week, w) => {
      week.forEach(([h, a], i) => {
        const seed = fixtureSeed(run.seed, w, i);
        const res = simulate({
          home: teams[h]!,
          away: teams[a]!,
          seed,
          targetGoalsPerMatch: 2.7,
        });
        run = recordResult(run, {
          week: w,
          home: h,
          away: a,
          homeGoals: res.score.home,
          awayGoals: res.score.away,
          seed,
        });
      });
    });
    const elapsed = Date.now() - started;

    expect(run.results).toHaveLength(380);
    expect(isComplete(run)).toBe(true);

    const table = seasonTable(20, run.results);
    expect(table).toHaveLength(20);
    for (const row of table) expect(row.played).toBe(38);

    // ⛔ CONSERVATION — the table must account for exactly what happened on the pitch.
    const draws = run.results.filter((r) => r.homeGoals === r.awayGoals).length;
    const points = table.reduce((a, r) => a + r.points, 0);
    expect(points).toBe((380 - draws) * 3 + draws * 2);
    const scored = run.results.reduce((a, r) => a + r.homeGoals + r.awayGoals, 0);
    expect(table.reduce((a, r) => a + r.goalsFor, 0)).toBe(scored);
    expect(table.reduce((a, r) => a + r.goalsAgainst, 0)).toBe(scored);
    expect(table.reduce((a, r) => a + r.goalDifference, 0)).toBe(0);

    /**
     * ⭐ REAL-SHAPED, not flat — and this is the alarm bell for TASK-1844.
     *
     * Before that calibration a simulated league came out at points SD ~8.4 against a real
     * 16.2: everyone finished mid-table and the season was a lottery. Fitted, it lands ~16.
     * If this assertion ever starts failing, the engine's `POWER_EXPONENT` has been reverted
     * or undone — fix that, do NOT relax this number.
     */
    const mean = points / 20;
    const sd = Math.sqrt(table.reduce((a, r) => a + (r.points - mean) ** 2, 0) / 20);
    expect(sd).toBeGreaterThan(9);

    console.log(
      `champion ${table[0]!.points} pts, bottom ${table[19]!.points} pts, SD ${sd.toFixed(1)}, ` +
        `${scored} goals (${(scored / 380).toFixed(2)}/match), ${elapsed}ms`,
    );
  }, 900_000);

  it("⛔ the SAME seed replays the SAME season, byte for byte", async () => {
    const teams = await realLeague(4);
    const play = (seed: number) =>
      seasonFixtures(4).flatMap((week, w) =>
        week.map(([h, a], i) => {
          const s = fixtureSeed(seed, w, i);
          const res = simulate({
            home: teams[h]!,
            away: teams[a]!,
            seed: s,
            targetGoalsPerMatch: 2.7,
          });
          return `${w}:${h}v${a}:${res.score.home}-${res.score.away}`;
        }),
      );
    expect(play(99)).toEqual(play(99));
    // ⚠️ And a DIFFERENT season seed gives a different season — otherwise the line above
    // would pass just as well over a constant.
    expect(play(99)).not.toEqual(play(100));
  }, 900_000);
});
