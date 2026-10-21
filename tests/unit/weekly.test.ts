import { describe, expect, it } from "vitest";
import {
  isoWeekday,
  isoWeekKey,
  LADDER_CLUBS,
  LADDER_DAYS,
  ladderFixtures,
  ladderRivals,
  ladderStats,
  unlockedDays,
  WEEKLY_RULES,
  weekFormation,
  weekKeyOffset,
  weekNumber,
  weekRule,
} from "@/features/game/domain/weekly";

/** TASK-1828 — everything about a ladder week, from the week alone. */
describe("ISO weeks (UTC)", () => {
  it("names the ISO week, including the year-boundary cases", () => {
    expect(isoWeekKey(new Date("2026-10-21T12:00:00Z"))).toBe("2026-W43");
    expect(isoWeekKey(new Date("2026-10-19T00:00:00Z"))).toBe("2026-W43"); // Monday
    expect(isoWeekKey(new Date("2026-10-25T23:59:59Z"))).toBe("2026-W43"); // Sunday
    expect(isoWeekKey(new Date("2026-10-26T00:00:00Z"))).toBe("2026-W44");
    expect(isoWeekKey(new Date("2025-12-29T00:00:00Z"))).toBe("2026-W01");
    expect(isoWeekKey(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
    expect(isoWeekKey(new Date("2021-01-03T00:00:00Z"))).toBe("2020-W53");
  });

  it("⚠️ uses UTC, not the local clock: one instant is one week everywhere", () => {
    // Sunday 23:30 UTC is still W43, whatever the machine's zone says it is locally.
    expect(isoWeekKey(new Date("2026-10-25T23:30:00Z"))).toBe("2026-W43");
    expect(isoWeekday(new Date("2026-10-25T23:30:00Z"))).toBe(7);
    expect(isoWeekday(new Date("2026-10-19T00:00:00Z"))).toBe(1);
  });

  it("steps whole weeks across a year boundary", () => {
    expect(weekKeyOffset("2026-W53", 1)).toBe("2027-W01");
    expect(weekKeyOffset("2027-W01", -1)).toBe("2026-W53");
    expect(weekKeyOffset("2026-W43", -43)).toBe("2025-W52");
  });

  it("numbers weeks from the epoch, never below one", () => {
    expect(weekNumber("2026-W43")).toBe(1);
    expect(weekNumber("2026-W44")).toBe(2);
    expect(weekNumber("2026-W01")).toBe(1);
  });
});

describe("the week's ruleset", () => {
  it("⛔ WEEKLY_RULES is FROZEN — the pick is seed % length, so any edit re-maps every week", () => {
    expect(WEEKLY_RULES).toEqual([
      { id: "monsoon", conditions: { weather: "heavy-rain" } },
      { id: "ironRef", conditions: { referee: "strict" } },
      { id: "var", conditions: { varScale: 3 } },
      { id: "freeze", conditions: { weather: "snow" } },
      { id: "home", conditions: { referee: "crowd-influenced" } },
      { id: "gale", conditions: { weather: "wind" } },
      { id: "open", conditions: {} },
    ]);
  });

  it("is the same for everyone in a week, and varies across weeks", () => {
    expect(weekRule("2026-W43")).toBe(weekRule("2026-W43"));
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) seen.add(weekRule(weekKeyOffset("2026-W43", i)).id);
    expect(seen.size).toBeGreaterThanOrEqual(5);
    // The shape too.
    expect(weekFormation("2026-W43").name).toBe(weekFormation("2026-W43").name);
  });
});

describe("the league", () => {
  const clubs = Array.from({ length: 51 }, (_, i) => i + 1);

  it("draws seven distinct rivals, and the caller's order cannot change who", () => {
    const a = ladderRivals(clubs, "2026-W43");
    expect(a).toHaveLength(LADDER_DAYS);
    expect(new Set(a).size).toBe(LADDER_DAYS);
    expect(ladderRivals([...clubs].reverse(), "2026-W43")).toEqual(a);
    expect(ladderRivals(clubs, "2026-W44")).not.toEqual(a);
  });

  it("a single round robin: every club plays once a day and meets every other once", () => {
    const days = ladderFixtures();
    expect(days).toHaveLength(LADDER_DAYS);
    const pairs = new Set<string>();
    for (const day of days) {
      const clubsToday = day.flat();
      expect(new Set(clubsToday).size).toBe(LADDER_CLUBS);
      for (const [h, a] of day) pairs.add([h, a].sort().join("-"));
    }
    expect(pairs.size).toBe((LADDER_CLUBS * (LADDER_CLUBS - 1)) / 2);
  });

  it("opens one matchday per weekday; a past week is fully open, a future one shut", () => {
    expect(unlockedDays("2026-W43", "2026-W43", 1)).toBe(1);
    expect(unlockedDays("2026-W43", "2026-W43", 3)).toBe(3);
    expect(unlockedDays("2026-W43", "2026-W43", 7)).toBe(7);
    expect(unlockedDays("2026-W42", "2026-W43", 1)).toBe(7);
    expect(unlockedDays("2026-W44", "2026-W43", 7)).toBe(0);
  });
});

describe("personal bests", () => {
  const rec = (week: string, position: number, points = 12, done = true) => ({
    week,
    done,
    position,
    points,
  });

  it("derives titles, best finish, best points and the title streak", () => {
    const s = ladderStats(
      [rec("2026-W43", 2, 10), rec("2026-W44", 1, 16), rec("2026-W45", 1, 18)],
      "2026-W46",
    );
    expect(s).toEqual({
      weeks: 3,
      titles: 2,
      bestFinish: 1,
      bestPoints: 18,
      titleStreak: 2,
      bestTitleStreak: 2,
    });
  });

  it("⚠️ a week not played breaks the streak — the walk is through the calendar", () => {
    const s = ladderStats([rec("2026-W43", 1), rec("2026-W45", 1)], "2026-W45");
    expect(s.titleStreak).toBe(1);
    expect(s.bestTitleStreak).toBe(1);
  });

  it("an unfinished week counts for nothing yet", () => {
    const s = ladderStats([rec("2026-W43", 1, 3, false)], "2026-W43");
    expect(s).toMatchObject({ weeks: 0, titles: 0, bestFinish: null, titleStreak: 0 });
  });
});
