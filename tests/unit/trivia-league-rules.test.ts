import { describe, expect, it } from "vitest";

import { attendanceExtremesRule } from "../../src/features/trivia/rules/attendance-extremes";
import { survivalThresholdRule } from "../../src/features/trivia/rules/survival-threshold";
import { centurionsRule } from "../../src/features/trivia/rules/centurions";
import { giantKillersRule } from "../../src/features/trivia/rules/giant-killers";
import type { Fixture, FixtureExtrasFile, Standing } from "../../src/data/schemas";
import type { TriviaData } from "../../src/features/trivia/types";
import { TRIVIA_DEFAULTS } from "./_helpers/trivia";

export function standing(over: Partial<Standing> = {}): Standing {
  return {
    rank: 1,
    teamId: 1,
    teamName: "Reds",
    played: 38,
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
    homeScore: 1,
    awayScore: 0,
    venue: "V",
    teamStats: null,
    halfTime: null,
    referee: null,
    ...over,
  };
}

export function leagueData(
  season: number,
  opts: {
    standings?: Standing[];
    fixtures?: Fixture[];
    fixtureExtras?: FixtureExtrasFile;
    standingsBySeason?: Record<number, Standing[]>;
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
    seasons: async () => [season],
    goalAttribution: async () => null,
    managers: async () => null,
    fixtureExtras: async () => opts.fixtureExtras ?? null,
  };
}

describe("R23 — attendance extremes", () => {
  const fixtures = [
    fixture({ id: "a", homeTeamName: "Man United", awayTeamName: "Liverpool" }),
    fixture({ id: "b", homeTeamName: "Fulham", awayTeamName: "Brentford" }),
  ];

  it("reports the biggest crowd of the season", async () => {
    const fixtureExtras: FixtureExtrasFile = {
      a: { attendance: 73297, venue: "Old Trafford" },
      b: { attendance: 24000, venue: "Craven Cottage" },
    };
    const d = leagueData(2024, { fixtures, fixtureExtras });
    const res = await attendanceExtremesRule.run(d, { scope: "league" });
    expect(res?.text).toBe(
      "The biggest crowd in 2024-25 was 73,297 for Man United vs Liverpool at Old Trafford.",
    );
    expect(await res!.verify(d)).toBe(true);
  });

  it("returns null when no fixture has attendance data", async () => {
    const fixtureExtras: FixtureExtrasFile = { a: { attendance: null, venue: "Old Trafford" } };
    const d = leagueData(2024, { fixtures, fixtureExtras });
    expect(await attendanceExtremesRule.run(d, { scope: "league" })).toBeNull();
  });
});

describe("R24 — survival threshold", () => {
  function table(size: number, seventeenthPoints: number): Standing[] {
    return Array.from({ length: size }, (_, i) =>
      standing({
        rank: i + 1,
        teamId: i + 1,
        teamName: `T${i + 1}`,
        points: i + 1 === 17 ? seventeenthPoints : 50 - i,
      }),
    );
  }

  it("reports the 17th-place safety line for a 20-team season", async () => {
    const d = leagueData(2003, { standings: table(20, 34) });
    const res = await survivalThresholdRule.run(d, { scope: "league" });
    expect(res?.text).toBe("The last team to avoid relegation in 2003-04 stayed up on 34 points.");
    expect(await res!.verify(d)).toBe(true);
  });

  it("returns null for a non-20-team season", async () => {
    const d = leagueData(1993, { standings: table(22, 34) });
    expect(await survivalThresholdRule.run(d, { scope: "league" })).toBeNull();
  });
});

describe("R25 — centurions", () => {
  it("fires when a team reaches 100 points", async () => {
    const d = leagueData(2017, {
      standings: [
        standing({ rank: 1, teamId: 1, teamName: "Man City", points: 100 }),
        standing({ rank: 2, teamId: 2, points: 81 }),
      ],
    });
    const res = await centurionsRule.run(d, { scope: "league" });
    expect(res?.text).toBe(
      "Man City amassed 100 points in 2017-18 — a 100-point Premier League season.",
    );
    expect(await res!.verify(d)).toBe(true);
  });

  it("returns null when no team reaches 100", async () => {
    const d = leagueData(2019, { standings: [standing({ rank: 1, teamId: 1, points: 99 })] });
    expect(await centurionsRule.run(d, { scope: "league" })).toBeNull();
  });
});

describe("R26 — giant killers", () => {
  // Season 2015: top4 = teams 1-4. Promoted team 9 (absent in 2014) beat all of 1-4.
  const standingsBySeason: Record<number, Standing[]> = {
    2014: [
      standing({ rank: 1, teamId: 1 }),
      standing({ rank: 2, teamId: 2 }),
      standing({ rank: 3, teamId: 3 }),
      standing({ rank: 4, teamId: 4 }),
    ],
    2015: [
      standing({ rank: 1, teamId: 1, teamName: "Top1" }),
      standing({ rank: 2, teamId: 2, teamName: "Top2" }),
      standing({ rank: 3, teamId: 3, teamName: "Top3" }),
      standing({ rank: 4, teamId: 4, teamName: "Top4" }),
      standing({ rank: 15, teamId: 9, teamName: "Leicester" }),
    ],
  };
  // team 9 beats each of 1-4 (home wins).
  const fixtures = [1, 2, 3, 4].map((t) =>
    fixture({
      id: `w${t}`,
      homeTeamId: 9,
      awayTeamId: t,
      homeTeamName: "Leicester",
      homeScore: 2,
      awayScore: 0,
    }),
  );

  it("fires when a newly-promoted side beats all four top-four clubs", async () => {
    const d = leagueData(2015, { standingsBySeason, fixtures });
    const res = await giantKillersRule.run(d, { scope: "league" });
    expect(res?.text).toBe(
      "Newly-promoted Leicester beat all four of 2015-16's top-four sides in 2015-16.",
    );
    expect(await res!.verify(d)).toBe(true);
  });

  it("returns null when the promoted side did not beat every top-four club", async () => {
    const partial = fixtures.slice(0, 3); // only beat 3 of 4
    const d = leagueData(2015, { standingsBySeason, fixtures: partial });
    expect(await giantKillersRule.run(d, { scope: "league" })).toBeNull();
  });
});
