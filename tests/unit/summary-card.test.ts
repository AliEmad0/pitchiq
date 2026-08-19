import { describe, expect, it } from "vitest";

import type { MatchEvent } from "../../src/features/game/domain/match-types";
import type { GameTeam } from "../../src/features/game/domain/team";
import {
  FOOTER_TOP,
  scorerLayout,
  scorerLine,
  scorersFrom,
  summaryFilename,
  summaryFrom,
  type SummaryCardData,
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

  // ⛔ THE regression test. The engine emits an own goal with playerId UNDEFINED and the
  // unlucky defender in `ownGoalBy` — this is the real shape, and reading `playerId`
  // rendered every own goal as "—" on the card. The fixture above, which sets a playerId,
  // is what hid it: no real own-goal event looks like that.
  it("names an own-goal scorer from `ownGoalBy`, the shape the engine actually emits", () => {
    const out = scorersFrom(
      [goal({ minute: 61, playerId: undefined, source: "own-goal", ownGoalBy: 2, side: "away" })],
      nameOf,
    );
    expect(out[0].name).toBe("Carragher");
    expect(out[0].own).toBe(true);
    // `side` is who the goal COUNTS FOR, not who the scorer plays for.
    expect(out[0].side).toBe("away");
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
  const base: SummaryCardData = {
    home: "Nott'm Forest",
    away: "Brighton & Hove Albion",
    score: { home: 7, away: 0 },
    scorers: [],
    formationName: "4-4-2 Flat",
    seed: 1,
    code: "v1...",
    path: "/game/draft",
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

describe("summaryFrom", () => {
  const player = (playerId: number, name: string) => ({ playerId, name });
  const team = (
    name: string,
    players: ReturnType<typeof player>[],
    bench: ReturnType<typeof player>[] = [],
  ): GameTeam =>
    ({
      teamId: -1,
      name,
      season: 0,
      formation: { name: "4-4-2 Flat", season: 0, slots: [] },
      players,
      bench,
    }) as unknown as GameTeam;

  // ⚠️ `displayName` keeps a two-word name whole and only collapses three or more, so a
  // fixture of two-word names would assert nothing about it. Van Nistelrooy also exercises
  // the particle rule — the surname is "van Nistelrooy", not "Nistelrooy".
  const home = team("Your XI", [player(1, "Ruud van Nistelrooy")], [player(3, "Alan Shearer")]);
  const away = team("The Rivals", [player(2, "Jamie Carragher")]);

  it("names scorers from both squads AND both benches", () => {
    const out = summaryFrom({
      home,
      away,
      events: [
        { minute: 10, kind: "goal", side: "home", playerId: 1, source: "open" },
        { minute: 20, kind: "goal", side: "away", playerId: 2, source: "penalty" },
        // A substitute scoring — only reachable if the bench is in the name map.
        { minute: 80, kind: "goal", side: "home", playerId: 3, source: "open" },
      ] as unknown as MatchEvent[],
      score: { home: 2, away: 1 },
      formationName: "4-4-2 Flat",
      seed: 99,
      code: "v1.xyz",
    });
    expect(out.scorers.map((s) => s.name)).toEqual([
      "van Nistelrooy",
      "Jamie Carragher",
      "Alan Shearer",
    ]);
    expect(out.home).toBe("Your XI");
    expect(out.away).toBe("The Rivals");
    expect(out.code).toBe("v1.xyz");
    expect(out.formationName).toBe("4-4-2 Flat");
  });

  it("shortens names the way the rest of the app does", () => {
    // Goes through `displayName`, so a card and a scoreline never disagree about a name.
    const out = summaryFrom({
      home,
      away,
      events: [
        { minute: 10, kind: "goal", side: "home", playerId: 1, source: "open" },
      ] as unknown as MatchEvent[],
      score: { home: 1, away: 0 },
      formationName: "4-4-2 Flat",
      seed: 1,
      code: "v1.x",
    });
    expect(out.scorers[0].name).toBe("van Nistelrooy");
  });

  it("falls back to an id rather than crashing on an unknown scorer", () => {
    const out = summaryFrom({
      home,
      away,
      events: [
        { minute: 10, kind: "goal", side: "home", playerId: 4242, source: "open" },
      ] as unknown as MatchEvent[],
      score: { home: 1, away: 0 },
      formationName: "4-4-2 Flat",
      seed: 1,
      code: "v1.x",
    });
    expect(out.scorers[0].name).toBe("#4242");
  });
});

/**
 * ⛔ Owner-reported, 2026-08-19: a six-scorer card printed its last scorer straight through
 * the shape-and-seed line.
 *
 * ⚠️ Nothing could have caught it. The layout was three constants inside a canvas paint
 * function — 418, ×28, cap 6 — that nobody ever compared against the footer at H−74, and a
 * canvas paints in jsdom's void, so no test could see the pixels. The arithmetic is the
 * thing under test; moving it out of the paint function is what makes it testable at all.
 */
describe("scorerLayout", () => {
  it("⛔ never reaches the footer, at any scoreline the card can produce", () => {
    // 0 through a comfortably impossible 14 — the cap folds the tail into "+N", which is
    // itself a printed row and was the WORST case: it landed exactly on the URL baseline.
    for (let n = 0; n <= 14; n++) {
      const l = scorerLayout(n);
      expect(l.last).toBeLessThan(FOOTER_TOP);
    }
  });

  it("⚠️ the SIX-scorer card specifically — the shipped numbers put it 2px past the line", () => {
    const l = scorerLayout(6);
    expect(l.shown).toBe(6);
    expect(l.overflow).toBe(0);
    // The shipped layout computed 418 + 5×28 = 558 against a footer at 556.
    expect(l.first + 5 * l.step).toBeLessThan(FOOTER_TOP);
  });

  it("keeps the shipped spacing for a short list, so the common card is unchanged", () => {
    for (const n of [1, 2, 3, 4]) {
      const l = scorerLayout(n);
      expect(l.step).toBe(28);
      expect(l.size).toBe(18);
      expect(l.first).toBe(418);
    }
  });

  it("⚠️ shrinks the TEXT with the step — lines that tighten must not overlap either", () => {
    const tight = scorerLayout(12);
    const roomy = scorerLayout(2);
    expect(tight.step).toBeLessThan(roomy.step);
    expect(tight.size).toBeLessThan(roomy.size);
    // A line's glyphs must fit inside its own row.
    expect(tight.size).toBeLessThanOrEqual(tight.step);
  });

  it("caps the printed list and counts the rest", () => {
    const l = scorerLayout(9);
    expect(l.shown).toBe(6);
    expect(l.overflow).toBe(3);
  });
});
