import { describe, expect, it } from "vitest";
import type { GamePlayer } from "@/features/game/domain/player";
import {
  calibrateK,
  goalChance,
  minuteWeight,
  pickBooked,
  pickScorer,
  weightedIndex,
} from "@/features/game/domain/minute-model";

describe("minuteWeight", () => {
  it("raises hazard in the stoppage windows", () => {
    expect(minuteWeight(45)).toBeGreaterThan(minuteWeight(20));
    expect(minuteWeight(90)).toBeGreaterThan(minuteWeight(60));
  });
});

describe("calibration", () => {
  it("k makes two equal teams score ≈ target total", () => {
    const target = 2.7;
    const k = calibrateK(target);
    let total = 0;
    for (let m = 1; m <= 90; m++) total += 2 * goalChance(50, 50, m, k); // both sides
    expect(total).toBeCloseTo(target, 5);
  });
  it("a stronger attack out-scores a weaker one at the same minute", () => {
    const k = calibrateK(2.7);
    expect(goalChance(90, 20, 50, k)).toBeGreaterThan(goalChance(20, 90, 50, k));
  });
});

describe("weightedIndex", () => {
  it("selects by cumulative weight", () => {
    expect(weightedIndex([1, 0, 0], 0.5)).toBe(0);
    expect(weightedIndex([0, 0, 1], 0.5)).toBe(2);
  });
  it("falls back to uniform when all weights are 0", () => {
    expect(weightedIndex([0, 0, 0], 0.99)).toBe(2);
  });
});

describe("selection", () => {
  const mk = (playerId: number, role: GamePlayer["role"]): GamePlayer => ({
    cardId: `${playerId}@2020`,
    playerId,
    season: 2020,
    name: `P${playerId}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 50 },
  });
  it("pickScorer returns a player (or null for empty XI)", () => {
    expect(pickScorer([mk(1, "CF"), mk(2, "CB")], () => 0.1)).not.toBeNull();
    expect(pickScorer([], () => 0.1)).toBeNull();
  });
  it("pickScorer never attributes a goal to the goalkeeper", () => {
    const xi = [mk(1, "GK"), mk(2, "CB"), mk(3, "CM"), mk(4, "CF")];
    for (let i = 0; i < 200; i++) {
      const scorer = pickScorer(xi, () => i / 200);
      expect(scorer?.role).not.toBe("GK");
    }
  });
  it("pickBooked returns a player", () => {
    expect(pickBooked([mk(1, "CF"), mk(2, "CB")], () => 0.9)).not.toBeNull();
  });
});
