import { describe, expect, it } from "vitest";
import {
  applyModifiers, baseWeights, BASELINE_MODIFIERS, momentumModifier, staminaModifier,
} from "@/features/game/domain/modifiers";
import type { MatchState, TeamPower } from "@/features/game/domain/match-types";

const power: TeamPower = { attack: 60, defense: 50, aggression: 40 };
function stateWith(over: Partial<{ stamina: number; momentum: number }>): MatchState {
  const side = { power, score: 0, stamina: over.stamina ?? 1, momentum: over.momentum ?? 0 };
  return { minute: 80, home: { ...side }, away: { ...side }, events: [] };
}

describe("baseWeights", () => {
  it("maps team power to per-minute weights", () => {
    expect(baseWeights(power)).toEqual({ attack: 60, defense: 50, foul: 40, card: 40 });
  });
});

describe("staminaModifier", () => {
  it("is neutral at full stamina", () => {
    expect(staminaModifier({ state: stateWith({ stamina: 1 }), side: "home" })).toEqual({ attack: -0 });
  });
  it("reduces attack as stamina drops", () => {
    const d = staminaModifier({ state: stateWith({ stamina: 0.5 }), side: "home" });
    expect(d.attack).toBeLessThan(0);
  });
});

describe("momentumModifier", () => {
  it("lifts attack with positive momentum", () => {
    expect(momentumModifier({ state: stateWith({ momentum: 1 }), side: "home" }).attack).toBeGreaterThan(0);
  });
  it("drops attack with negative momentum", () => {
    expect(momentumModifier({ state: stateWith({ momentum: -1 }), side: "home" }).attack).toBeLessThan(0);
  });
});

describe("applyModifiers", () => {
  it("folds deltas onto the base and clamps at 0", () => {
    const ctx = { state: stateWith({ stamina: 0, momentum: -1 }), side: "home" as const };
    const out = applyModifiers(baseWeights(power), ctx, BASELINE_MODIFIERS);
    expect(out.attack).toBeGreaterThanOrEqual(0);
    expect(out.attack).toBeLessThan(60); // fatigue + negative momentum pulled it down
  });
});
