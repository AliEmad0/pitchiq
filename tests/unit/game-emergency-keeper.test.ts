import { describe, expect, it } from "vitest";
import type { DismissalDecision } from "@/features/game/domain/match-decisions";
import { encodeTokens, readTokens } from "@/features/game/domain/decision-tokens";

/**
 * TASK-1810 — an outfielder takes the gloves when the keeper is sent off and there are no
 * substitutions left (owner's rule, 2026-08-19).
 *
 * ⚠️ These assert the SHARE-CODE half. A match that cannot replay itself breaks the
 * invariant the whole of Phase 18 rests on, so the reassignment has to survive a link.
 */
const dismissal = (over: Partial<DismissalDecision> = {}): DismissalDecision => ({
  kind: "dismissal",
  minute: 70,
  side: "home",
  legalOff: [],
  legalOn: [],
  keeperGone: true,
  emergencyKeepers: [],
  events: [],
  ...over,
});

describe("the emergency-keeper token", () => {
  it("round-trips through a share code", () => {
    const code = encodeTokens([{ kind: "dismissal", minute: 70, side: "home", inGoal: 42 }]);
    const reader = readTokens(code);
    expect(reader).not.toBeNull();
    const out = reader!.next(dismissal());
    expect(out).toEqual({
      ok: true,
      answer: { kind: "dismissal", minute: 70, side: "home", inGoal: 42 },
    });
  });

  it("⚠️ takes its minute and side from the DECISION, not the token", () => {
    // That is what keeps a token this short, and it is why a stale code is detectable.
    const code = encodeTokens([{ kind: "dismissal", minute: 70, side: "home", inGoal: 7 }]);
    const out = readTokens(code)!.next(dismissal({ minute: 81, side: "away" }));
    expect(out).toMatchObject({ ok: true, answer: { minute: 81, side: "away", inGoal: 7 } });
  });

  it("⛔ refuses to encode a dismissal that both substitutes AND reassigns", () => {
    // Two different answers to one decision. The engine would have to pick a winner, and
    // the grammar deliberately cannot say it.
    expect(() =>
      encodeTokens([{ kind: "dismissal", minute: 70, side: "home", off: 3, inGoal: 5 }]),
    ).toThrow(/substitute and reassign/);
  });

  it("⛔ is ungrammatical against any decision that is not a dismissal", () => {
    const code = encodeTokens([{ kind: "dismissal", minute: 70, side: "home", inGoal: 9 }]);
    const out = readTokens(code)!.next({
      kind: "response",
      minute: 70,
      side: "home",
      concededBy: "away",
      events: [],
    });
    expect(out).toEqual({ ok: false, reason: "mismatch" });
  });

  it("⛔ rejects a bare `g` — an emergency keeper is always a specific player", () => {
    expect(readTokens("g")).toBeNull();
  });

  it("still reads every other token kind unchanged", () => {
    // The new head must not disturb the existing grammar.
    const code = encodeTokens([
      { kind: "sub-offer", minute: 60, side: "home" },
      { kind: "sub-offer", minute: 61, side: "home", off: 3, on: 12 },
      { kind: "response", minute: 62, side: "home", choice: "overload" },
      { kind: "dismissal", minute: 70, side: "home", inGoal: 4 },
    ]);
    const r = readTokens(code);
    expect(r).not.toBeNull();
    expect(
      r!.next({
        kind: "sub-offer",
        minute: 60,
        side: "home",
        stoppage: false,
        engineSuggests: false,
        legalOff: [],
        legalOn: [],
        events: [],
      }),
    ).toMatchObject({ ok: true });
    expect(
      r!.next({
        kind: "sub-offer",
        minute: 61,
        side: "home",
        stoppage: false,
        engineSuggests: false,
        legalOff: [],
        legalOn: [],
        events: [],
      }),
    ).toMatchObject({ ok: true });
    expect(
      r!.next({ kind: "response", minute: 62, side: "home", concededBy: "away", events: [] }),
    ).toMatchObject({ ok: true });
    expect(r!.next(dismissal())).toMatchObject({ ok: true, answer: { inGoal: 4 } });
    expect(r!.done()).toBe(true);
  });
});
