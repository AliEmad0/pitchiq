import { describe, expect, it } from "vitest";

import type {
  Standing,
  Player,
  Fixture,
  Leaderboards,
  ComparisonMetrics,
} from "../../src/data/schemas";
import type { TriviaData, TriviaCtx } from "../../src/features/trivia/types";
import { disciplineRule } from "../../src/features/trivia/rules/discipline";
import { goalExtremesRule } from "../../src/features/trivia/rules/goal-extremes";
import { lopsidedRule } from "../../src/features/trivia/rules/lopsided";
import { symmetricGoalsRule } from "../../src/features/trivia/rules/symmetric-goals";
import { goalRecordRule } from "../../src/features/trivia/rules/goal-record";
import { positionRecordRule } from "../../src/features/trivia/rules/position-record";
import { careerGoalsRule } from "../../src/features/trivia/rules/career-goals";
import { playerVsCollectiveRule } from "../../src/features/trivia/rules/player-vs-collective";
import { headToHeadRule } from "../../src/features/trivia/rules/head-to-head";
import { streakRule } from "../../src/features/trivia/rules/streak";
import { TRIVIA_DEFAULTS } from "./_helpers/trivia";

// --- synthetic data fixtures -------------------------------------------------

function metrics(p: Partial<ComparisonMetrics>): ComparisonMetrics {
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
    ...p,
  };
}

function player(id: number, name: string, m: Partial<ComparisonMetrics>, teamId = 1): Player {
  return {
    id,
    name,
    teamId,
    teamName: `Team ${teamId}`,
    position: "Midfielder",
    photo: null,
    metrics: metrics(m),
  };
}

function standing(rank: number, teamId: number, name: string, gf: number, ga: number): Standing {
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

function fixture(
  id: string,
  homeTeamId: number,
  awayTeamId: number,
  homeScore: number | null,
  awayScore: number | null,
  date = "2024-01-01",
): Fixture {
  return {
    id,
    date,
    homeTeamId,
    awayTeamId,
    homeTeamName: `Team ${homeTeamId}`,
    awayTeamName: `Team ${awayTeamId}`,
    homeScore,
    awayScore,
    venue: "",
    teamStats: null,
    halfTime: null,
    referee: null,
  };
}

type SeasonData = {
  standings?: Standing[];
  players?: Player[];
  fixtures?: Fixture[];
  leaderboards?: Leaderboards;
};

/** In-memory TriviaData over a focus season + optional historical seasons. */
function fakeData(season: number, bySeason: Record<number, SeasonData>): TriviaData {
  const get = (s: number | undefined) => bySeason[s ?? season] ?? {};
  return {
    ...TRIVIA_DEFAULTS,
    season,
    standings: async (s) => get(s).standings ?? null,
    players: async (s) => get(s).players ?? null,
    fixtures: async (s) => get(s).fixtures ?? null,
    leaderboards: async (s) => get(s).leaderboards ?? null,
    seasons: async () =>
      Object.keys(bySeason)
        .map(Number)
        .sort((a, b) => b - a),
    goalAttribution: async () => null,
    managers: async () => null,
    fixtureExtras: async () => null,
  };
}

function emptyLeaderboards(): Leaderboards {
  return { topScorers: [], topAssists: [], topYellowCards: [], topRedCards: [] };
}

function standingsOf(goalsFor: number[]): Standing[] {
  // teamId === rank === index+1; goalsAgainst arbitrary-but-stable.
  return goalsFor.map((gf, i) => standing(i + 1, i + 1, `Team ${i + 1}`, gf, 30));
}

const leagueCtx: TriviaCtx = { scope: "league" };

// --- R8 — Discipline ---------------------------------------------------------

describe("R8 — discipline (most yellow cards)", () => {
  it("fires for a clear yellow-card leader, with the gap to the next player", async () => {
    const data = fakeData(2024, {
      2024: {
        players: [
          player(1, "Aggressive Alan", { yellowCards: 12 }),
          player(2, "Mild Mike", { yellowCards: 7 }),
          player(3, "Calm Carl", { yellowCards: 3 }),
        ],
      },
    });
    const result = await disciplineRule.run(data, leagueCtx);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("Aggressive Alan");
    expect(result!.text).toContain("12");
    expect(result!.text).toContain("5"); // 12 - 7 gap
    expect(await result!.verify(data)).toBe(true);
  });

  it("does NOT fire when the top yellow-card count is a tie (no clear leader)", async () => {
    const data = fakeData(2024, {
      2024: {
        players: [player(1, "Alan", { yellowCards: 9 }), player(2, "Mike", { yellowCards: 9 })],
      },
    });
    expect(await disciplineRule.run(data, leagueCtx)).toBeNull();
  });

  it("does NOT fire when nobody has been booked", async () => {
    const data = fakeData(2024, {
      2024: {
        players: [player(1, "Alan", { yellowCards: 0 }), player(2, "Mike", { yellowCards: null })],
      },
    });
    expect(await disciplineRule.run(data, leagueCtx)).toBeNull();
  });

  it("verify() fails when the underlying data no longer supports the claim", async () => {
    const data = fakeData(2024, {
      2024: {
        players: [player(1, "Alan", { yellowCards: 12 }), player(2, "Mike", { yellowCards: 7 })],
      },
    });
    const result = await disciplineRule.run(data, leagueCtx);
    // A different data state where Mike now leads → the cached claim must not verify.
    const tampered = fakeData(2024, {
      2024: {
        players: [player(1, "Alan", { yellowCards: 4 }), player(2, "Mike", { yellowCards: 15 })],
      },
    });
    expect(await result!.verify(tampered)).toBe(false);
  });
});

// --- R1 — Goal extremes ------------------------------------------------------

describe("R1 — goal extremes (top scorers + defence rank)", () => {
  const standings = [
    standing(1, 1, "Sharp Shooters", 88, 30),
    standing(2, 2, "Tight Backs", 40, 25),
    standing(3, 3, "Leaky Lads", 30, 50),
  ];

  it("fires for the league's top-scoring team with its goals-conceded rank", async () => {
    const data = fakeData(2024, { 2024: { standings } });
    const result = await goalExtremesRule.run(data, leagueCtx);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("Sharp Shooters");
    expect(result!.text).toContain("88");
    expect(result!.text).toContain("second-fewest");
    expect(result!.text).toContain("30");
    expect(await result!.verify(data)).toBe(true);
  });

  it("fires on a team page only when that team is the top scorer", async () => {
    const data = fakeData(2024, { 2024: { standings } });
    expect(await goalExtremesRule.run(data, { scope: "team", id: 1 })).not.toBeNull();
    expect(await goalExtremesRule.run(data, { scope: "team", id: 2 })).toBeNull();
  });

  it("does NOT fire when two teams tie for the most goals", async () => {
    const data = fakeData(2024, {
      2024: { standings: [standing(1, 1, "A", 88, 30), standing(2, 2, "B", 88, 25)] },
    });
    expect(await goalExtremesRule.run(data, leagueCtx)).toBeNull();
  });
});

// --- R7 — Lopsided fixtures --------------------------------------------------

describe("R7 — lopsided fixtures (biggest win)", () => {
  it("reports the biggest-margin completed fixture", async () => {
    const data = fakeData(2024, {
      2024: {
        fixtures: [
          fixture("f1", 1, 2, 2, 1),
          fixture("f2", 3, 4, 7, 0, "2024-02-02"),
          fixture("f3", 5, 6, 1, 1),
          fixture("f4", 7, 8, null, null), // not played
        ],
      },
    });
    const result = await lopsidedRule.run(data, leagueCtx);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("7");
    expect(result!.text).toContain("Team 3");
    expect(result!.text).toContain("Team 4");
    expect(await result!.verify(data)).toBe(true);
  });

  it("does NOT fire when no fixture has been played", async () => {
    const data = fakeData(2024, {
      2024: { fixtures: [fixture("f1", 1, 2, null, null)] },
    });
    expect(await lopsidedRule.run(data, leagueCtx)).toBeNull();
  });

  it("does NOT fire when every result is a draw (no winner)", async () => {
    const data = fakeData(2024, {
      2024: { fixtures: [fixture("f1", 1, 2, 1, 1), fixture("f2", 3, 4, 0, 0)] },
    });
    expect(await lopsidedRule.run(data, leagueCtx)).toBeNull();
  });
});

// --- R9 — Symmetric goals ----------------------------------------------------

describe("R9 — symmetric goals (two teams, same total)", () => {
  it("fires when two teams scored exactly the same number of goals", async () => {
    const data = fakeData(2024, {
      2024: {
        standings: [
          standing(1, 1, "Alpha", 71, 30),
          standing(2, 2, "Bravo", 50, 40),
          standing(3, 3, "Charlie", 50, 45),
        ],
      },
    });
    const result = await symmetricGoalsRule.run(data, leagueCtx);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("Bravo");
    expect(result!.text).toContain("Charlie");
    expect(result!.text).toContain("50");
    expect(await result!.verify(data)).toBe(true);
  });

  it("does NOT fire when every team has a distinct goal total", async () => {
    const data = fakeData(2024, {
      2024: {
        standings: [
          standing(1, 1, "A", 71, 30),
          standing(2, 2, "B", 50, 40),
          standing(3, 3, "C", 49, 45),
        ],
      },
    });
    expect(await symmetricGoalsRule.run(data, leagueCtx)).toBeNull();
  });
});

// --- R3 — Cross-season goal record (team) ------------------------------------

describe("R3 — most goals in a season (cross-season, team scope)", () => {
  it("fires when this season is the team's highest scoring in the data", async () => {
    const data = fakeData(2024, {
      2024: { standings: [standing(1, 1, "Climbers", 80, 30)] },
      2023: { standings: [standing(1, 1, "Climbers", 70, 35)] },
      2022: { standings: [standing(1, 1, "Climbers", 65, 40)] },
    });
    const result = await goalRecordRule.run(data, { scope: "team", id: 1 });
    expect(result).not.toBeNull();
    expect(result!.text).toContain("Climbers");
    expect(result!.text).toContain("80");
    expect(await result!.verify(data)).toBe(true);
  });

  it("does NOT fire when an earlier season scored more", async () => {
    const data = fakeData(2024, {
      2024: { standings: [standing(1, 1, "T", 70, 30)] },
      2023: { standings: [standing(1, 1, "T", 85, 35)] },
      2022: { standings: [standing(1, 1, "T", 60, 40)] },
    });
    expect(await goalRecordRule.run(data, { scope: "team", id: 1 })).toBeNull();
  });

  it("does NOT fire with fewer than 3 seasons of data (not interesting)", async () => {
    const data = fakeData(2024, {
      2024: { standings: [standing(1, 1, "T", 80, 30)] },
      2023: { standings: [standing(1, 1, "T", 70, 35)] },
    });
    expect(await goalRecordRule.run(data, { scope: "team", id: 1 })).toBeNull();
  });
});

// --- R5 — Position record (team) ---------------------------------------------

describe("R5 — best league position (cross-season, team scope)", () => {
  it("fires when this season is the team's best finish in the data", async () => {
    const data = fakeData(2024, {
      2024: { standings: [standing(2, 1, "Risers", 70, 30)] },
      2023: { standings: [standing(5, 1, "Risers", 60, 35)] },
      2022: { standings: [standing(8, 1, "Risers", 50, 45)] },
    });
    const result = await positionRecordRule.run(data, { scope: "team", id: 1 });
    expect(result).not.toBeNull();
    expect(result!.text).toContain("Risers");
    expect(await result!.verify(data)).toBe(true);
  });

  it("does NOT fire when the team finished higher in an earlier season", async () => {
    const data = fakeData(2024, {
      2024: { standings: [standing(4, 1, "T", 70, 30)] },
      2023: { standings: [standing(2, 1, "T", 60, 35)] },
      2022: { standings: [standing(8, 1, "T", 50, 45)] },
    });
    expect(await positionRecordRule.run(data, { scope: "team", id: 1 })).toBeNull();
  });
});

// --- R6 — Career goals milestone (player) ------------------------------------

describe("R6 — career goals milestone (player scope)", () => {
  it("fires when a player's career goals in the data cross a milestone", async () => {
    const data = fakeData(2024, {
      2024: { players: [player(1, "Sharp Striker", { goals: 20 })] },
      2023: { players: [player(1, "Sharp Striker", { goals: 18 })] },
      2022: { players: [player(1, "Sharp Striker", { goals: 15 })] },
    });
    const result = await careerGoalsRule.run(data, { scope: "player", id: 1 });
    expect(result).not.toBeNull();
    expect(result!.text).toContain("Sharp Striker");
    expect(result!.text).toContain("53");
    expect(await result!.verify(data)).toBe(true);
  });

  it("does NOT fire below the milestone threshold", async () => {
    const data = fakeData(2024, {
      2024: { players: [player(1, "Modest Mike", { goals: 10 })] },
      2023: { players: [player(1, "Modest Mike", { goals: 12 })] },
    });
    expect(await careerGoalsRule.run(data, { scope: "player", id: 1 })).toBeNull();
  });
});

// --- R2 — Player vs collective -----------------------------------------------

describe("R2 — top scorer outscoring whole teams", () => {
  it("fires when the top scorer has outscored entire clubs", async () => {
    const lb = emptyLeaderboards();
    lb.topScorers = [
      {
        rank: 1,
        playerId: 9,
        playerName: "Goal Machine",
        teamId: 1,
        teamName: "Team 1",
        value: 29,
      },
    ];
    const data = fakeData(2024, {
      2024: { standings: standingsOf([80, 28, 25]), leaderboards: lb },
    });
    const result = await playerVsCollectiveRule.run(data, leagueCtx);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("Goal Machine");
    expect(result!.text).toContain("29");
    expect(result!.text).toContain("2"); // outscored 2 teams (28, 25)
    expect(await result!.verify(data)).toBe(true);
  });

  it("does NOT fire when no team scored fewer than the top scorer", async () => {
    const lb = emptyLeaderboards();
    lb.topScorers = [
      { rank: 1, playerId: 9, playerName: "Striker", teamId: 1, teamName: "Team 1", value: 20 },
    ];
    const data = fakeData(2024, {
      2024: { standings: standingsOf([80, 40, 25]), leaderboards: lb },
    });
    expect(await playerVsCollectiveRule.run(data, leagueCtx)).toBeNull();
  });
});

// --- R4 — Head-to-head perfection --------------------------------------------

describe("R4 — no bottom-3 team has beaten a top-6 side", () => {
  // 10 teams: top6 = ranks 1-6, bottom3 = ranks 8-10.
  const standings = standingsOf([90, 80, 70, 60, 55, 50, 45, 30, 25, 20]);

  it("fires when bottom-3 sides have faced top-6 sides without beating them", async () => {
    const data = fakeData(2024, {
      2024: {
        standings,
        fixtures: [
          fixture("f1", 1, 9, 3, 0), // top-6 (1) beats bottom-3 (9)
          fixture("f2", 10, 2, 1, 1), // bottom-3 (10) draws top-6 (2)
        ],
      },
    });
    const result = await headToHeadRule.run(data, leagueCtx);
    expect(result).not.toBeNull();
    expect(result!.text.toLowerCase()).toContain("bottom");
    expect(await result!.verify(data)).toBe(true);
  });

  it("does NOT fire once a bottom-3 team has beaten a top-6 team", async () => {
    const data = fakeData(2024, {
      2024: {
        standings,
        fixtures: [fixture("f1", 9, 1, 2, 0)], // bottom-3 (9) beats top-6 (1)
      },
    });
    expect(await headToHeadRule.run(data, leagueCtx)).toBeNull();
  });

  it("does NOT fire when no bottom-3 vs top-6 fixture has been played (vacuous)", async () => {
    const data = fakeData(2024, {
      2024: { standings, fixtures: [fixture("f1", 1, 2, 1, 0)] }, // two top-6 sides
    });
    expect(await headToHeadRule.run(data, leagueCtx)).toBeNull();
  });
});

// --- R10 — Streaks -----------------------------------------------------------

describe("R10 — longest current unbeaten run", () => {
  it("fires for the team on the longest current unbeaten run", async () => {
    const data = fakeData(2024, {
      2024: {
        standings: standingsOf([50, 50, 50]),
        fixtures: [
          fixture("a3", 1, 2, 2, 0, "2024-03-01"), // team1 win
          fixture("a2", 3, 1, 0, 0, "2024-02-01"), // team1 draw
          fixture("a1", 1, 3, 1, 0, "2024-01-01"), // team1 win  → unbeaten 3
          fixture("b1", 2, 3, 0, 2, "2024-03-02"), // team2 most-recent = loss → run 0
        ],
      },
    });
    const result = await streakRule.run(data, leagueCtx);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("Team 1");
    expect(result!.text).toContain("3");
    expect(await result!.verify(data)).toBe(true);
  });

  it("does NOT fire when the longest unbeaten run is too short to be notable", async () => {
    const data = fakeData(2024, {
      2024: {
        standings: standingsOf([50, 50]),
        fixtures: [
          fixture("a2", 1, 2, 3, 0, "2024-02-01"), // team1 win
          fixture("a1", 2, 1, 1, 0, "2024-01-01"), // team1 most-recent-but-one... loss earlier
          fixture("a3", 1, 2, 0, 1, "2024-03-01"), // team1 most-recent = loss → run 0
        ],
      },
    });
    expect(await streakRule.run(data, leagueCtx)).toBeNull();
  });
});
