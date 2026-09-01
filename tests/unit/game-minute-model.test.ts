import { describe, expect, it } from "vitest";
import type { GamePlayer } from "@/features/game/domain/player";
import {
  POWER_EXPONENT,
  calibrateK,
  goalChance,
  minuteWeight,
  pickBooked,
  pickScorer,
  weightedIndex,
} from "@/features/game/domain/minute-model";

describe("the power exponent (TASK-1844)", () => {
  it("⛔ EQUAL SIDES are exactly even at any exponent — what keeps calibrateK valid", () => {
    for (const p of [1, 2, 8, 12, 30]) {
      expect(goalChance(80, 80, 45, 1, p) / minuteWeight(45)).toBeCloseTo(0.5, 12);
    }
  });

  it("is MONOTONE — a bigger exponent rewards the stronger side more", () => {
    const at = (p: number) => goalChance(92, 70, 45, 1, p) / minuteWeight(45);
    expect(at(1)).toBeGreaterThan(0.5);
    expect(at(4)).toBeGreaterThan(at(1));
    expect(at(12)).toBeGreaterThan(at(4));
  });

  it("stays BOUNDED in [0,1] even at absurd inputs", () => {
    // ⚠️ INCLUSIVE, deliberately. At p = 40 against a defence of 1, 100^40/(100^40 + 1)
    // saturates to exactly 1 in floating point. That is harmless — the edge is a multiplier on
    // an already-small per-minute rate, so it cannot produce a probability above k — but the
    // bound is [0,1], not (0,1), and a strict assertion here would be asserting a falsehood.
    for (const [a, d, p] of [
      [100, 1, 40],
      [1, 100, 40],
      [50, 50, 30],
    ] as Array<[number, number, number]>) {
      const edge = goalChance(a, d, 45, 1, p) / minuteWeight(45);
      expect(edge).toBeGreaterThanOrEqual(0);
      expect(edge).toBeLessThanOrEqual(1);
      expect(Number.isFinite(edge)).toBe(true);
    }
  });

  it("⛔ across the REAL rating range, the weaker side is never shut out", () => {
    // The gameplay guard that matters: at any exponent we would actually ship, over the widest
    // squad gap the archive holds (92.7 v 69.8), BOTH sides must still create chances. An edge
    // that rounds to 0 for the underdog is a match nobody can come back in — and comebacks are
    // pinned at > 7% by `game-match-harness.test.ts`.
    for (const p of [1, 8, 12, 16, 20]) {
      const underdog = goalChance(70, 93, 45, 1, p) / minuteWeight(45);
      expect(underdog).toBeGreaterThan(0.001);
    }
  });

  it("⚠️ p = 1 reproduces the shipped ratio EXACTLY — the refactor is inert", () => {
    const cases: Array<[number, number]> = [
      [92, 70],
      [50, 50],
      [70, 92],
      [88, 61],
    ];
    for (const [a, d] of cases) {
      expect(goalChance(a, d, 45, 1, 1) / minuteWeight(45)).toBeCloseTo(a / (a + d), 12);
    }
  });

  it("defaults to POWER_EXPONENT when none is passed", () => {
    expect(goalChance(92, 70, 45, 1)).toBeCloseTo(goalChance(92, 70, 45, 1, POWER_EXPONENT), 12);
  });
});

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
