import { describe, expect, it } from "vitest";
import { loadClassicSeason } from "@/features/game/adapter/classic-season";
import { compareHistoricalRun } from "@/features/game/domain/classic-season";

describe("committed Classic archive", () => {
  it.each(Array.from({ length: 34 }, (_, i) => 1992 + i))(
    "%i has a complete historical league that reconciles with its table",
    async (year) => {
      const data = await loadClassicSeason(year);
      expect(data).not.toBeNull();
      const { clubIds, schedule, table } = data!;
      const clubs = year <= 1994 ? 22 : 20;
      expect(clubIds).toHaveLength(clubs);
      expect(schedule.fixtures).toHaveLength(clubs * (clubs - 1));
      expect(table).toHaveLength(clubs);
      for (const row of table) {
        const played = schedule.fixtures
          .filter((f) => f.home === row.club || f.away === row.club)
          .map((f) => ({ fixtureId: f.id, homeGoals: f.homeGoals, awayGoals: f.awayGoals }));
        const ghost = compareHistoricalRun(schedule, row.club, played);
        expect(ghost.total).toBe(2 * (clubs - 1));
        expect(ghost.complete).toBe(true);
        expect(ghost.pointsDelta).toBe(0);
        expect(ghost.points + row.pointsAdjustment).toBe(row.points);
      }
    },
  );
  it("pins the Invincibles opener, chronological run and final 90-point target", async () => {
    const data = (await loadClassicSeason(2003))!;
    expect(data).not.toBeNull();
    const coach = data.clubIds.indexOf(42);
    const fixtures = data.schedule.fixtures.filter((f) => f.home === coach || f.away === coach);
    expect(fixtures[0]).toMatchObject({
      id: "2003-08-16-ARS-EVE",
      home: coach,
      homeGoals: 2,
      awayGoals: 1,
    });
    expect(data.table.find((r) => r.club === coach)).toMatchObject({
      rank: 1,
      points: 90,
      won: 26,
      drawn: 12,
      lost: 0,
      played: 38,
    });
  });
});
