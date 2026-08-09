import { describe, expect, it } from "vitest";
import {
  FULL_DELTA_MINUTES,
  MAX_DELTA,
  anchorOf,
  applyAnchor,
  seasonDelta,
} from "@/features/game/domain/rating-anchor";

/**
 * TASK-1821 Layer 2 — the bounded season delta.
 *
 * The design says "statistics shift a player within ±6 of their anchor". The LITERAL
 * reading — clamp(modelOverall - anchor, ±6) — is degenerate: measured over all 1,603
 * anchored seasons the raw gap has median -10 and 67% of seasons fall outside ±6, so
 * two thirds of anchored players would pin to exactly `anchor - 6` and the delta would
 * discriminate nothing. The two numbers are on different scales; their difference is
 * not a signal.
 *
 * So the delta is RELATIVE: where a season ranks inside its own role-season cohort,
 * mapped onto ±6. That is within-role normalisation — the thing PR #99 shipped and
 * #100 reverted — but bounded to ±6 BY CONSTRUCTION rather than an open-ended
 * amplifier, which is the property the whole three-layer design rests on. The worst
 * possible bug here moves a player six points, not thirty.
 */

describe("seasonDelta — the ±6 window", () => {
  const FULL = FULL_DELTA_MINUTES;

  it("gives the top of a role-season cohort the full positive delta", () => {
    expect(seasonDelta(1, FULL)).toBe(MAX_DELTA);
  });

  it("gives the bottom of a role-season cohort the full negative delta", () => {
    expect(seasonDelta(0, FULL)).toBe(-MAX_DELTA);
  });

  it("leaves a median season sitting exactly on the anchor", () => {
    expect(seasonDelta(0.5, FULL)).toBe(0);
  });

  it("scales linearly between the extremes", () => {
    expect(seasonDelta(0.75, FULL)).toBe(MAX_DELTA / 2);
    expect(seasonDelta(0.25, FULL)).toBe(-MAX_DELTA / 2);
  });

  it("never leaves the ±6 window for any percentile", () => {
    for (let p = 0; p <= 1.0001; p += 0.01) {
      expect(Math.abs(seasonDelta(p, FULL))).toBeLessThanOrEqual(MAX_DELTA);
    }
  });

  it("shrinks the delta toward zero below the full-credit minutes floor", () => {
    // Benayoun '08 (1,890') out-ranked Rooney on per-90 rates alone. A rotation player
    // topping their cohort has not earned a full +6.
    const rotation = seasonDelta(1, FULL / 2);
    expect(rotation).toBeGreaterThan(0);
    expect(rotation).toBeLessThan(MAX_DELTA);
  });

  it("gives a cameo season almost no delta at all", () => {
    expect(Math.abs(seasonDelta(1, 200))).toBeLessThan(1);
  });

  it("does not reward minutes beyond the floor with more than the full delta", () => {
    expect(seasonDelta(1, FULL * 3)).toBe(MAX_DELTA);
  });

  it("shrinks a NEGATIVE delta toward zero too, so a cameo is not punished", () => {
    expect(seasonDelta(0, FULL / 2)).toBeGreaterThan(-MAX_DELTA);
    expect(seasonDelta(0, FULL / 2)).toBeLessThan(0);
  });
});

describe("applyAnchor", () => {
  it("adds the delta to the anchor", () => {
    expect(applyAnchor(85, 6)).toBe(91);
    expect(applyAnchor(85, -6)).toBe(79);
  });

  it("rounds to a whole card number", () => {
    expect(applyAnchor(85, 2.4)).toBe(87);
  });

  it("clamps into 0-100", () => {
    expect(applyAnchor(98, 6)).toBe(100);
    expect(applyAnchor(2, -6)).toBe(0);
  });
});

describe("anchorOf — the curated heritage lookup", () => {
  it("returns the committed anchor for an anchored player-season", () => {
    // Shearer 1994-95 — the curated `icon` tier, at its peak so no decay applies.
    // 85, not 88: Layer 3 rebased every tier base by −3 to make headroom for the
    // team-achievement boost under the scale ceiling.
    expect(anchorOf(1003185, 1994)).toBe(85);
  });

  it("returns null for a season the player was not anchored in", () => {
    expect(anchorOf(1003185, 2019)).toBeNull();
  });

  it("returns null for an un-anchored player", () => {
    expect(anchorOf(999999999, 2019)).toBeNull();
  });
});
