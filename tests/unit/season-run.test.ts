import { describe, expect, it } from "vitest";
import {
  fixtureSeed,
  isComplete,
  nextWeek,
  recordResult,
  type SeasonRun,
} from "@/features/game/domain/season";

const run = (): SeasonRun => ({ seed: 4242, clubs: 20, coach: 0, results: [] });
const res = (week: number, home: number, away: number, hg = 1, ag = 0) => ({
  week,
  home,
  away,
  homeGoals: hg,
  awayGoals: ag,
  seed: 7,
});

describe("the run", () => {
  it("⛔ a fixture's seed is DERIVED, so nothing extra is stored and any match re-watches", () => {
    expect(fixtureSeed(4242, 0, 0)).toBe(fixtureSeed(4242, 0, 0));
    expect(fixtureSeed(4242, 0, 0)).not.toBe(fixtureSeed(4242, 0, 1));
    expect(fixtureSeed(4242, 0, 0)).not.toBe(fixtureSeed(4242, 1, 0));
    expect(fixtureSeed(4243, 0, 0)).not.toBe(fixtureSeed(4242, 0, 0));
  });

  it("⚠️ derived seeds SPREAD, because near mulberry32 seeds draw alike", () => {
    // `view/seed.ts` says so explicitly, which is why this hashes rather than adds.
    const a = fixtureSeed(4242, 0, 0);
    const b = fixtureSeed(4242, 1, 0);
    expect(Math.abs(a - b)).toBeGreaterThan(1000);
    for (const s of [a, b]) {
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("⛔ no two fixtures in a whole season share a seed", () => {
    const seen = new Set<number>();
    for (let w = 0; w < 38; w++) for (let i = 0; i < 10; i++) seen.add(fixtureSeed(4242, w, i));
    expect(seen.size).toBe(380);
  });

  it("nextWeek is the count of weeks already played", () => {
    expect(nextWeek(run())).toBe(0);
    expect(nextWeek(recordResult(run(), res(0, 0, 1)))).toBe(1);
  });

  it("⛔ recordResult is APPEND-ONLY and never mutates the run it was given", () => {
    const before = run();
    const after = recordResult(before, res(0, 0, 1));
    expect(before.results).toHaveLength(0);
    expect(after.results).toHaveLength(1);
    expect(after).not.toBe(before);
  });

  it("⛔ REJECTS a duplicate fixture — a replayed week must not double-count", () => {
    const one = recordResult(run(), res(0, 0, 1));
    expect(() => recordResult(one, res(0, 0, 1, 3, 3))).toThrow(/already/i);
  });

  it("⚠️ REJECTS a club outside the league rather than growing the table", () => {
    expect(() => recordResult(run(), res(0, 0, 99))).toThrow(/league/i);
  });

  it("knows when the season is over", () => {
    let r = run();
    expect(isComplete(r)).toBe(false);
    for (let w = 0; w < 38; w++) {
      for (let i = 0; i < 10; i++) r = recordResult(r, res(w, i * 2, i * 2 + 1));
    }
    expect(r.results).toHaveLength(380);
    expect(isComplete(r)).toBe(true);
  });
});
