import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import type { MatchResult, MatchSetup } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import type { PlayerRatings } from "@/features/game/domain/ratings";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import { defaultAnswer } from "@/features/game/domain/match-decisions";
import { recordMatch, replayMatch } from "@/features/game/domain/match-runner";
import { drive, runMatch, simulate } from "@/features/game/domain/simulate";
import { makeGameTeam } from "@/features/game/domain/team";

function squad(prefix: string, offset: number, base: Partial<PlayerRatings> = {}): GamePlayer[] {
  const roles: PlayerRole[] = ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CAM", "RW", "LW", "CF"];
  return roles.map((role, i) => ({
    cardId: `${offset + i}@2020`,
    playerId: offset + i,
    season: 2020,
    name: `${prefix}${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: {
      attack: 50,
      creation: 50,
      defense: 50,
      physical: 50,
      discipline: 50,
      overall: 50,
      ...base,
    },
  }));
}

function bench(prefix: string, offset: number): GamePlayer[] {
  const roles: PlayerRole[] = ["GK", "CB", "CM", "CF", "RW"];
  return roles.map((role, i) => ({
    cardId: `${offset + i}@2020`,
    playerId: offset + i,
    season: 2020,
    name: `${prefix}B${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: {
      attack: 50,
      creation: 50,
      defense: 50,
      physical: 50,
      discipline: 50,
      overall: 50,
    },
  }));
}

const shape = { name: "", season: 2020, slots: [] };
const setup = (seed: number, over: Partial<MatchSetup> = {}): MatchSetup => ({
  home: makeGameTeam(1, "H", 2020, shape, squad("H", 100), bench("H", 200)),
  away: makeGameTeam(2, "A", 2020, shape, squad("A", 300), bench("A", 400)),
  seed,
  targetGoalsPerMatch: 2.7,
  ...over,
});

/** Drive a match, recording every decision the engine raised. */
function record(
  s: MatchSetup,
  policy: (d: MatchDecision) => DecisionAnswer = defaultAnswer,
): { seen: MatchDecision[]; result: MatchResult } {
  const seen: MatchDecision[] = [];
  const result = drive(runMatch(s), (d) => {
    seen.push(d);
    return policy(d);
  });
  return { seen, result };
}

describe("sub-offer", () => {
  it("is raised for both sides on every minute of the substitution window", () => {
    const { seen } = record(setup(11));
    const offers = seen.filter((d) => d.kind === "sub-offer");
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(o.minute).toBeGreaterThanOrEqual(46);
      expect(o.minute).toBeLessThanOrEqual(90);
    }
    expect(new Set(offers.map((o) => o.side))).toEqual(new Set(["home", "away"]));
  });

  it("carries the engine's own roll and its own suggestion", () => {
    const { seen } = record(setup(11));
    const suggested = seen.filter((d) => d.kind === "sub-offer" && d.engineSuggests);
    expect(suggested.length).toBeGreaterThan(0);
  });

  it("⚠️ OFFERS the goalkeeper to the coach — he may change his keeper", () => {
    /**
     * Changed deliberately (owner, 2026-08-19): the bench screen could not substitute a
     * goalkeeper at all, because `legalOffFor` mirrored `pickPlayerOff`'s outfield-only
     * rule. `legalOff` is the COACH's menu, and a coach can absolutely change his keeper.
     */
    const { seen } = record(setup(23));
    const offers = seen.filter((d) => d.kind === "sub-offer");
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.some((d) => d.legalOff.some((p) => p.role === "GK"))).toBe(true);
  });

  it("⛔ but the ENGINE never suggests pulling the goalkeeper itself", () => {
    // The automatic path keeps its own outfield-only filter inside `pickPlayerOff`, so
    // opening the coach's menu must not let the engine hook its own keeper.
    const { seen } = record(setup(23));
    for (const d of seen) {
      if (d.kind !== "sub-offer" || !d.engineSuggests) continue;
      const suggested = d.legalOff.find((p) => p.playerId === d.suggestedOff);
      if (suggested != null) expect(suggested.role).not.toBe("GK");
    }
  });

  it("driving with defaultAnswer reproduces simulate exactly", () => {
    for (const seed of [1, 42, 777, 20260811]) {
      expect(record(setup(seed)).result).toEqual(simulate(setup(seed)));
    }
  });
});

describe("response", () => {
  it("is raised once per goal, for the side that conceded", () => {
    // Every goal opens a response window — including one later chalked off, because the
    // window opens when it is scored and the review only lands a minute later.
    const { seen, result } = record(setup(42));
    const responses = seen.filter((d) => d.kind === "response");
    const goals = result.events.filter((e) => e.kind === "goal" && e.disallowedAt == null);
    expect(responses.length).toBe(goals.length);
    expect(responses.length).toBeGreaterThan(0);
  });

  it("names the side that conceded, not the scorer", () => {
    const { seen } = record(setup(42));
    for (const d of seen) {
      if (d.kind !== "response") continue;
      expect(d.side).toBe(d.concededBy);
    }
  });

  it("holding reproduces simulate exactly", () => {
    for (const seed of [3, 88, 4242]) {
      expect(record(setup(seed)).result).toEqual(simulate(setup(seed)));
    }
  });
});

describe("forced prompts", () => {
  it("prompts for a replacement on a forcing injury, never on a knock", () => {
    // Sweep seeds so both forcing severities AND at least one knock actually occur —
    // a fixture that never produces a knock cannot express the boundary being tested.
    let sawForced = 0;
    let sawKnock = 0;
    for (let s = 0; s < 120; s++) {
      const { seen, result } = record(setup(s));
      const prompts = seen.filter((d) => d.kind === "injury-sub");
      const injuries = result.events.filter((e) => e.kind === "injury");
      const knocks = injuries.filter((e) => e.injurySeverity === "knock");
      const forcing = injuries.filter((e) => e.injurySeverity !== "knock");
      expect(prompts.length).toBe(forcing.length);
      sawForced += forcing.length;
      sawKnock += knocks.length;
    }
    expect(sawForced).toBeGreaterThan(0);
    expect(sawKnock).toBeGreaterThan(0);
  });

  it("prompts on any dismissal, however the player was sent off", () => {
    let sawDismissal = 0;
    for (let s = 0; s < 150; s++) {
      const { seen, result } = record(setup(s));
      const prompts = seen.filter((d) => d.kind === "dismissal");
      const reds = result.events.filter((e) => e.kind === "card" && e.card === "red");
      expect(prompts.length).toBe(reds.length);
      sawDismissal += reds.length;
    }
    expect(sawDismissal).toBeGreaterThan(0);
  });

  it("declining a dismissal leaves the side a man short rather than forcing a change", () => {
    // A red card is not a substitution: nobody replaces the dismissed player.
    for (let s = 0; s < 150; s++) {
      const { result } = record(setup(s));
      const reds = result.events.filter((e) => e.kind === "card" && e.card === "red");
      if (reds.length === 0) continue;
      const subsAfter = result.events.filter(
        (e) => e.kind === "substitution" && e.minute === reds[0].minute && e.side === reds[0].side,
      );
      expect(subsAfter.length).toBe(0);
      return;
    }
    throw new Error("no dismissal in the swept seeds — the assertion never ran");
  });

  it("forced prompts do not change the match when answered by default", () => {
    for (const seed of [5, 60, 600, 6000]) {
      expect(record(setup(seed)).result).toEqual(simulate(setup(seed)));
    }
  });
});

const alwaysOverload = (d: MatchDecision): DecisionAnswer =>
  d.kind === "response"
    ? { kind: "response", minute: d.minute, side: d.side, choice: "overload" }
    : defaultAnswer(d);

describe("replay", () => {
  it("a recorded match replays byte-for-byte", () => {
    for (const seed of [1, 2, 99, 12345]) {
      const live = recordMatch(setup(seed), alwaysOverload);
      expect(replayMatch(setup(seed), live.decisions)).toEqual(live);
    }
  });

  it("a decision list from another seed is rejected, not silently misapplied", () => {
    const live = recordMatch(setup(7), alwaysOverload);
    expect(() => replayMatch(setup(8), live.decisions)).toThrow(/does not match/i);
  });

  it("a truncated list finishes on the default policy", () => {
    // An abandoned match still produces a complete, valid one. Deliberately NOT asserting
    // the resumed decision count equals the original: once a response choice actually
    // changes the weights, the two runs diverge after the truncation point and a
    // differing count is correct rather than a defect.
    const live = recordMatch(setup(21), alwaysOverload);
    const head = live.decisions.slice(0, 3);
    const resumed = replayMatch(setup(21), head);
    expect(resumed.events[resumed.events.length - 1].kind).toBe("fulltime");
    expect(resumed.decisions.slice(0, 3)).toEqual(head);
    expect(resumed.decisions.length).toBeGreaterThan(3);
  });

  it("recording with defaultAnswer reproduces simulate exactly", () => {
    for (const seed of [13, 130, 1300]) {
      const { decisions, ...result } = recordMatch(setup(seed), defaultAnswer);
      expect(decisions.length).toBeGreaterThan(0);
      expect(result).toEqual(simulate(setup(seed)));
    }
  });

  it("answering costs nothing — the match is identical up to the first divergent answer", () => {
    // Determinism rests on ANSWERING consuming no rolls. Once a response modifier bites
    // the two runs legitimately diverge, so the claim is scoped to before that point —
    // but it compares the EVENT STREAM, not just decision labels. Matching labels would
    // still pass if the rolls behind them had shifted.
    let compared = 0;
    for (const seed of [4, 44, 444, 4444]) {
      const coached = recordMatch(setup(seed), alwaysOverload);
      const auto = recordMatch(setup(seed), defaultAnswer);
      const firstResponse = coached.decisions.find((d) => d.kind === "response");
      if (firstResponse == null) continue;
      const before = (r: typeof coached) => r.events.filter((e) => e.minute < firstResponse.minute);
      expect(before(coached).length).toBeGreaterThan(0);
      expect(before(coached)).toEqual(before(auto));
      compared += 1;
    }
    expect(compared).toBeGreaterThan(0);
  });
});

describe("response choices change the match", () => {
  const choose =
    (choice: "overload" | "stabilize") =>
    (d: MatchDecision): DecisionAnswer =>
      d.kind === "response"
        ? { kind: "response", minute: d.minute, side: d.side, choice }
        : defaultAnswer(d);

  it("overload concedes more than stabilize across many seeds", () => {
    // ⚠️ Assert on a DISTRIBUTION. A single seed can easily give identical scorelines
    // under both choices, so a one-seed test would prove nothing at all.
    let overloadConceded = 0;
    let stabilizeConceded = 0;
    for (let s = 0; s < 400; s++) {
      overloadConceded += recordMatch(setup(s), choose("overload")).score.away;
      stabilizeConceded += recordMatch(setup(s), choose("stabilize")).score.away;
    }
    expect(overloadConceded).toBeGreaterThan(stabilizeConceded);
  });

  it("overload and stabilize produce different matches", () => {
    const a = recordMatch(setup(31), choose("overload"));
    const b = recordMatch(setup(31), choose("stabilize"));
    expect(JSON.stringify(a.events)).not.toBe(JSON.stringify(b.events));
  });
});
