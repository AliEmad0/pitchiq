import { describe, expect, it } from "vitest";
import { albumSeason } from "@/features/game/adapter/album-sets";

/**
 * TASK-1819 — a set is every rated card of one club-season, exactly the Classic pool, so every
 * set can be completed by playing that club's Classic season. Served as prerendered static JSON,
 * one file per season (no request-time work).
 */
describe("albumSeason", () => {
  it("Arsenal 2003/04: 22 stickers, Henry first", async () => {
    const s = (await albumSeason(2003))!;
    expect(s.season).toBe(2003);
    expect(s.clubs).toHaveLength(20);
    const ars = s.clubs.find((c) => c.teamId === 42)!;
    expect(ars.cards).toHaveLength(22);
    expect(ars.cards[0]!.n).toBe("Thierry Henry");
    const ovrs = ars.cards.map((c) => c.o);
    expect([...ovrs].sort((a, b) => b - a)).toEqual(ovrs);
  });

  it("all 34 seasons: 686 sets, 18,653 cards, each season small", async () => {
    let clubs = 0;
    let cards = 0;
    for (let y = 1992; y <= 2025; y++) {
      const s = (await albumSeason(y))!;
      clubs += s.clubs.length;
      cards += s.clubs.reduce((a, c) => a + c.cards.length, 0);
      expect(JSON.stringify(s).length, String(y)).toBeLessThanOrEqual(60_000);
    }
    expect(clubs).toBe(686);
    expect(cards).toBe(18_653);
  }, 240_000);
});
