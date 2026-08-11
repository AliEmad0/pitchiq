import { describe, expect, it } from "vitest";
import {
  REQUEST_GRACE,
  STOPPAGE_KINDS,
  defaultAnswer,
} from "@/features/game/domain/match-decisions";
import type { SubOfferDecision } from "@/features/game/domain/match-decisions";

const offer = (over: Partial<SubOfferDecision> = {}): SubOfferDecision => ({
  kind: "sub-offer",
  minute: 60,
  side: "home",
  stoppage: false,
  engineSuggests: false,
  suggestedOff: undefined,
  suggestedReason: undefined,
  legalOff: [],
  legalOn: [],
  ...over,
});

describe("STOPPAGE_KINDS", () => {
  it("covers the events during which play is genuinely dead", () => {
    for (const k of [
      "goal",
      "card",
      "penalty",
      "freekick",
      "injury",
      "var",
      "altercation",
      "substitution",
      "halftime",
    ]) {
      expect(STOPPAGE_KINDS.has(k as never)).toBe(true);
    }
  });

  it("excludes events that do not stop play", () => {
    // A chance is play continuing, and `push` / `crowd` / `weather` are colour.
    for (const k of ["chance", "push", "crowd", "weather", "kickoff", "fulltime"]) {
      expect(STOPPAGE_KINDS.has(k as never)).toBe(false);
    }
  });
});

describe("defaultAnswer", () => {
  it("declines a sub offer the engine did not suggest", () => {
    expect(defaultAnswer(offer())).toEqual({
      kind: "sub-offer",
      minute: 60,
      side: "home",
      off: undefined,
      on: undefined,
      reason: undefined,
    });
  });

  it("takes the engine's own suggestion when it made one", () => {
    expect(
      defaultAnswer(offer({ engineSuggests: true, suggestedOff: 7, suggestedReason: "tactical" })),
    ).toEqual({
      kind: "sub-offer",
      minute: 60,
      side: "home",
      off: 7,
      on: undefined,
      reason: "tactical",
    });
  });

  it("ignores a suggestion the engine did not make even if one is present", () => {
    // engineSuggests is the roll. suggestedOff is computed unconditionally because
    // pickPlayerOff consumes no rng — so the roll, not the suggestion, is the gate.
    expect(defaultAnswer(offer({ engineSuggests: false, suggestedOff: 7 }))).toEqual({
      kind: "sub-offer",
      minute: 60,
      side: "home",
      off: undefined,
      on: undefined,
      reason: undefined,
    });
  });

  it("holds on a response decision", () => {
    expect(
      defaultAnswer({ kind: "response", minute: 30, side: "away", concededBy: "away" }),
    ).toEqual({ kind: "response", minute: 30, side: "away", choice: "hold" });
  });

  it("lets the engine pick the replacement for a forced injury", () => {
    expect(
      defaultAnswer({ kind: "injury-sub", minute: 55, side: "home", off: 4, legalOn: [] }),
    ).toEqual({ kind: "injury-sub", minute: 55, side: "home", on: undefined });
  });

  it("declines a dismissal reshape", () => {
    expect(
      defaultAnswer({ kind: "dismissal", minute: 70, side: "home", legalOff: [], legalOn: [] }),
    ).toEqual({ kind: "dismissal", minute: 70, side: "home", off: undefined, on: undefined });
  });
});

describe("REQUEST_GRACE", () => {
  it("is short enough that a request never feels swallowed", () => {
    expect(REQUEST_GRACE).toBeGreaterThan(0);
    expect(REQUEST_GRACE).toBeLessThanOrEqual(10);
  });
});
