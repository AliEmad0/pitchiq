import { describe, expect, it } from "vitest";
import type { MatchEvent } from "@/features/game/domain/match-types";
import {
  bandOf,
  formatXg,
  shotXgOf,
  shotsOf,
  xgSeries,
  xgTotals,
  XG_CHANCE,
  XG_FREEKICK,
  XG_GOAL_STYLE,
  XG_OPEN_DEFAULT,
  XG_PENALTY,
} from "@/features/game/domain/match-xg";

/** TASK-1815 — the estimated xG every post-match report is drawn from. */
const ev = (e: Partial<MatchEvent>): MatchEvent =>
  ({ minute: 10, kind: "chance", side: "home", ...e }) as MatchEvent;

describe("match xG — the frozen table", () => {
  it("⛔ GOLDEN: the table never changes (it would rewrite every report ever shared)", () => {
    expect(XG_PENALTY).toBe(76);
    expect(XG_FREEKICK).toBe(6);
    expect(XG_OPEN_DEFAULT).toBe(30);
    expect(XG_GOAL_STYLE).toEqual({
      "tap-in": 55,
      counter: 30,
      header: 18,
      chip: 15,
      volley: 12,
      trivela: 5,
      "long-range": 4,
    });
    expect(XG_CHANCE).toEqual({ post: 20, crossbar: 20, saved: 12, wide: 6, blocked: 5 });
  });

  it("bands: low < 10 ≤ medium < 30 ≤ high", () => {
    expect([bandOf(9), bandOf(10), bandOf(29), bandOf(30)]).toEqual([
      "low",
      "medium",
      "medium",
      "high",
    ]);
  });
});

describe("match xG — counting", () => {
  it("⛔ a scored penalty counts 0.76 ONCE, not again on its goal", () => {
    const shots = shotsOf([
      ev({ kind: "penalty", penaltyOutcome: "scored-placed", minute: 30 }),
      ev({ kind: "goal", source: "penalty", minute: 30, playerId: 9 }),
    ]);
    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({ xg: 76, goal: true, band: "high" });
  });

  it("a parried penalty followed in is a goal; a held one is not", () => {
    expect(shotsOf([ev({ kind: "penalty", penaltyOutcome: "saved-rebound-goal" })])[0]!.goal).toBe(
      true,
    );
    expect(shotsOf([ev({ kind: "penalty", penaltyOutcome: "saved-held" })])[0]!.goal).toBe(false);
  });

  it("a free kick counts on its own event; its goal adds nothing", () => {
    const shots = shotsOf([
      ev({ kind: "freekick", freeKickOutcome: "scored" }),
      ev({ kind: "goal", source: "freekick" }),
    ]);
    expect(shots.map((s) => [s.xg, s.goal])).toEqual([[6, true]]);
  });

  it("an own goal is not a shot", () => {
    expect(shotXgOf(ev({ kind: "goal", source: "own-goal" }))).toBeNull();
  });

  it("an open goal reads its style, defaulting to 0.30", () => {
    expect(shotXgOf(ev({ kind: "goal", source: "open", goalStyle: "header" }))).toBe(18);
    expect(shotXgOf(ev({ kind: "goal", source: "open" }))).toBe(30);
  });

  it("a VAR-disallowed goal KEEPS its xG and is flagged", () => {
    const [s] = shotsOf([
      ev({ kind: "goal", source: "open", goalStyle: "tap-in", disallowedAt: 33 }),
    ]);
    expect(s).toMatchObject({ xg: 55, goal: true, disallowed: true });
  });

  it("a disallowed PENALTY goal flags its penalty shot", () => {
    const [s] = shotsOf([
      ev({ kind: "penalty", penaltyOutcome: "scored-placed", minute: 40 }),
      ev({ kind: "goal", source: "penalty", minute: 40, disallowedAt: 42 }),
    ]);
    expect(s!.disallowed).toBe(true);
  });

  it("non-shot events are ignored", () => {
    expect(shotsOf([ev({ kind: "card" }), ev({ kind: "kickoff", side: undefined })])).toEqual([]);
  });

  it("totals equal the sum of shots, per side, in integer hundredths", () => {
    const shots = shotsOf([
      ev({ outcome: "saved" }),
      ev({ outcome: "post" }),
      ev({ side: "away", outcome: "wide" }),
    ]);
    expect(xgTotals(shots)).toEqual({ home: 32, away: 6 });
    expect(formatXg(32)).toBe("0.3");
    expect(formatXg(245)).toBe("2.5");
  });

  it("the series is cumulative, starts at 0, and ends at the final minute", () => {
    const shots = shotsOf([
      ev({ minute: 20, outcome: "saved" }),
      ev({ minute: 70, side: "away", outcome: "post" }),
    ]);
    expect(xgSeries(shots, 94)).toEqual([
      { minute: 0, home: 0, away: 0 },
      { minute: 20, home: 12, away: 0 },
      { minute: 70, home: 12, away: 20 },
      { minute: 94, home: 12, away: 20 },
    ]);
  });

  it("a match with no shots is a flat series", () => {
    expect(xgSeries([], 90)).toEqual([
      { minute: 0, home: 0, away: 0 },
      { minute: 90, home: 0, away: 0 },
    ]);
  });
});
