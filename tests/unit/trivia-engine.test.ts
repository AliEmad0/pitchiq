import { describe, expect, it } from "vitest";

import { generateTrivia } from "../../src/features/trivia/engine";
import { RULES } from "../../src/features/trivia/rules";
import type { RuleResult, TriviaData, TriviaRule } from "../../src/features/trivia/types";
import { TRIVIA_DEFAULTS } from "./_helpers/trivia";

const emptyData: TriviaData = {
  ...TRIVIA_DEFAULTS,
  season: 2024,
  standings: async () => null,
  players: async () => null,
  fixtures: async () => null,
  leaderboards: async () => null,
  seasons: async () => [2024],
  goalAttribution: async () => null,
  managers: async () => null,
  fixtureExtras: async () => null,
};

function fakeRule(id: string, scopes: TriviaRule["scopes"], result: RuleResult | null): TriviaRule {
  return { id, title: id, scopes, run: async () => result };
}

describe("generateTrivia", () => {
  it("emits a verified fact stamped with id, rule, scope and verifiedAt", async () => {
    const r = fakeRule("RX", ["league"], {
      text: "Fun fact",
      sources: [],
      verify: async () => true,
    });
    const facts = await generateTrivia(
      emptyData,
      { scope: "league" },
      { rules: [r], now: () => "2026-01-01T00:00:00Z" },
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      text: "Fun fact",
      rule: "RX",
      scope: "league",
      verifiedAt: "2026-01-01T00:00:00Z",
    });
    expect(facts[0].id).toBeTruthy();
  });

  it("drops a fact whose claim does not re-verify (defensive)", async () => {
    const r = fakeRule("RX", ["league"], { text: "Bogus", sources: [], verify: async () => false });
    expect(await generateTrivia(emptyData, { scope: "league" }, { rules: [r] })).toHaveLength(0);
  });

  it("skips rules that don't apply to the requested scope", async () => {
    const r = fakeRule("RT", ["team"], {
      text: "team only",
      sources: [],
      verify: async () => true,
    });
    expect(await generateTrivia(emptyData, { scope: "league" }, { rules: [r] })).toHaveLength(0);
  });

  it("skips rules that return null (conditions not met)", async () => {
    const r = fakeRule("RN", ["league"], null);
    expect(await generateTrivia(emptyData, { scope: "league" }, { rules: [r] })).toHaveLength(0);
  });

  it("gives the same fact a stable id regardless of verifiedAt", async () => {
    const r = fakeRule("RX", ["league"], { text: "Stable", sources: [], verify: async () => true });
    const a = await generateTrivia(emptyData, { scope: "league" }, { rules: [r], now: () => "a" });
    const b = await generateTrivia(emptyData, { scope: "league" }, { rules: [r], now: () => "b" });
    expect(a[0].id).toBe(b[0].id);
  });

  // TASK-M82 added R27-R32 — the first rules to read the event stream, the row-level
  // enrichment summary and the manager honours map.
  it("ships all 32 rules (R1-R32), each unique", () => {
    const ids = RULES.map((r) => r.id);
    expect(ids).toHaveLength(32);
    expect(new Set(ids).size).toBe(32);
  });

  it("produces verified facts from the real rule library (league scope)", async () => {
    const data: TriviaData = {
      ...TRIVIA_DEFAULTS,
      ...emptyData,
      standings: async () => [
        st(1, 1, "Runaway United", 90, 20),
        st(2, 2, "Mid Town", 50, 45),
        st(3, 3, "Also Town", 50, 60),
      ],
      fixtures: async () => [
        fx("f1", 1, 3, 8, 0), // biggest win → R7
        fx("f2", 2, 3, 1, 1),
      ],
    };
    const facts = await generateTrivia(data, { scope: "league" }, { now: () => "t" });
    // R1 (top scorer team), R7 (biggest win), R9 (two teams on 50) all fire.
    expect(facts.length).toBeGreaterThanOrEqual(2);
    expect(facts.every((f) => f.text.length > 0 && f.verifiedAt === "t")).toBe(true);
    expect(new Set(facts.map((f) => f.id)).size).toBe(facts.length); // unique ids
  });
});

function st(rank: number, teamId: number, name: string, gf: number, ga: number) {
  return {
    rank,
    teamId,
    teamName: name,
    played: 38,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: gf,
    goalsAgainst: ga,
    goalsDiff: gf - ga,
    points: 0,
  };
}
function fx(id: string, home: number, away: number, hs: number, as: number) {
  return {
    id,
    date: "2024-01-01",
    homeTeamId: home,
    awayTeamId: away,
    homeTeamName: `Team ${home}`,
    awayTeamName: `Team ${away}`,
    homeScore: hs,
    awayScore: as,
    venue: "",
    teamStats: null,
    halfTime: null,
    referee: null,
  };
}
