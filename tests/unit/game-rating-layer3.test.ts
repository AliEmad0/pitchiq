import { describe, expect, it } from "vitest";
import {
  MAX_BOOST,
  ROLE_AMPLIFIERS,
  SCALE_CEILING,
  achievementBoost,
  amplifyUnanchored,
} from "@/features/game/domain/rating-achievement";

/**
 * TASK-1821 Layer 3 — team achievement + the un-anchored role amplifier.
 *
 * Two measured constraints shaped this, both found by running the model rather than
 * reasoning about it:
 *
 * 1. **The amplifier must not multiply the rating.** `overall * 1.2` corrects a role's
 *    MEDIAN but inflates its TOP — it put Steve Staunton, Nigel Winterburn, Ian Harte
 *    and Hugo Lloris on 100. It multiplies the DISTANCE BELOW the ceiling instead, so
 *    the cohort is pulled toward the ceiling without ever reaching it. That is PR #99's
 *    exact failure re-encountered in a gentler form, and the reason the clamp alone
 *    (0.8–1.2) was never sufficient protection.
 *
 * 2. **An upward boost is incompatible with the saturation gate unless the anchors make
 *    room.** The ≥93 share was already 0.96% against a 1% limit, so ANY top-four boost
 *    breached it regardless of how it was scaled. Dropping the tier bases by 3 (Layer 1)
 *    frees the headroom: the share falls to 0.67% and the top spreads over 93/94/95.
 */

describe("achievementBoost", () => {
  const FULL = 3420;

  it("gives champions the full boost", () => {
    expect(achievementBoost(1, FULL)).toBe(4);
  });

  it("gives runners-up slightly less", () => {
    expect(achievementBoost(2, FULL)).toBe(3);
  });

  it("gives the rest of the top four a small boost", () => {
    expect(achievementBoost(3, FULL)).toBe(1.5);
    expect(achievementBoost(4, FULL)).toBe(1.5);
  });

  it("gives nothing below fourth", () => {
    expect(achievementBoost(5, FULL)).toBe(0);
    expect(achievementBoost(20, FULL)).toBe(0);
  });

  it("gives nothing when the team has no standing", () => {
    expect(achievementBoost(null, FULL)).toBe(0);
  });

  it("weights the boost by minutes, so a fringe champion earns little", () => {
    // Layer 1 learned this the hard way: flat silverware put squad players from
    // dynasty clubs above Shearer and Henry.
    expect(achievementBoost(1, FULL / 2)).toBe(2);
    expect(achievementBoost(1, 0)).toBe(0);
  });

  it("never exceeds the documented maximum", () => {
    for (const rank of [1, 2, 3, 4, 5, 10, 20]) {
      for (const mins of [0, 500, 1800, 3420, 5000]) {
        expect(achievementBoost(rank, mins)).toBeLessThanOrEqual(MAX_BOOST);
        expect(achievementBoost(rank, mins)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("amplifyUnanchored", () => {
  it("lifts a structurally capped role toward the ceiling", () => {
    // GK carries the largest lift (1.2): league-wide dimensions cap keepers hardest.
    const mid = amplifyUnanchored(50, "GK");
    expect(mid).toBeGreaterThan(50);
  });

  it("compresses a role the league-wide scale flatters", () => {
    expect(amplifyUnanchored(50, "CF")).toBeLessThan(50);
  });

  it("NEVER pushes a high rating past the scale ceiling", () => {
    // The defect this shape exists to prevent: a multiplicative amplifier put four
    // full-backs and a keeper on 100.
    for (const role of Object.keys(ROLE_AMPLIFIERS) as (keyof typeof ROLE_AMPLIFIERS)[]) {
      for (const v of [80, 88, 92, 94, 95]) {
        expect(amplifyUnanchored(v, role)).toBeLessThanOrEqual(SCALE_CEILING);
      }
    }
  });

  it("leaves a player already at the ceiling exactly where they are", () => {
    expect(amplifyUnanchored(SCALE_CEILING, "GK")).toBe(SCALE_CEILING);
  });

  it("is monotonic within a role, so nobody is reordered", () => {
    for (const role of Object.keys(ROLE_AMPLIFIERS) as (keyof typeof ROLE_AMPLIFIERS)[]) {
      let prev = Number.NEGATIVE_INFINITY;
      for (let v = 0; v <= 95; v += 5) {
        const out = amplifyUnanchored(v, role);
        expect(out).toBeGreaterThanOrEqual(prev);
        prev = out;
      }
    }
  });

  it("keeps every amplifier inside the hard 0.8-1.2 clamp", () => {
    // The floor whose ABSENCE caused the PR #100 revert (amplification ran to 5.0x).
    for (const f of Object.values(ROLE_AMPLIFIERS)) {
      expect(f).toBeGreaterThanOrEqual(0.8);
      expect(f).toBeLessThanOrEqual(1.2);
    }
  });

  it("covers every role the game can field", () => {
    for (const role of [
      "GK",
      "RB",
      "LB",
      "CB",
      "CDM",
      "CM",
      "CAM",
      "RM",
      "LM",
      "RW",
      "LW",
      "SS",
      "CF",
    ]) {
      expect(ROLE_AMPLIFIERS[role as keyof typeof ROLE_AMPLIFIERS]).toBeGreaterThan(0);
    }
  });
});
