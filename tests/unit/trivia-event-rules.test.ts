import { describe, expect, it } from "vitest";

import { opponentSpreadRule } from "../../src/features/trivia/rules/opponent-spread";
import { favouriteOpponentRule } from "../../src/features/trivia/rules/favourite-opponent";
import { multiGoalGamesRule } from "../../src/features/trivia/rules/multi-goal-games";
import type { GoalAttribution, Player } from "../../src/data/schemas";
import type { TriviaData } from "../../src/features/trivia/types";
import { TRIVIA_DEFAULTS } from "./_helpers/trivia";

function p(id: number, name: string): Player {
  return {
    id,
    name,
    teamId: 1,
    teamName: "T",
    position: "Forward",
    photo: null,
    metrics: {
      appearances: null,
      goals: null,
      assists: null,
      passAccuracy: null,
      keyPasses: null,
      tackles: null,
      interceptions: null,
      duelsWon: null,
      dribblesCompleted: null,
      shotsOnTarget: null,
      yellowCards: null,
      redCards: null,
    },
  } as Player;
}

/** Minimal TriviaData over a committed-map + a single focus-season squad. */
function data(map: GoalAttribution | null, players: Player[] = []): TriviaData {
  return {
    ...TRIVIA_DEFAULTS,
    season: 2024,
    standings: async () => null,
    players: async () => players,
    fixtures: async () => null,
    leaderboards: async () => null,
    seasons: async () => [2024],
    goalAttribution: async () => map,
    managers: async () => null,
    fixtureExtras: async () => null,
  };
}

function spreadMap(distinct: number): GoalAttribution {
  const opponents: Record<string, number> = {};
  for (let i = 1; i <= distinct; i++) opponents[String(i)] = 1;
  return { teams: {}, players: { "10": { opponents, hatTricks: 0, multiGoalGames: 0 } } };
}

describe("R11 — opponent-scoring spread", () => {
  it("fires above the threshold with the distinct-club count", async () => {
    const d = data(spreadMap(12), [p(10, "Striker One")]);
    const res = await opponentSpreadRule.run(d, { scope: "player", id: 10 });
    expect(res?.text).toBe(
      "Striker One has scored against 12 different Premier League clubs in our match data.",
    );
    expect(await res!.verify(d)).toBe(true);
  });

  it("returns null below the threshold", async () => {
    const d = data(spreadMap(5), [p(10, "Striker One")]);
    expect(await opponentSpreadRule.run(d, { scope: "player", id: 10 })).toBeNull();
  });

  it("returns null when the player is absent from the map", async () => {
    const d = data(spreadMap(12), [p(99, "Other")]);
    expect(await opponentSpreadRule.run(d, { scope: "player", id: 99 })).toBeNull();
  });

  it("verify fails when the count no longer matches", async () => {
    const d12 = data(spreadMap(12), [p(10, "Striker One")]);
    const res = await opponentSpreadRule.run(d12, { scope: "player", id: 10 });
    const d5 = data(spreadMap(5), [p(10, "Striker One")]);
    expect(await res!.verify(d5)).toBe(false);
  });
});

function faveMap(
  opponents: Record<string, number>,
  teams: Record<string, string>,
): GoalAttribution {
  return { teams, players: { "10": { opponents, hatTricks: 0, multiGoalGames: 0 } } };
}

describe("R12 — favourite opponent", () => {
  it("names the most-scored-against club above the threshold", async () => {
    const d = data(faveMap({ "42": 7, "57": 3 }, { "42": "Arsenal", "57": "Liverpool" }), [
      p(10, "Striker One"),
    ]);
    const res = await favouriteOpponentRule.run(d, { scope: "player", id: 10 });
    expect(res?.text).toBe(
      "Striker One's favourite opponent is Arsenal — 7 goals in our match data.",
    );
    expect(await res!.verify(d)).toBe(true);
  });

  it("returns null when the max tally is below the threshold", async () => {
    const d = data(faveMap({ "42": 2 }, { "42": "Arsenal" }), [p(10, "Striker One")]);
    expect(await favouriteOpponentRule.run(d, { scope: "player", id: 10 })).toBeNull();
  });

  it("breaks ties by lowest teamId", async () => {
    const d = data(faveMap({ "57": 5, "42": 5 }, { "42": "Arsenal", "57": "Liverpool" }), [
      p(10, "Striker One"),
    ]);
    const res = await favouriteOpponentRule.run(d, { scope: "player", id: 10 });
    expect(res?.text).toContain("Arsenal"); // teamId 42 < 57
  });
});

function htMap(hatTricks: number, multiGoalGames: number): GoalAttribution {
  return { teams: {}, players: { "10": { opponents: {}, hatTricks, multiGoalGames } } };
}

describe("R13 — hat-tricks / multi-goal games", () => {
  it("reports hat-tricks (plural) when >= 1", async () => {
    const d = data(htMap(3, 8), [p(10, "Striker One")]);
    const res = await multiGoalGamesRule.run(d, { scope: "player", id: 10 });
    expect(res?.text).toBe("Striker One has scored 3 Premier League hat-tricks in our match data.");
    expect(await res!.verify(d)).toBe(true);
  });

  it("uses the singular for exactly one hat-trick", async () => {
    const d = data(htMap(1, 4), [p(10, "Striker One")]);
    const res = await multiGoalGamesRule.run(d, { scope: "player", id: 10 });
    expect(res?.text).toBe("Striker One has scored 1 Premier League hat-trick in our match data.");
  });

  it("falls back to multi-goal games when there are no hat-tricks", async () => {
    const d = data(htMap(0, 5), [p(10, "Striker One")]);
    const res = await multiGoalGamesRule.run(d, { scope: "player", id: 10 });
    expect(res?.text).toBe(
      "Striker One has scored 2+ goals in 5 Premier League matches in our data.",
    );
    expect(await res!.verify(d)).toBe(true);
  });

  it("returns null when below both thresholds", async () => {
    const d = data(htMap(0, 2), [p(10, "Striker One")]);
    expect(await multiGoalGamesRule.run(d, { scope: "player", id: 10 })).toBeNull();
  });
});
