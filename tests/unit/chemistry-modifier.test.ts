import { describe, expect, it } from "vitest";
import { CHEM_EFFECT, chemistryModifier } from "@/features/game/domain/chemistry-modifier";
import type { MinuteContext, Side } from "@/features/game/domain/match-types";

/**
 * TASK-1810 PR 5 — chemistry as a weight contributor. Spec §5.
 *
 * ⚠️ The win-rate FIT lives in the modifier's own doc comment (measured over ~3,000 seeded
 * matches per constant, which is far too slow for a suite). What is pinned here is everything
 * the fit depends on being true: the constant itself, that each side gets its OWN chemistry,
 * and that the effect scales the way the sweep assumed it did.
 */

const power = { attack: 80, defense: 70, aggression: 50 };
const ctx = (side: Side, homePower = power, awayPower = power): MinuteContext =>
  ({
    side,
    state: { home: { power: homePower }, away: { power: awayPower } },
  }) as unknown as MinuteContext;

describe("chemistryModifier", () => {
  it("⚠️ the constant is MEASURED and pinned — a nudge must be deliberate", () => {
    // Changing it changes the outcome of every match ever played or shared in this mode.
    expect(CHEM_EFFECT).toBe(0.03);
  });

  it("chemistry 0 is a NO-OP — the mode must cost nothing when nobody has links", () => {
    const mod = chemistryModifier({ home: 0, away: 0 });
    expect(mod(ctx("home"))).toEqual({ attack: 0, defense: 0 });
  });

  it("chemistry 100 is worth exactly CHEM_EFFECT of the side's own power", () => {
    const mod = chemistryModifier({ home: 100, away: 0 });
    const d = mod(ctx("home"));
    expect(d.attack).toBeCloseTo(80 * CHEM_EFFECT, 10);
    expect(d.defense).toBeCloseTo(70 * CHEM_EFFECT, 10);
  });

  it("⛔ EACH SIDE gets its OWN chemistry — the bug a single-score closure would hide", () => {
    /**
     * One `Modifier` is applied to BOTH sides: the engine calls it once per side per minute.
     * A modifier that closed over a single number would silently hand the coach's chemistry
     * to his opponent too — and the match would look completely normal while doing it.
     */
    const mod = chemistryModifier({ home: 100, away: 0 });
    expect(mod(ctx("home")).attack).toBeGreaterThan(0);
    expect(mod(ctx("away"))).toEqual({ attack: 0, defense: 0 });
  });

  it("scales PROPORTIONALLY, so chemistry is worth the same in relative terms to either side", () => {
    // A flat bonus would make chemistry matter more the worse your players are, which would
    // quietly turn it into a comeback mechanic rather than a reward for drafting well.
    const strong = { attack: 90, defense: 90, aggression: 50 };
    const weak = { attack: 45, defense: 45, aggression: 50 };
    const mod = chemistryModifier({ home: 100, away: 100 });
    const s = mod(ctx("home", strong, weak));
    const w = mod(ctx("away", strong, weak));
    expect(s.attack! / strong.attack).toBeCloseTo(w.attack! / weak.attack, 10);
  });

  it("is linear between 0 and 100 — half the chemistry, half the effect", () => {
    const full = chemistryModifier({ home: 100, away: 0 })(ctx("home")).attack!;
    const half = chemistryModifier({ home: 50, away: 0 })(ctx("home")).attack!;
    expect(half).toBeCloseTo(full / 2, 10);
  });

  it("⚠️ CLAMPS out-of-range input rather than trusting it", () => {
    // The score is derived, so it should already be 0–100 — but this feeds the engine, and a
    // negative or runaway value would corrupt a match rather than error.
    const over = chemistryModifier({ home: 400, away: 0 })(ctx("home")).attack!;
    const at100 = chemistryModifier({ home: 100, away: 0 })(ctx("home")).attack!;
    expect(over).toBeCloseTo(at100, 10);
    expect(chemistryModifier({ home: -50, away: 0 })(ctx("home"))).toEqual({
      attack: 0,
      defense: 0,
    });
  });

  it("⚠️ is PURE — the same context always yields the same weights", () => {
    // Determinism is the engine's core invariant: a match replays byte-for-byte from
    // (setup, seed, decisions), so a modifier that varied would break every share link.
    const mod = chemistryModifier({ home: 73, away: 32 });
    expect(mod(ctx("home"))).toEqual(mod(ctx("home")));
    expect(mod(ctx("away"))).toEqual(mod(ctx("away")));
  });

  it("touches ONLY attack and defence — never fouls or cards", () => {
    // Chemistry is about how well a side plays together, not about how it behaves. Leaking
    // into discipline would move the card rate the match harness pins.
    const d = chemistryModifier({ home: 100, away: 100 })(ctx("home"));
    expect(Object.keys(d).sort()).toEqual(["attack", "defense"]);
  });
});
