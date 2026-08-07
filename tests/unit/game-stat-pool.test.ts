import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import {
  MIN_MINUTES,
  buildPools,
  dimOf,
  minutesOf,
  per90,
  pctile,
  successRate,
} from "@/features/game/domain/stat-pool";

const player = (metrics: Record<string, unknown>): Player =>
  ({
    id: 1,
    name: "P",
    teamId: 1,
    teamName: "T",
    position: "Midfielder",
    metrics,
  }) as unknown as Player;

describe("minutesOf", () => {
  it("prefers extended.minutesPlayed", () => {
    expect(minutesOf(player({ appearances: 10, extended: { minutesPlayed: 900 } }))).toBe(900);
  });
  it("falls back to appearances x 90 for the pre-2004 eras", () => {
    expect(minutesOf(player({ appearances: 10 }))).toBe(900);
  });
  it("is 0 when neither is present", () => {
    expect(minutesOf(player({}))).toBe(0);
  });
});

describe("per90", () => {
  it("scales a counting stat to 90 minutes", () => {
    expect(per90(5, 900)).toBeCloseTo(0.5);
  });
  it("is null for a null value or zero minutes", () => {
    expect(per90(null, 900)).toBeNull();
    expect(per90(5, 0)).toBeNull();
  });
});

describe("successRate", () => {
  it("divides by won + lost, never by a separate total", () => {
    // Van Dijk '18: 175 won, 76 lost -> 69.7%. The `duels` field (321) is NOT the
    // denominator; using it would report 54.5%.
    expect(successRate(175, 76)).toBeCloseTo(69.72, 1);
  });
  it("is null when either side is missing or nothing was resolved", () => {
    expect(successRate(175, null)).toBeNull();
    expect(successRate(null, 76)).toBeNull();
    expect(successRate(0, 0)).toBeNull();
  });
});

describe("pctile", () => {
  it("puts a block of tied values in the MIDDLE of the block", () => {
    // 6 zeros then 4 higher values: a zero ranks at 3/10, not 6/10. Counting
    // `x <= value` gave every 0-goal player the whole zero block — the mechanism
    // behind Van der Sar rating ATT 100.
    expect(pctile(0, [0, 0, 0, 0, 0, 0, 1, 2, 3, 4])).toBeCloseTo(0.3);
  });
  it("ranks the maximum near the top", () => {
    expect(pctile(4, [0, 1, 2, 3, 4])).toBeCloseTo(0.9);
  });
  it("is 0 for an empty pool", () => {
    expect(pctile(5, [])).toBe(0);
  });
});

describe("buildPools", () => {
  it("excludes players below the minutes floor", () => {
    const bags = [
      { minutes: MIN_MINUTES, goals90: 1 },
      { minutes: MIN_MINUTES - 1, goals90: 99 },
    ];
    expect(buildPools(bags, ["goals90"]).goals90).toEqual([1]);
  });
  it("skips null stats without dropping the player from other pools", () => {
    const bags = [
      { minutes: 900, goals90: 1, xg90: null },
      { minutes: 900, goals90: 2, xg90: 5 },
    ];
    const pools = buildPools(bags, ["goals90", "xg90"]);
    expect(pools.goals90).toEqual([1, 2]);
    expect(pools.xg90).toEqual([5]);
  });
});

describe("dimOf", () => {
  const pools = { a: [0, 1, 2, 3], b: [0, 1, 2, 3] };

  it("is a weighted mean of each present part's percentile, scaled to 0-100", () => {
    // a=3 -> 0.875, b=0 -> 0.125; weights 3:1 -> 0.6875 -> 68.75
    expect(
      dimOf({ minutes: 900, a: 3, b: 0 }, pools, [
        ["a", 3],
        ["b", 1],
      ]),
    ).toBeCloseTo(68.75);
  });

  it("renormalises over the parts that are present", () => {
    expect(
      dimOf({ minutes: 900, a: 3, b: null }, pools, [
        ["a", 3],
        ["b", 1],
      ]),
    ).toBeCloseTo(87.5);
  });

  it("is null when no part has data", () => {
    expect(dimOf({ minutes: 900, a: null }, { a: [1] }, [["a", 1]])).toBeNull();
  });

  it("is null when the referenced pool is empty", () => {
    expect(dimOf({ minutes: 900, a: 3 }, { a: [] }, [["a", 1]])).toBeNull();
  });
});
