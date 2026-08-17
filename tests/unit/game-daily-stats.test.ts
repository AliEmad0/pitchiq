import { describe, expect, it } from "vitest";
import { computeStats, type DailyOutcome } from "@/features/game/domain/daily-stats";

/** A finished day. `[day, gf, ga]`. */
const done = (day: string, gf: number, ga: number): DailyOutcome => ({
  day,
  done: true,
  score: { home: gf, away: ga },
});

describe("computeStats", () => {
  it("counts only finished days", () => {
    const s = computeStats(
      [done("2026-08-17", 2, 0), { day: "2026-08-18", done: false }],
      "2026-08-18",
    );
    expect(s.played).toBe(1);
    expect(s.won).toBe(1);
  });

  it("counts a streak of consecutive wins ending today", () => {
    const s = computeStats(
      [
        done("2026-08-15", 1, 0),
        done("2026-08-16", 3, 1),
        done("2026-08-17", 2, 2),
        done("2026-08-18", 1, 0),
      ],
      "2026-08-18",
    );
    // The draw on the 17th breaks it, so only the 18th counts.
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(2);
  });

  it("⚠️ a DRAW breaks the streak", () => {
    const s = computeStats([done("2026-08-17", 1, 1)], "2026-08-17");
    expect(s.currentStreak).toBe(0);
  });

  it("⚠️ an UNPLAYED day breaks the streak", () => {
    // 16th won, 17th never played, 18th won → the streak is 1, not 2.
    const s = computeStats([done("2026-08-16", 1, 0), done("2026-08-18", 1, 0)], "2026-08-18");
    expect(s.currentStreak).toBe(1);
  });

  it("⚠️ shows yesterday's streak when today is not yet played", () => {
    // Otherwise an untouched morning reads as "streak 0" and looks like a loss.
    const s = computeStats([done("2026-08-16", 1, 0), done("2026-08-17", 2, 0)], "2026-08-18");
    expect(s.currentStreak).toBe(2);
  });

  it("keeps the best streak after it breaks", () => {
    const s = computeStats(
      [
        done("2026-08-11", 1, 0),
        done("2026-08-12", 1, 0),
        done("2026-08-13", 1, 0),
        done("2026-08-14", 0, 1),
      ],
      "2026-08-14",
    );
    expect(s.currentStreak).toBe(0);
    expect(s.bestStreak).toBe(3);
  });

  it("tracks the biggest winning margin only", () => {
    const s = computeStats([done("2026-08-16", 5, 1), done("2026-08-17", 0, 4)], "2026-08-17");
    expect(s.bestMargin).toBe(4);
  });

  it("is empty-safe", () => {
    expect(computeStats([], "2026-08-17")).toEqual({
      played: 0,
      won: 0,
      currentStreak: 0,
      bestStreak: 0,
      bestMargin: 0,
    });
  });
});
