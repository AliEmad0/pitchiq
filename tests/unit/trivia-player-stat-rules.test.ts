import { describe, expect, it } from "vitest";

import { finishingOverperformerRule } from "../../src/features/trivia/rules/finishing-overperformer";
import { creativeArchitectRule } from "../../src/features/trivia/rules/creative-architect";
import { goldenGloveRule } from "../../src/features/trivia/rules/golden-glove";
import { transferImpactRule } from "../../src/features/trivia/rules/transfer-impact";
import type { ComparisonMetrics, Player } from "../../src/data/schemas";
import type { TriviaData } from "../../src/features/trivia/types";
import { TRIVIA_DEFAULTS } from "./_helpers/trivia";

function metrics(over: Partial<ComparisonMetrics> = {}): ComparisonMetrics {
  return {
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
    ...over,
  };
}

function player(over: Partial<Player> = {}): Player {
  return {
    id: 10,
    name: "Striker One",
    teamId: 1,
    teamName: "T",
    position: "Forward",
    photo: null,
    metrics: metrics(),
    ...over,
  } as Player;
}

/** Minimal TriviaData whose focus season returns one player. */
function data(season: number, players: Player[]): TriviaData {
  return {
    ...TRIVIA_DEFAULTS,
    season,
    standings: async () => null,
    players: async (s = season) => (s === season ? players : null),
    fixtures: async () => null,
    leaderboards: async () => null,
    seasons: async () => [season],
    goalAttribution: async () => null,
    managers: async () => null,
    fixtureExtras: async () => null,
  };
}

describe("R14 — finishing overperformer", () => {
  it("fires when goals beat xG by >= 5", async () => {
    const d = data(2018, [player({ metrics: metrics({ goals: 22, xg: 14.5 }) })]);
    const res = await finishingOverperformerRule.run(d, { scope: "player", id: 10 });
    expect(res?.text).toBe(
      "In 2018-19, Striker One scored 22 goals from just 14.5 xG — outperforming his expected goals by +7.5.",
    );
    expect(await res!.verify(d)).toBe(true);
  });

  it("returns null when the delta is below the threshold", async () => {
    const d = data(2018, [player({ metrics: metrics({ goals: 16, xg: 14.5 }) })]);
    expect(await finishingOverperformerRule.run(d, { scope: "player", id: 10 })).toBeNull();
  });

  it("returns null when xG is absent (pre-2017 era)", async () => {
    const d = data(2005, [player({ metrics: metrics({ goals: 25, xg: null }) })]);
    expect(await finishingOverperformerRule.run(d, { scope: "player", id: 10 })).toBeNull();
  });
});

describe("R15 — creative architect", () => {
  it("fires when xA >= 8", async () => {
    const d = data(2019, [player({ metrics: metrics({ assists: 20, xa: 13.8 }) })]);
    const res = await creativeArchitectRule.run(d, { scope: "player", id: 10 });
    expect(res?.text).toBe(
      "In 2019-20, Striker One created chances worth 13.8 expected assists (20 actual assists).",
    );
    expect(await res!.verify(d)).toBe(true);
  });

  it("returns null below the xA threshold", async () => {
    const d = data(2019, [player({ metrics: metrics({ assists: 5, xa: 4.2 }) })]);
    expect(await creativeArchitectRule.run(d, { scope: "player", id: 10 })).toBeNull();
  });

  it("handles a null actual-assists count gracefully", async () => {
    const d = data(2019, [player({ metrics: metrics({ assists: null, xa: 9.1 }) })]);
    const res = await creativeArchitectRule.run(d, { scope: "player", id: 10 });
    expect(res?.text).toContain("(0 actual assists)");
  });
});

describe("R16 — golden glove", () => {
  it("fires for >= 10 clean sheets with the shutout rate", async () => {
    const d = data(2024, [player({ metrics: metrics({ cleanSheets: 14, appearances: 38 }) })]);
    const res = await goldenGloveRule.run(d, { scope: "player", id: 10 });
    expect(res?.text).toBe(
      "In 2024-25, Striker One's team kept 14 clean sheets in 38 appearances — a shutout in 37% of his games.",
    );
    expect(await res!.verify(d)).toBe(true);
  });

  it("returns null below 10 clean sheets", async () => {
    const d = data(2024, [player({ metrics: metrics({ cleanSheets: 6, appearances: 30 }) })]);
    expect(await goldenGloveRule.run(d, { scope: "player", id: 10 })).toBeNull();
  });

  it("returns null when clean sheets are unavailable (pre-2000 era)", async () => {
    const d = data(1996, [player({ metrics: metrics({ cleanSheets: null, appearances: 38 }) })]);
    expect(await goldenGloveRule.run(d, { scope: "player", id: 10 })).toBeNull();
  });
});

describe("R17 — mid-season transfer impact", () => {
  const splits = [
    {
      teamId: 1,
      teamName: "Crystal Palace",
      appearances: 20,
      goals: 6,
      assists: 2,
      yellowCards: 1,
      redCards: 0,
    },
    {
      teamId: 2,
      teamName: "Arsenal",
      appearances: 15,
      goals: 8,
      assists: 3,
      yellowCards: 0,
      redCards: 0,
    },
  ];

  it("fires for a two-club season with the combined output", async () => {
    const d = data(2024, [player({ splits })]);
    const res = await transferImpactRule.run(d, { scope: "player", id: 10 });
    expect(res?.text).toBe(
      "In 2024-25, Striker One turned out for Crystal Palace and Arsenal, contributing 14 goals and 5 assists across them.",
    );
    expect(await res!.verify(d)).toBe(true);
  });

  it("returns null for a single-club season (no splits)", async () => {
    const d = data(2024, [player({ splits: undefined })]);
    expect(await transferImpactRule.run(d, { scope: "player", id: 10 })).toBeNull();
  });
});
