import { describe, expect, it } from "vitest";
import type { MatchEvent } from "@/features/game/domain/match-types";
import { scoreAt } from "@/features/game/view/score";

const goal = (minute: number, side: "home" | "away", disallowedAt?: number): MatchEvent =>
  ({ minute, kind: "goal", side, playerId: 500, disallowedAt }) as MatchEvent;

describe("scoreAt", () => {
  it("counts goals for each side", () => {
    expect(scoreAt([goal(10, "home"), goal(20, "away"), goal(30, "home")], 90)).toEqual({
      home: 2,
      away: 1,
    });
  });

  it("is zero before anything happens", () => {
    expect(scoreAt([], 0)).toEqual({ home: 0, away: 0 });
  });

  it("ignores non-goal events", () => {
    const card = { minute: 12, kind: "card", side: "home", playerId: 501 } as MatchEvent;
    expect(scoreAt([card, goal(20, "home")], 90)).toEqual({ home: 1, away: 0 });
  });

  it("⚠️ a goal still counts until the VAR verdict lands", () => {
    // TASK-1822's headline drama: the goal stands, the crowd celebrates, and only when
    // `disallowedAt` is REACHED does it come off. Reading the whole event list without
    // reference to the clock would chalk it off before it was ever scored.
    expect(scoreAt([goal(23, "home", 25)], 24)).toEqual({ home: 1, away: 0 });
  });

  it("⚠️ a disallowed goal stops counting once the verdict is reached", () => {
    expect(scoreAt([goal(23, "home", 25)], 25)).toEqual({ home: 0, away: 0 });
    expect(scoreAt([goal(23, "home", 25)], 90)).toEqual({ home: 0, away: 0 });
  });

  it("⚠️ a goal the clock has not reached yet does not count", () => {
    // A decision's `events` snapshot legitimately runs AHEAD of its own minute, so the
    // function must not trust that its input is already trimmed. Leaking a future goal
    // onto the scoreboard is how a live view spoils its own drama.
    expect(scoreAt([goal(70, "home")], 45)).toEqual({ home: 0, away: 0 });
    expect(scoreAt([goal(70, "home")], 70)).toEqual({ home: 1, away: 0 });
  });
});
