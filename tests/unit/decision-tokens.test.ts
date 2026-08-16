import { describe, expect, it } from "vitest";
import { encodeTokens, readTokens } from "@/features/game/domain/decision-tokens";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";

const noop = (minute: number): DecisionAnswer => ({ kind: "sub-offer", minute, side: "home" });

/** Only the three fields a token is materialised against. */
const decision = (kind: MatchDecision["kind"], minute = 60): MatchDecision =>
  ({ kind, minute, side: "home", events: [] }) as unknown as MatchDecision;

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

describe("readTokens", () => {
  it("materialises minute and side from the decision, not the token", () => {
    const r = readTokens("-")!;
    expect(r.next(decision("sub-offer", 71))).toEqual({
      ok: true,
      answer: { kind: "sub-offer", minute: 71, side: "home" },
    });
  });

  it("expands a run so each no-op answers one decision", () => {
    const r = readTokens("-3")!;
    for (let i = 0; i < 3; i++) expect(r.next(decision("sub-offer")).ok).toBe(true);
    expect(r.next(decision("sub-offer"))).toEqual({ ok: false, reason: "exhausted" });
  });

  it("round-trips every answer kind", () => {
    const cases: DecisionAnswer[] = [
      { kind: "response", minute: 60, side: "home", choice: "overload" },
      { kind: "response", minute: 60, side: "home", choice: "stabilize" },
      { kind: "response", minute: 60, side: "home", choice: "hold" },
      { kind: "sub-offer", minute: 60, side: "home", off: 1, on: 2 },
      { kind: "sub-offer", minute: 60, side: "home", off: 36 },
      { kind: "injury-sub", minute: 60, side: "home", on: 9 },
      { kind: "injury-sub", minute: 60, side: "home" },
      { kind: "dismissal", minute: 60, side: "home", off: 3, on: 4 },
      { kind: "dismissal", minute: 60, side: "home" },
    ];
    for (const a of cases) {
      const r = readTokens(encodeTokens([a]))!;
      expect(r.next(decision(a.kind))).toEqual({ ok: true, answer: a });
    }
  });

  it("replays a whole mixed stream in order", () => {
    const answers: DecisionAnswer[] = [
      noop(55),
      noop(56),
      { kind: "response", minute: 57, side: "home", choice: "overload" },
      { kind: "sub-offer", minute: 60, side: "home", off: 7, on: 12 },
      noop(61),
    ];
    const r = readTokens(encodeTokens(answers))!;
    const back = answers.map((a) => {
      const got = r.next(decision(a.kind, a.minute));
      return got.ok ? got.answer : null;
    });
    expect(back).toEqual(answers);
  });

  // ⛔ The check a verbatim answers[] cannot make.
  it("reports MISMATCH when the token's kind is not the decision being raised", () => {
    expect(readTokens("o")!.next(decision("sub-offer"))).toEqual({
      ok: false,
      reason: "mismatch",
    });
    expect(readTokens("-")!.next(decision("response"))).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("rejects an ungrammatical stream outright", () => {
    expect(readTokens("q")).toBeNull();
    // A run of one must be written "-": two spellings of one thing is a second source of
    // truth, and only the shorter one is ever emitted.
    expect(readTokens("-1")).toBeNull();
    expect(readTokens("-0")).toBeNull();
    expect(readTokens("s")).toBeNull();
    expect(readTokens("o5")).toBeNull();
    expect(readTokens("i-")).toBeNull();
    expect(readTokens("-zzzz")).toBeNull();
  });

  it("treats an empty stream as zero decisions", () => {
    expect(readTokens("")!.next(decision("sub-offer"))).toEqual({
      ok: false,
      reason: "exhausted",
    });
  });
});
