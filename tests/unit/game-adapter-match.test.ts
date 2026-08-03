import { describe, expect, it } from "vitest";
import { loadSeasonGoalRate, simulateSeasonMatch } from "@/features/game/adapter/match";

describe("loadSeasonGoalRate (committed standings)", () => {
  it("derives ~2.6–2.9 for a real season", async () => {
    const rate = await loadSeasonGoalRate(2020);
    expect(rate).toBeGreaterThan(2.4);
    expect(rate).toBeLessThan(3.0);
  });
  it("falls back to ~2.7 for an unsupported season", async () => {
    expect(await loadSeasonGoalRate(1800)).toBeCloseTo(2.7, 1);
  });
});

describe("simulateSeasonMatch (real rated squads)", () => {
  it("simulates a real fixture deterministically", async () => {
    const a = await simulateSeasonMatch(50, 42, 2020, 12345); // Man City vs Arsenal, 2020
    const b = await simulateSeasonMatch(50, 42, 2020, 12345);
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    expect(a!.score.home).toBeGreaterThanOrEqual(0);
  });
  it("returns null when a team is absent that season", async () => {
    expect(await simulateSeasonMatch(999999, 42, 2020, 1)).toBeNull();
  });
});
