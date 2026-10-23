import { describe, expect, it } from "vitest";
import {
  type CareerEntry,
  careerEntry,
  modeOfKey,
  recordsSummary,
} from "@/features/game/domain/records";

/**
 * TASK-1812 — the Records page reads a coach's career back.
 *
 * ⛔ Two sources, never both for the same thing: the daily challenge and the Weekly Ladder keep
 * their WHOLE history in their own stores, so they are read from there; everything else is the
 * career log `recordFullTime` writes from now on. A key in both would count twice.
 */
const match = (
  key: string,
  at: number,
  gf: number,
  ga: number,
  context = "A v B",
): CareerEntry => ({
  kind: "match",
  key,
  at,
  day: "2026-10-23",
  mode: modeOfKey(key)!,
  gf,
  ga,
  context,
});

describe("the career log entry", () => {
  it("⭐ a played match becomes a scored entry, its mode read off the key", () => {
    const e = careerEntry(
      {
        key: "m:/game/legacy/7:123",
        day: "2026-10-23",
        context: "Your XI 3–1 Arsenal",
        facts: { match: { for: 3, against: 1, won: true } as never },
      },
      1000,
    );
    expect(e).toEqual({
      kind: "match",
      key: "m:/game/legacy/7:123",
      at: 1000,
      day: "2026-10-23",
      mode: "legacy",
      gf: 3,
      ga: 1,
      context: "Your XI 3–1 Arsenal",
    });
  });

  it("⭐ a finished run keeps where it ended, read off its one wording", () => {
    const e = careerEntry(
      {
        key: "r:991",
        day: "2026-10-23",
        context: "Coach · 2/20",
        facts: { season: { kind: "league", won: false, unbeaten: false, complete: true } },
      },
      5,
    );
    expect(e).toMatchObject({ kind: "run", mode: "season", position: 2, clubs: 20, won: false });
  });

  it("⛔ the daily and the ladder are NOT logged — their own stores hold every day", () => {
    for (const key of ["d:2026-10-23", "l:2026-W43:3", "b:2026-10-23"]) {
      expect(
        careerEntry(
          {
            key,
            day: "2026-10-23",
            context: "",
            facts: { match: { for: 1, against: 0 } as never },
          },
          1,
        ),
      ).toBeNull();
    }
  });

  it("modes come from every key family", () => {
    expect(modeOfKey("m:/game/draft:5")).toBe("draft");
    expect(modeOfKey("m:/en/game/budget:5")).toBe("budget");
    expect(modeOfKey("s:9:3")).toBe("season");
    expect(modeOfKey("c:2003:77")).toBe("classic");
    expect(modeOfKey("k:4:2")).toBe("market");
    expect(modeOfKey("w:2000-sou-liv:7")).toBe("whatIf");
    expect(modeOfKey("x:nope")).toBeNull();
  });
});

describe("the records summary", () => {
  const career: CareerEntry[] = [
    match("m:/game/draft:1", 1, 2, 0),
    match("m:/game/draft:2", 2, 1, 1),
    match("s:9:0", 3, 5, 0, "Biggest"),
    match("s:9:1", 4, 0, 1),
    match("k:4:1", 5, 3, 2),
    {
      kind: "run",
      key: "r:9",
      at: 6,
      day: "2026-10-23",
      mode: "season",
      position: 3,
      clubs: 20,
      won: false,
      unbeaten: false,
      context: "3/20",
    },
    {
      kind: "run",
      key: "r:8",
      at: 7,
      day: "2026-10-23",
      mode: "season",
      position: 1,
      clubs: 20,
      won: true,
      unbeaten: true,
      context: "1/20",
    },
  ];

  it("⭐ totals, biggest win and the longest unbeaten run, IN ORDER PLAYED", () => {
    const s = recordsSummary(
      { career: [...career].reverse(), daily: [], weekly: [], marketBest: null, whatIf: [] },
      "2026-10-23",
      "2026-W43",
    );
    expect(s.totals).toEqual({ played: 5, won: 3, drawn: 1, lost: 1, gf: 11, ga: 4 });
    expect(s.biggestWin).toMatchObject({ gf: 5, ga: 0, context: "Biggest" });
    // W D W | L | W — the first three are unbeaten.
    expect(s.longestUnbeaten).toBe(3);
    expect(s.form.map((f) => f.result)).toEqual(["W", "D", "W", "L", "W"]);
    // The fixture list reads newest first.
    expect(s.recent.map((m) => m.key)).toEqual([
      "k:4:1",
      "s:9:1",
      "s:9:0",
      "m:/game/draft:2",
      "m:/game/draft:1",
    ]);
  });

  it("⭐ the best run is the best FINISH, champions first", () => {
    const s = recordsSummary(
      { career, daily: [], weekly: [], marketBest: null, whatIf: [] },
      "2026-10-23",
      "2026-W43",
    );
    expect(s.bestRun).toMatchObject({ key: "r:8", position: 1 });
    expect(s.runs).toHaveLength(2);
    expect(s.byMode.find((m) => m.mode === "draft")).toEqual({
      mode: "draft",
      played: 2,
      won: 1,
      drawn: 1,
      lost: 0,
    });
  });

  it("⭐ daily, ladder, market and What-If come from their own stores", () => {
    const s = recordsSummary(
      {
        career: [],
        daily: [
          { day: "2026-10-22", done: true, score: { home: 2, away: 0 } },
          { day: "2026-10-23", done: true, score: { home: 1, away: 1 } },
        ],
        weekly: [{ week: "2026-W43", done: true, position: 1, points: 18 }],
        marketBest: { wins: 7, rounds: 9 },
        whatIf: [{ verdict: "rewrote" }, { verdict: "repeated" }],
      },
      "2026-10-23",
      "2026-W43",
    );
    expect(s.daily).toMatchObject({ played: 2, won: 1 });
    expect(s.ladder).toMatchObject({ weeks: 1, titles: 1, bestFinish: 1 });
    expect(s.marketBest).toEqual({ wins: 7, rounds: 9 });
    expect(s.whatIfRewritten).toBe(1);
    expect(s.whatIfPlayed).toBe(2);
    expect(s.since).toBe("2026-10-22");
    // A daily match counts in the career totals as well — it is a match he played.
    expect(s.totals.played).toBe(2);
  });

  it("an empty career is all zeroes and nulls, never a crash", () => {
    const s = recordsSummary(
      { career: [], daily: [], weekly: [], marketBest: null, whatIf: [] },
      "2026-10-23",
      "2026-W43",
    );
    expect(s.totals.played).toBe(0);
    expect(s.biggestWin).toBeNull();
    expect(s.bestRun).toBeNull();
    expect(s.longestUnbeaten).toBe(0);
    expect(s.empty).toBe(true);
  });
});
