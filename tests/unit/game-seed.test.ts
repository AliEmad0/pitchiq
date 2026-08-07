import { describe, expect, it } from "vitest";
import { randomSeed } from "@/features/game/view/seed";

// The match engine stays deterministic from its seed (TASK-1803); CHOOSING the
// seed is a view-layer concern, which is why this lives outside `domain/`.
describe("randomSeed", () => {
  it("is a uint32 for the extremes of the random source", () => {
    for (const r of [0, 0.5, 0.999999]) {
      const seed = randomSeed(() => r);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("maps distinct random draws to distinct seeds", () => {
    const seeds = new Set([0.1, 0.2, 0.3, 0.4, 0.5].map((r) => randomSeed(() => r)));
    expect(seeds.size).toBe(5);
  });

  it("spreads across the seed space rather than clustering", () => {
    // A naive `Math.floor(rand() * 1000)` would put every draw in a tiny band and
    // make consecutive visitors' drafts feel similar.
    expect(randomSeed(() => 0.01)).toBeLessThan(0x10000000);
    expect(randomSeed(() => 0.99)).toBeGreaterThan(0xf0000000);
  });

  it("defaults to Math.random and yields varied seeds across calls", () => {
    const seeds = new Set(Array.from({ length: 50 }, () => randomSeed()));
    expect(seeds.size).toBeGreaterThan(45);
  });
});
