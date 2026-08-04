import { describe, expect, it } from "vitest";
import type { TeamPower } from "@/features/game/domain/match-types";
import { winProbability } from "@/features/game/domain/win-probability";

const P = (attack: number, defense: number): TeamPower => ({ attack, defense, aggression: 40 });
const even = P(50, 50);

describe("winProbability", () => {
  it("sums to ~1", () => {
    const w = winProbability({ homePower: even, awayPower: even, homeScore: 0, awayScore: 0, minute: 0 });
    expect(w.home + w.draw + w.away).toBeCloseTo(1, 5);
  });

  it("at full-time it is decided by the current score", () => {
    const lead = winProbability({ homePower: even, awayPower: even, homeScore: 2, awayScore: 1, minute: 90 });
    expect(lead.home).toBeCloseTo(1, 5);
    expect(lead.away).toBeCloseTo(0, 5);
    const draw = winProbability({ homePower: even, awayPower: even, homeScore: 1, awayScore: 1, minute: 90 });
    expect(draw.draw).toBeCloseTo(1, 5);
  });

  it("a late lead is strong but not certain", () => {
    const w = winProbability({ homePower: even, awayPower: even, homeScore: 2, awayScore: 1, minute: 80 });
    expect(w.home).toBeGreaterThan(0.6);
    expect(w.home).toBeLessThan(1);
  });

  it("the stronger side is favored from kickoff", () => {
    const w = winProbability({ homePower: P(85, 80), awayPower: P(30, 30), homeScore: 0, awayScore: 0, minute: 0 });
    expect(w.home).toBeGreaterThan(w.away);
  });

  it("a bigger lead raises win probability", () => {
    const one = winProbability({ homePower: even, awayPower: even, homeScore: 1, awayScore: 0, minute: 60 });
    const two = winProbability({ homePower: even, awayPower: even, homeScore: 2, awayScore: 0, minute: 60 });
    expect(two.home).toBeGreaterThan(one.home);
  });
});
