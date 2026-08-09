import { describe, expect, it } from "vitest";
import type { MatchSetup, PenaltyOutcome } from "@/features/game/domain/match-types";
import { simulate } from "@/features/game/domain/simulate";
import type { GameTeam } from "@/features/game/domain/team";

/**
 * TASK-1822 Phase 2 — set pieces.
 *
 * A penalty is the most dramatic single moment in football and the engine had none.
 * It is also the clearest case for the branch-tree shape the spine was built for: one
 * trigger, nine possible endings, and one of them (saved-then-rebound-scored) still
 * produces a goal.
 *
 * CALIBRATION RULE: set-piece goals are SUBTRACTED from the open-play target rather
 * than added on top of it, so the season-authentic goals-per-match does not drift
 * upward every time a phase adds a new way to score. `game-match-harness.test.ts` pins
 * the total.
 */

const team = (name: string): GameTeam =>
  ({ teamId: 1, name, season: 2020, formation: null, players: [] }) as unknown as GameTeam;

const setup = (over: Partial<MatchSetup> = {}): MatchSetup => ({
  home: team("H"),
  away: team("A"),
  seed: 7,
  targetGoalsPerMatch: 2.7,
  homePower: { attack: 70, defense: 70, aggression: 45 },
  awayPower: { attack: 70, defense: 70, aggression: 45 },
  ...over,
});

const run = (n: number) => Array.from({ length: n }, (_, i) => simulate(setup({ seed: i + 1 })));

describe("penalties", () => {
  const matches = run(3000);
  const penalties = matches.flatMap((m) => m.events.filter((e) => e.kind === "penalty"));

  it("are awarded at roughly the real-football rate", () => {
    // The Premier League runs about 0.25-0.30 penalties per match.
    const perMatch = penalties.length / matches.length;
    expect(perMatch).toBeGreaterThan(0.12);
    expect(perMatch).toBeLessThan(0.5);
  });

  it("reaches every branch of the tree", () => {
    const seen = new Set(penalties.map((p) => p.penaltyOutcome));
    const expected: PenaltyOutcome[] = [
      "scored-top-corner",
      "scored-placed",
      "scored-panenka",
      "saved-corner",
      "saved-held",
      "saved-rebound-goal",
      "post",
      "crossbar",
      "wide",
    ];
    for (const outcome of expected) expect(seen).toContain(outcome);
  });

  it("converts at a plausible rate", () => {
    const scored = penalties.filter((p) => p.penaltyOutcome?.startsWith("scored")).length;
    const rate = scored / penalties.length;
    expect(rate).toBeGreaterThan(0.6);
    expect(rate).toBeLessThan(0.9);
  });

  it("emits a goal event for a converted penalty, so the score stays consistent", () => {
    // The UI derives the scoreline by counting `goal` events. A penalty that scored
    // without one would show a score that disagrees with the match result.
    //
    // Matched on `source`, not just the minute: an open-play goal can legitimately land
    // in the same minute as a MISSED penalty, and the first version of this test read
    // that as a bug. Tagging every goal with where it came from is what makes the
    // invariant checkable at all.
    for (const m of matches) {
      const penaltyGoals = m.events.filter((e) => e.kind === "goal" && e.source === "penalty");
      const converted = m.events.filter(
        (e) =>
          e.kind === "penalty" &&
          (e.penaltyOutcome?.startsWith("scored") || e.penaltyOutcome === "saved-rebound-goal"),
      );
      expect(penaltyGoals.length).toBe(converted.length);
      for (const p of converted) {
        expect(penaltyGoals.some((g) => g.minute === p.minute && g.side === p.side)).toBe(true);
      }
    }
  });

  it("tags every goal with its source", () => {
    for (const m of matches) {
      for (const g of m.events.filter((e) => e.kind === "goal")) {
        expect(["open", "penalty", "freekick", "own-goal"]).toContain(g.source);
      }
    }
  });

  it("counts the rebound goal as a goal", () => {
    const rebound = matches.find((m) =>
      m.events.some((e) => e.kind === "penalty" && e.penaltyOutcome === "saved-rebound-goal"),
    );
    expect(rebound).toBeDefined();
    const p = rebound?.events.find((e) => e.kind === "penalty");
    expect(rebound?.events.some((e) => e.kind === "goal" && e.minute === p?.minute)).toBe(true);
  });

  it("keeps every scoreline equal to the count of goal events", () => {
    for (const m of matches) {
      const home = m.events.filter((e) => e.kind === "goal" && e.side === "home").length;
      const away = m.events.filter((e) => e.kind === "goal" && e.side === "away").length;
      expect({ home, away }).toEqual(m.score);
    }
  });
});

describe("direct free kicks", () => {
  const matches = run(3000);
  const freeKicks = matches.flatMap((m) => m.events.filter((e) => e.kind === "freekick"));

  it("occur, but stay rarer than open play", () => {
    const perMatch = freeKicks.length / matches.length;
    expect(perMatch).toBeGreaterThan(0.15);
    expect(perMatch).toBeLessThan(1.2);
  });

  it("reaches every branch", () => {
    const seen = new Set(freeKicks.map((f) => f.freeKickOutcome));
    for (const outcome of ["scored", "saved", "wall", "wide"]) {
      expect(seen).toContain(outcome);
    }
  });

  it("converts rarely — a free-kick goal should feel special", () => {
    const scored = freeKicks.filter((f) => f.freeKickOutcome === "scored").length;
    expect(scored / freeKicks.length).toBeLessThan(0.2);
    expect(scored).toBeGreaterThan(0);
  });

  it("emits a goal event only when it goes in", () => {
    for (const m of matches) {
      const fkGoals = m.events.filter((e) => e.kind === "goal" && e.source === "freekick");
      const scored = m.events.filter(
        (e) => e.kind === "freekick" && e.freeKickOutcome === "scored",
      );
      expect(fkGoals.length).toBe(scored.length);
      for (const f of scored) {
        expect(fkGoals.some((g) => g.minute === f.minute && g.side === f.side)).toBe(true);
      }
    }
  });
});

describe("determinism survives the new branches", () => {
  it("replays byte-identically", () => {
    expect(simulate(setup({ seed: 99 }))).toEqual(simulate(setup({ seed: 99 })));
  });
});
