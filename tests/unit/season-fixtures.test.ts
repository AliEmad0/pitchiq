import { describe, expect, it } from "vitest";
import { seasonFixtures } from "@/features/game/domain/season";

describe("seasonFixtures", () => {
  it("plays every opponent twice over 2(n-1) weeks", () => {
    const weeks = seasonFixtures(20);
    expect(weeks).toHaveLength(38);
    for (const w of weeks) expect(w).toHaveLength(10);
  });

  it("⛔ no club appears twice in the same week", () => {
    for (const week of seasonFixtures(20)) {
      const seen = week.flatMap(([h, a]) => [h, a]);
      expect(new Set(seen).size).toBe(seen.length);
    }
  });

  it("⛔ every ordered pairing occurs EXACTLY once — home and away, never repeated", () => {
    const seen = new Map<string, number>();
    for (const week of seasonFixtures(20)) {
      for (const [h, a] of week) seen.set(`${h}v${a}`, (seen.get(`${h}v${a}`) ?? 0) + 1);
    }
    expect(seen.size).toBe(20 * 19); // every ordered pair
    for (const count of seen.values()) expect(count).toBe(1);
  });

  it("gives every club an equal split of home and away", () => {
    const home = new Array(20).fill(0);
    for (const week of seasonFixtures(20)) for (const [h] of week) home[h]++;
    for (const n of home) expect(n).toBe(19);
  });

  it("works for any even club count", () => {
    expect(seasonFixtures(4)).toHaveLength(6);
    expect(seasonFixtures(4).flat()).toHaveLength(12);
  });

  it("⚠️ REJECTS an odd count rather than silently dropping a club", () => {
    expect(() => seasonFixtures(19)).toThrow(/even/i);
    expect(() => seasonFixtures(0)).toThrow();
  });
});
