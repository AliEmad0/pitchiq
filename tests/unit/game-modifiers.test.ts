import { describe, expect, it } from "vitest";
import {
  applyModifiers,
  baseWeights,
  BASELINE_MODIFIERS,
  desperationModifier,
  momentumModifier,
  staminaModifier,
} from "@/features/game/domain/modifiers";
import type { MatchState, TeamPower } from "@/features/game/domain/match-types";

const power: TeamPower = { attack: 60, defense: 50, aggression: 40 };
function stateWith(over: Partial<{ stamina: number; momentum: number }>): MatchState {
  const side = {
    power,
    score: 0,
    stamina: over.stamina ?? 1,
    momentum: over.momentum ?? 0,
    respondingUntil: 0,
    pushed: false,
    sentOff: 0,
    rage: 0,
  };
  return {
    minute: 80,
    home: { ...side },
    away: { ...side },
    events: [],
    booked: new Map(),
    dismissed: new Set(),
  };
}

describe("baseWeights", () => {
  it("maps team power to per-minute weights", () => {
    expect(baseWeights(power)).toEqual({ attack: 60, defense: 50, foul: 40, card: 40 });
  });
});

describe("staminaModifier", () => {
  it("is neutral at full stamina", () => {
    expect(staminaModifier({ state: stateWith({ stamina: 1 }), side: "home" })).toEqual({
      attack: -0,
    });
  });
  it("reduces attack as stamina drops", () => {
    const d = staminaModifier({ state: stateWith({ stamina: 0.5 }), side: "home" });
    expect(d.attack).toBeLessThan(0);
  });
});

describe("momentumModifier", () => {
  it("lifts attack with positive momentum", () => {
    expect(
      momentumModifier({ state: stateWith({ momentum: 1 }), side: "home" }).attack,
    ).toBeGreaterThan(0);
  });
  it("drops attack with negative momentum", () => {
    // The function stays linear either way. Since TASK-1822 `simulate` only ever feeds
    // it values >= 0 — momentum now means attacking URGENCY, which conceding raises.
    expect(
      momentumModifier({ state: stateWith({ momentum: -1 }), side: "home" }).attack,
    ).toBeLessThan(0);
  });
});

describe("desperationModifier", () => {
  const trailing = (minute: number, deficit: number) => {
    const base = {
      power,
      score: 0,
      stamina: 1,
      momentum: 0,
      respondingUntil: 0,
      pushed: false,
      sentOff: 0,
      rage: 0,
    };
    const state: MatchState = {
      minute,
      home: { ...base, score: 0 },
      away: { ...base, score: deficit },
      events: [],
      booked: new Map(),
      dismissed: new Set(),
    };
    return desperationModifier({ state, side: "home" });
  };

  it("does nothing before the late-game threshold", () => {
    expect(trailing(70, 1)).toEqual({});
  });

  it("does nothing for a side that is level or ahead", () => {
    expect(trailing(85, 0)).toEqual({});
    expect(trailing(85, -1)).toEqual({});
  });

  it("throws a trailing side forward late on", () => {
    const d = trailing(85, 1);
    expect(d.attack).toBeGreaterThan(0);
  });

  it("costs defensive shape — a late push must be able to backfire", () => {
    // Without this, chasing a game would be a free bonus. Real comebacks come with
    // real counter-attacks against them.
    expect(trailing(85, 1).defense).toBeLessThan(0);
  });

  it("pushes harder the further behind a side is", () => {
    expect(trailing(85, 2).attack).toBeGreaterThan(trailing(85, 1).attack as number);
  });

  it("stops escalating past a three-goal deficit", () => {
    expect(trailing(85, 5).attack).toBe(trailing(85, 3).attack);
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
