import { describe, expect, it } from "vitest";
import type { GamePlayer } from "@/features/game/domain/player";
import {
  CONVERSION,
  POWER_EXPONENT,
  calibrateK,
  chanceRate,
  edgeShare,
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

describe("edgeShare normalisation (TASK-1844)", () => {
  /** The same fixture seen from each side. */
  const pair = (aAtt: number, aDef: number, bAtt: number, bDef: number) => [
    { attack: aAtt, defense: aDef, oppAttack: bAtt, oppDefense: bDef },
    { attack: bAtt, defense: bDef, oppAttack: aAtt, oppDefense: aDef },
  ];

  it("⛔ THE TWO SIDES ALWAYS SUM TO 1 — this is what keeps the goal rate fixed", () => {
    // Real leagues have attack and defence on DIFFERENT scales, and the offset flips sign by
    // season (measured: 57.8 v 49.2 in 2000, 53.8 v 57.1 in 2012). Every case below is one the
    // un-normalised edge got wrong.
    const cases: Array<[number, number, number, number]> = [
      [57.8, 49.2, 57.8, 49.2], // identical teams, attack > defence (2000-ish)
      [53.8, 57.1, 53.8, 57.1], // identical teams, defence > attack (2012-ish)
      [92, 88, 70, 62], // a real mismatch
      [50, 50, 50, 50], // the degenerate symmetric case
    ];
    for (const c of cases) {
      for (const p of [1, 8, 12, 16, 20]) {
        const [a, b] = pair(...c);
        expect(edgeShare(a!, p) + edgeShare(b!, p)).toBeCloseTo(1, 12);
      }
    }
  });

  it("⛔ two IDENTICAL teams split exactly evenly, whatever the attack/defence offset", () => {
    // The property my spec originally claimed for the RAW edge, which was false — a team's
    // attack and its defence are different numbers, so only the normalised share holds it.
    for (const [att, def] of [
      [57.8, 49.2],
      [53.8, 57.1],
      [80, 40],
    ]) {
      for (const p of [1, 12, 20]) {
        const [a] = pair(att!, def!, att!, def!);
        expect(edgeShare(a!, p)).toBeCloseTo(0.5, 12);
      }
    }
  });

  it("the stronger side takes the bigger share, and a bigger exponent widens it", () => {
    const [strong] = pair(92, 88, 70, 62);
    expect(edgeShare(strong!, 1)).toBeGreaterThan(0.5);
    expect(edgeShare(strong!, 12)).toBeGreaterThan(edgeShare(strong!, 1));
  });

  it("⚠️ the goal RATE is independent of the exponent — the harness band cannot drift", () => {
    // Expected goals for a side = target x share, so both sides together always come to the
    // season target no matter how steep the split is.
    const k = calibrateK(2.7);
    for (const p of [1, 8, 20]) {
      const [a, b] = pair(57.8, 49.2, 70, 62);
      let total = 0;
      for (let m = 1; m <= 90; m++) {
        total += chanceRate(a!, m, k, p) * CONVERSION + chanceRate(b!, m, k, p) * CONVERSION;
      }
      expect(total).toBeCloseTo(2.7, 6);
    }
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
