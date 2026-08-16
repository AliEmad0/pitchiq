import { describe, expect, it } from "vitest";

import { homeFortressRule } from "../../src/features/trivia/rules/home-fortress";
import { failedToScoreRule } from "../../src/features/trivia/rules/failed-to-score";
import { comebackKingsRule } from "../../src/features/trivia/rules/comeback-kings";
import { managerialMerryGoRoundRule } from "../../src/features/trivia/rules/managerial-merry-go-round";
import { yoYoClubRule } from "../../src/features/trivia/rules/yo-yo-club";
import type { Fixture, ManagersFile, Standing } from "../../src/data/schemas";
import type { TriviaData } from "../../src/features/trivia/types";
import { TRIVIA_DEFAULTS } from "./_helpers/trivia";

export function standing(over: Partial<Standing> = {}): Standing {
  return {
    rank: 1,
    teamId: 1,
    teamName: "Reds",
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalsDiff: 0,
    points: 0,
    ...over,
  };
}

export function fixture(over: Partial<Fixture> = {}): Fixture {
  return {
    id: "f",
    date: "2024-01-01",
    homeTeamId: 1,
    awayTeamId: 2,
    homeTeamName: "Reds",
    awayTeamName: "Blues",
    homeScore: 0,
    awayScore: 0,
    venue: "V",
    teamStats: null,
    halfTime: null,
    referee: null,
    ...over,
  };
}

/** TriviaData over a focus season's standings/fixtures/managers + optional cross-season standings. */
export function teamData(
  season: number,
  opts: {
    standings?: Standing[];
    fixtures?: Fixture[];
    managers?: ManagersFile;
    standingsBySeason?: Record<number, Standing[]>;
    seasons?: number[];
  },
): TriviaData {
  return {
    ...TRIVIA_DEFAULTS,
    season,
    standings: async (s = season) =>
      opts.standingsBySeason ? (opts.standingsBySeason[s] ?? null) : (opts.standings ?? null),
    players: async () => null,
    fixtures: async () => opts.fixtures ?? null,
    leaderboards: async () => null,
    seasons: async () => opts.seasons ?? [season],
    goalAttribution: async () => null,
    managers: async () => opts.managers ?? null,
    fixtureExtras: async () => null,
  };
}

// 18 home games, 0 losses: 13 wins (home 1-0) + 5 draws (1-1).
function unbeatenHome(): Fixture[] {
  const fs: Fixture[] = [];
  for (let i = 0; i < 13; i++)
    fs.push(fixture({ id: `w${i}`, homeTeamId: 1, awayTeamId: 9, homeScore: 1, awayScore: 0 }));
  for (let i = 0; i < 5; i++)
    fs.push(fixture({ id: `d${i}`, homeTeamId: 1, awayTeamId: 9, homeScore: 1, awayScore: 1 }));
  return fs;
}

describe("R18 — home fortress", () => {
  it("fires when a team is unbeaten across a full home slate", async () => {
    const d = teamData(2024, {
      standings: [standing({ teamId: 1, teamName: "Reds" })],
      fixtures: unbeatenHome(),
    });
    const res = await homeFortressRule.run(d, { scope: "team", id: 1 });
    expect(res?.text).toBe(
      "Reds were unbeaten at home in 2024-25 — 13 wins and 5 draws from 18 home games.",
    );
    expect(await res!.verify(d)).toBe(true);
  });

  it("returns null when there is a home loss", async () => {
    const fixtures = [
      ...unbeatenHome(),
      fixture({ id: "L", homeTeamId: 1, awayTeamId: 9, homeScore: 0, awayScore: 2 }),
    ];
    const d = teamData(2024, { standings: [standing({ teamId: 1 })], fixtures });
    expect(await homeFortressRule.run(d, { scope: "team", id: 1 })).toBeNull();
  });

  it("returns null for a short (in-progress) home slate", async () => {
    const fixtures = unbeatenHome().slice(0, 8);
    const d = teamData(2024, { standings: [standing({ teamId: 1 })], fixtures });
    expect(await homeFortressRule.run(d, { scope: "team", id: 1 })).toBeNull();
  });
});

describe("R19 — failed to score", () => {
  function withScorelessGames(scoreless: number, scoring: number) {
    const fs: Fixture[] = [];
    for (let i = 0; i < scoreless; i++)
      fs.push(fixture({ id: `z${i}`, homeTeamId: 1, awayTeamId: 9, homeScore: 0, awayScore: 1 }));
    for (let i = 0; i < scoring; i++)
      fs.push(fixture({ id: `g${i}`, homeTeamId: 1, awayTeamId: 9, homeScore: 2, awayScore: 0 }));
    return fs;
  }

  it("fires when scoreless in >= 12 matches", async () => {
    const d = teamData(2024, {
      standings: [standing({ teamId: 1, teamName: "Reds" })],
      fixtures: withScorelessGames(15, 23),
    });
    const res = await failedToScoreRule.run(d, { scope: "team", id: 1 });
    expect(res?.text).toBe("Reds failed to score in 15 of their 38 matches in 2024-25.");
    expect(await res!.verify(d)).toBe(true);
  });

  it("returns null below the threshold", async () => {
    const d = teamData(2024, {
      standings: [standing({ teamId: 1 })],
      fixtures: withScorelessGames(5, 33),
    });
    expect(await failedToScoreRule.run(d, { scope: "team", id: 1 })).toBeNull();
  });
});

describe("R20 — comeback kings", () => {
  // team 1 trailed at HT (0-1) but won at FT (2-1).
  function comebacks(count: number) {
    const fs: Fixture[] = [];
    for (let i = 0; i < count; i++)
      fs.push(
        fixture({
          id: `c${i}`,
          homeTeamId: 1,
          awayTeamId: 9,
          homeScore: 2,
          awayScore: 1,
          halfTime: { home: 0, away: 1 },
        }),
      );
    return fs;
  }

  it("fires when a team wins >= 3 games after trailing at half-time", async () => {
    const d = teamData(2024, {
      standings: [standing({ teamId: 1, teamName: "Reds" })],
      fixtures: comebacks(4),
    });
    const res = await comebackKingsRule.run(d, { scope: "team", id: 1 });
    expect(res?.text).toBe("Reds came from behind at half-time to win 4 times in 2024-25.");
    expect(await res!.verify(d)).toBe(true);
  });

  it("returns null below the threshold", async () => {
    const d = teamData(2024, { standings: [standing({ teamId: 1 })], fixtures: comebacks(2) });
    expect(await comebackKingsRule.run(d, { scope: "team", id: 1 })).toBeNull();
  });

  it("ignores games with no half-time data (pre-1995)", async () => {
    const fs = comebacks(4).map((f) => ({ ...f, halfTime: null }));
    const d = teamData(2024, { standings: [standing({ teamId: 1 })], fixtures: fs });
    expect(await comebackKingsRule.run(d, { scope: "team", id: 1 })).toBeNull();
  });
});

describe("R21 — managerial merry-go-round", () => {
  // ManagersFile entries carry W/D/L/GF/GA (TASK-M49); the rule reads only name.
  const mgr = (id: string, name: string, matches: number) => ({
    id,
    name,
    matches,
    win: 0,
    draw: 0,
    loss: 0,
    gf: 0,
    ga: 0,
  });
  const managers: ManagersFile = {
    "2022": {
      "1": [
        mgr("a", "Thomas Tuchel", 7),
        mgr("b", "Graham Potter", 20),
        mgr("c", "Frank Lampard", 11),
      ],
    },
  };

  it("fires when a club used >= 3 managers in a season", async () => {
    const d = teamData(2022, { standings: [standing({ teamId: 1, teamName: "Blues" })], managers });
    const res = await managerialMerryGoRoundRule.run(d, { scope: "team", id: 1 });
    expect(res?.text).toBe(
      "Blues were managed by 3 different men in 2022-23 — Thomas Tuchel, Graham Potter and Frank Lampard.",
    );
    expect(await res!.verify(d)).toBe(true);
  });

  it("returns null with fewer than 3 managers", async () => {
    const one: ManagersFile = { "2022": { "1": [mgr("a", "Solo", 38)] } };
    const d = teamData(2022, { standings: [standing({ teamId: 1 })], managers: one });
    expect(await managerialMerryGoRoundRule.run(d, { scope: "team", id: 1 })).toBeNull();
  });
});

describe("R22 — yo-yo club", () => {
  // Club 1 present in 2010, 2012, 2014 but absent 2011, 2013, 2015 → relegated 3x.
  const standingsBySeason: Record<number, Standing[]> = {
    2010: [standing({ teamId: 1, teamName: "Canaries" })],
    2011: [standing({ teamId: 2, teamName: "Other" })],
    2012: [standing({ teamId: 1, teamName: "Canaries" })],
    2013: [standing({ teamId: 2, teamName: "Other" })],
    2014: [standing({ teamId: 1, teamName: "Canaries" })],
    2015: [standing({ teamId: 2, teamName: "Other" })],
  };
  const seasons = [2015, 2014, 2013, 2012, 2011, 2010]; // newest-first, like getAvailableSeasons

  it("counts relegations across committed seasons and fires at >= 3", async () => {
    const d = teamData(2014, { standingsBySeason, seasons });
    const res = await yoYoClubRule.run(d, { scope: "team", id: 1 });
    expect(res?.text).toBe(
      "Canaries have been relegated from the Premier League 3 times — one of the league's classic yo-yo clubs.",
    );
    expect(await res!.verify(d)).toBe(true);
  });

  it("returns null below 3 relegations", async () => {
    const partial = { 2010: standingsBySeason[2010], 2011: standingsBySeason[2011] };
    const d = teamData(2010, { standingsBySeason: partial, seasons: [2011, 2010] });
    expect(await yoYoClubRule.run(d, { scope: "team", id: 1 })).toBeNull();
  });
});
