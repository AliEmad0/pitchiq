import { describe, expect, it } from "vitest";
import { encodeTokens } from "@/features/game/domain/decision-tokens";
import type { DecisionAnswer } from "@/features/game/domain/match-decisions";

const noop = (minute: number): DecisionAnswer => ({ kind: "sub-offer", minute, side: "home" });

describe("encodeTokens", () => {
  it("writes a single no-op as one character", () => {
    expect(encodeTokens([noop(55)])).toBe("-");
  });

  it("run-length encodes consecutive no-ops in base 36", () => {
    expect(encodeTokens([noop(55), noop(56)])).toBe("-2");
    expect(encodeTokens(Array.from({ length: 35 }, (_, i) => noop(55 + i)))).toBe("-z");
    expect(encodeTokens(Array.from({ length: 36 }, (_, i) => noop(55 + i)))).toBe("-10");
  });

  it("encodes each answer kind", () => {
    expect(encodeTokens([{ kind: "response", minute: 30, side: "home", choice: "overload" }])).toBe(
      "o",
    );
    expect(encodeTokens([{ kind: "response", minute: 30, side: "home", choice: "stabilize" }])).toBe(
      "z",
    );
    expect(encodeTokens([{ kind: "response", minute: 30, side: "home", choice: "hold" }])).toBe("h");
    expect(encodeTokens([{ kind: "sub-offer", minute: 60, side: "home", off: 36 }])).toBe("s10");
    expect(encodeTokens([{ kind: "sub-offer", minute: 60, side: "home", off: 1, on: 2 }])).toBe(
      "s1-2",
    );
    expect(encodeTokens([{ kind: "injury-sub", minute: 70, side: "home" }])).toBe("i");
    expect(encodeTokens([{ kind: "injury-sub", minute: 70, side: "home", on: 9 }])).toBe("i9");
    expect(encodeTokens([{ kind: "dismissal", minute: 80, side: "home" }])).toBe("d");
    expect(encodeTokens([{ kind: "dismissal", minute: 80, side: "home", off: 3, on: 4 }])).toBe(
      "d3-4",
    );
  });

  it("separates tokens with ~ and flushes a run before a real answer", () => {
    expect(
      encodeTokens([
        noop(55),
        noop(56),
        { kind: "response", minute: 57, side: "home", choice: "hold" },
        noop(58),
      ]),
    ).toBe("-2~h~-");
  });

  it("encodes an empty answer list as an empty string", () => {
    expect(encodeTokens([])).toBe("");
  });

  // ⚠️ `on` without `off` is not a substitution — simulate.ts gates on `answer.off != null`
  // and ignores it. Making it unencodable means a code can never carry an instruction the
  // engine silently drops.
  it("REFUSES an answer the engine would silently drop", () => {
    expect(() => encodeTokens([{ kind: "sub-offer", minute: 60, side: "home", on: 5 }])).toThrow(
      /off/,
    );
    expect(() => encodeTokens([{ kind: "dismissal", minute: 60, side: "home", on: 5 }])).toThrow(
      /off/,
    );
  });

  // ⚠️ No coach path sets `reason` today — DecisionPrompt and fallbackFor both omit it and
  // simulate defaults to "tactical". The token has no room for it, so if a future UI adds
  // one this throws at share time rather than shipping a link that quietly loses it.
  it("REFUSES a sub reason it cannot carry", () => {
    expect(() =>
      encodeTokens([
        { kind: "sub-offer", minute: 60, side: "home", off: 1, on: 2, reason: "stamina" },
      ]),
    ).toThrow(/reason/);
  });
});
