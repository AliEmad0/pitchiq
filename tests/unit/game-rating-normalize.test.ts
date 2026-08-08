import { describe, expect, it } from "vitest";
import { quantileOf } from "@/features/game/domain/stat-pool";

describe("quantileOf", () => {
  const sorted = [50, 60, 70, 80, 90];

  it("maps 0 to the floor and 1 to the ceiling of the distribution", () => {
    expect(quantileOf(sorted, 0)).toBe(50);
    expect(quantileOf(sorted, 1)).toBe(90);
  });

  it("maps the midpoint to the median", () => {
    expect(quantileOf(sorted, 0.5)).toBe(70);
  });

  it("interpolates between samples", () => {
    expect(quantileOf(sorted, 0.125)).toBeCloseTo(55);
  });

  it("is safe on an empty distribution", () => {
    expect(quantileOf([], 0.5)).toBeNull();
  });
});
