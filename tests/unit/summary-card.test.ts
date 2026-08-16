import { describe, expect, it } from "vitest";

import type { MatchEvent } from "../../src/features/game/domain/match-types";
import {
  scorerLine,
  scorersFrom,
  summaryFilename,
  type MatchSummary,
} from "../../src/features/game/domain/summary-card";

const NAMES: Record<number, string> = { 1: "Henry", 2: "Carragher", 3: "Shearer" };
const nameOf = (id: number) => NAMES[id] ?? `#${id}`;

const goal = (over: Partial<MatchEvent> = {}): MatchEvent =>
  ({ minute: 20, kind: "goal", side: "home", playerId: 1, source: "open", ...over }) as MatchEvent;

describe("scorersFrom", () => {
  it("lists goals in match order", () => {
    const out = scorersFrom(
      [goal({ minute: 70, playerId: 3 }), goal({ minute: 12, playerId: 1 })],
      nameOf,
    );
    expect(out.map((s) => s.minute)).toEqual([12, 70]);
    expect(out.map((s) => s.name)).toEqual(["Henry", "Shearer"]);
  });

  it("EXCLUDES a goal that was later chalked off", () => {
    // The engine deliberately keeps a disallowed goal in the stream — the scoreboard
    // counts it until the review lands, which is where the VAR drama lives. A FINAL
    // summary must not list a scorer for a goal that never stood.
    const out = scorersFrom(
      [goal({ minute: 30, playerId: 1 }), goal({ minute: 55, playerId: 3, disallowedAt: 57 })],
      nameOf,
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Henry");
  });

  it("keeps a goal whose review upheld it (`disallowedAt` absent)", () => {
    expect(scorersFrom([goal({ disallowedAt: undefined })], nameOf)).toHaveLength(1);
  });

  it("marks own goals and penalties from `source`", () => {
    const out = scorersFrom(
      [
        goal({ minute: 10, playerId: 2, source: "own-goal" }),
        goal({ minute: 20, playerId: 1, source: "penalty" }),
        goal({ minute: 30, playerId: 3, source: "freekick" }),
      ],
      nameOf,
    );
    expect(out.map((s) => [s.own, s.penalty])).toEqual([
      [true, false],
      [false, true],
      [false, false],
    ]);
  });

  it("ignores every non-goal event", () => {
    const events = [
      { minute: 1, kind: "kickoff" },
      { minute: 44, kind: "card", side: "home", playerId: 1, card: "yellow" },
      { minute: 60, kind: "chance", side: "away" },
      goal({ minute: 80 }),
    ] as MatchEvent[];
    expect(scorersFrom(events, nameOf)).toHaveLength(1);
  });

  it("falls back rather than crashing when a goal names no scorer", () => {
    expect(scorersFrom([goal({ playerId: undefined })], nameOf)[0].name).toBe("—");
  });
});

describe("scorerLine", () => {
  it("tags own goals and penalties, and leaves open play bare", () => {
    expect(scorerLine({ minute: 23, name: "Henry", side: "home", own: false, penalty: true })).toBe(
      "23' Henry (pen)",
    );
    expect(
      scorerLine({ minute: 67, name: "Carragher", side: "home", own: true, penalty: false }),
    ).toBe("67' Carragher (og)");
    expect(
      scorerLine({ minute: 5, name: "Shearer", side: "away", own: false, penalty: false }),
    ).toBe("5' Shearer");
  });
});

describe("summaryFilename", () => {
  const base: MatchSummary = {
    home: "Nott'm Forest",
    away: "Brighton & Hove Albion",
    score: { home: 7, away: 0 },
    scorers: [],
    formationKey: "4-4-2",
    seed: 1,
    code: "v1...",
  };

  it("strips punctuation that breaks filenames and shells", () => {
    expect(summaryFilename(base)).toBe("pitchiq-nott-m-forest-7-0-brighton-hove-albion.png");
  });

  it("folds accents rather than emitting them raw", () => {
    expect(summaryFilename({ ...base, home: "Málaga", away: "Köln" })).toBe(
      "pitchiq-malaga-7-0-koln.png",
    );
  });

  it("never produces an empty segment", () => {
    // A name of pure punctuation would otherwise yield "pitchiq--7-0-.png".
    expect(summaryFilename({ ...base, home: "!!!", away: "???" })).toBe(
      "pitchiq-team-7-0-team.png",
    );
  });
});
