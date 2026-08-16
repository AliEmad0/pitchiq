import { describe, expect, it } from "vitest";
import type { DecisionAnswer } from "@/features/game/domain/match-decisions";
import { splitDecisions } from "@/features/game/view/decision-summary";

const noop = (minute: number): DecisionAnswer => ({ kind: "sub-offer", minute, side: "home" });

describe("splitDecisions", () => {
  it("⛔ counts declined offers instead of listing them as substitutions", () => {
    // The reported shape: ~31 sub-offers, two of which were actually taken.
    const answers: DecisionAnswer[] = [
      ...Array.from({ length: 29 }, (_, i) => noop(55 + i)),
      { kind: "sub-offer", minute: 70, side: "home", off: 7, on: 12 },
      { kind: "sub-offer", minute: 78, side: "home", off: 3, on: 14 },
    ];
    const { taken, declined } = splitDecisions(answers);
    expect(declined).toBe(29);
    expect(taken).toHaveLength(2);
    expect(taken.every((a) => a.kind === "sub-offer" && a.off != null)).toBe(true);
  });

  it("keeps a response even when the choice was to hold", () => {
    // ⚠️ Holding is one of three options the coach chose between — an action, unlike a
    // sub-offer no-op which is the absence of one.
    const { taken, declined } = splitDecisions([
      { kind: "response", minute: 61, side: "home", choice: "hold" },
    ]);
    expect(taken).toHaveLength(1);
    expect(declined).toBe(0);
  });

  it("keeps the decisions the match forced on him", () => {
    const { taken, declined } = splitDecisions([
      { kind: "injury-sub", minute: 30, side: "home" },
      { kind: "dismissal", minute: 54, side: "home" },
    ]);
    expect(taken).toHaveLength(2);
    expect(declined).toBe(0);
  });

  it("handles a match where nothing at all was asked", () => {
    expect(splitDecisions([])).toEqual({ taken: [], declined: 0 });
  });

  it("handles a coach who declined everything", () => {
    const { taken, declined } = splitDecisions(Array.from({ length: 31 }, (_, i) => noop(55 + i)));
    expect(taken).toEqual([]);
    expect(declined).toBe(31);
  });
});
