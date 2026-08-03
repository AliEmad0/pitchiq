import { describe, expect, it } from "vitest";
import { percentileRank } from "@/features/game/domain/percentile";

describe("percentileRank", () => {
  it("ranks the max at 1 and the min low", () => {
    const pool = [0, 10, 20, 30, 40];
    expect(percentileRank(40, pool)).toBe(1); // 5/5 ≤ 40
    expect(percentileRank(0, pool)).toBeCloseTo(0.2); // 1/5 ≤ 0
  });

  it("is the fraction of the pool ≤ value", () => {
    expect(percentileRank(25, [10, 20, 30, 40])).toBeCloseTo(0.5); // 2/4
  });

  it("returns 0 for an empty pool", () => {
    expect(percentileRank(5, [])).toBe(0);
  });
});
