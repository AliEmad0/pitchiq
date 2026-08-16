import { describe, expect, it } from "vitest";

import type { MatchEventRaw, Standing } from "../../src/data/schemas";
import { favouriteSupplierRule } from "../../src/features/trivia/rules/favourite-supplier";
import { lateDecidersRule } from "../../src/features/trivia/rules/late-deciders";
import { spotKicksAndOwnGoalsRule } from "../../src/features/trivia/rules/spot-kicks-and-own-goals";
import {
  internationalDoubleLifeRule,
  trophyCabinetRule,
} from "../../src/features/trivia/rules/trophy-cabinet";
import {
  nationalTitleCountry,
  travelledManagerRule,
} from "../../src/features/trivia/rules/travelled-manager";
import type { TriviaCtx } from "../../src/features/trivia/types";

import { triviaStub } from "./_helpers/trivia";

const league: TriviaCtx = { scope: "league" };

const goal = (over: Partial<MatchEventRaw> = {}): MatchEventRaw => ({
  type: "Goal",
  detail: "Goal",
  minute: 30,
  extra: null,
  teamId: 1,
  player: "Scorer",
  assist: null,
  ...over,
});

const standings: Standing[] = [
  {
    rank: 1,
    teamId: 1,
    teamName: "Arsenal",
    played: 38,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalsDiff: 0,
    points: 0,
  },
];

describe("R27 — late deciders", () => {
  it("counts goals from the 90th minute on, stoppage time included", async () => {
    // A 90+4 goal is {minute: 90, extra: 4}. Testing `minute >= 90` catches it; adding
    // `extra` to the minute would double-count the same goal.
    const data = triviaStub({
      events: async () => ({
        f1: [goal({ minute: 90, extra: 4 }), goal({ minute: 94 }), goal({ minute: 89 })],
        f2: [goal({ minute: 91 })],
      }),
    });
    const r = await lateDecidersRule.run(data, league);
    expect(r).not.toBeNull();
    expect(r!.text).toContain("3 of the 4 goals");
    expect(await r!.verify(data)).toBe(true);
  });

  it("excludes own goals from the count", async () => {
    const data = triviaStub({
      events: async () => ({
        f1: [
          goal({ minute: 92, detail: "Own" }),
          goal({ minute: 93 }),
          goal({ minute: 94 }),
          goal({ minute: 95 }),
        ],
      }),
    });
    const r = await lateDecidersRule.run(data, league);
    expect(r!.text).toContain("3 of the 3 goals");
  });

  it("stays silent below the noise floor", async () => {
    const data = triviaStub({ events: async () => ({ f1: [goal({ minute: 91 })] }) });
    expect(await lateDecidersRule.run(data, league)).toBeNull();
  });

  it("returns nothing when the season has no events file", async () => {
    expect(await lateDecidersRule.run(triviaStub(), league)).toBeNull();
  });
});

describe("R28 — favourite supplier", () => {
  it("finds the most frequent assister→scorer pairing", async () => {
    const data = triviaStub({
      standings: async () => standings,
      events: async () => ({
        f1: [
          goal({ player: "Saka", assist: "Ødegaard" }),
          goal({ player: "Saka", assist: "Ødegaard" }),
          goal({ player: "Saka", assist: "Ødegaard" }),
          goal({ player: "Jesus", assist: "Saka" }),
        ],
      }),
    });
    const r = await favouriteSupplierRule.run(data, league);
    expect(r).not.toBeNull();
    expect(r!.text).toContain("Ødegaard set up Saka 3 times");
    expect(await r!.verify(data)).toBe(true);
  });

  it("ignores goals with no named assister", async () => {
    // 72% of goals name one; the other 28% must not become a phantom pairing.
    const data = triviaStub({
      events: async () => ({ f1: [goal(), goal(), goal(), goal()] }),
    });
    expect(await favouriteSupplierRule.run(data, league)).toBeNull();
  });

  it("ignores own goals, whose assist field means something else", async () => {
    const data = triviaStub({
      events: async () => ({
        f1: [
          goal({ detail: "Own", player: "A", assist: "B" }),
          goal({ detail: "Own", player: "A", assist: "B" }),
          goal({ detail: "Own", player: "A", assist: "B" }),
        ],
      }),
    });
    expect(await favouriteSupplierRule.run(data, league)).toBeNull();
  });
});

describe("R29 — spot kicks and own goals", () => {
  it("separates penalties, own goals and open play by `detail`", async () => {
    const data = triviaStub({
      events: async () => ({
        f1: [
          goal({ detail: "Penalty" }),
          goal({ detail: "Penalty" }),
          goal({ detail: "Penalty" }),
          goal({ detail: "Own" }),
          goal(),
        ],
      }),
    });
    const r = await spotKicksAndOwnGoalsRule.run(data, league);
    expect(r).not.toBeNull();
    // 3 penalties of 4 scored goals — the own goal is NOT in the denominator.
    expect(r!.text).toContain("3 of the 4 goals");
    expect(r!.text).toContain("1 more were own goals");
    expect(await r!.verify(data)).toBe(true);
  });
});

describe("R30/R31 — career facts read the ROW, not the 5-8 MB detail maps", () => {
  const withEnrichment = (enrichment: Record<string, unknown> | null) =>
    triviaStub({
      players: async () => [{ id: 7, name: "Player Seven", enrichment }] as never,
    });

  it("quotes silverware, never the honour count", async () => {
    // 25,886 of 29,761 committed honour groups are `participation`.
    const data = withEnrichment({
      trophies: 9,
      honours: 30,
      awards: 2,
      caps: 60,
      internationalGoals: 4,
      careerFee: "€52.60m",
    });
    const r = await trophyCabinetRule.run(data, { scope: "player", id: 7 });
    expect(r!.text).toContain("won 9 major honours");
    expect(r!.text).toContain("€52.60m");
    expect(await r!.verify(data)).toBe(true);
  });

  it("renders nothing for an unenriched player", async () => {
    const data = withEnrichment(null);
    expect(await trophyCabinetRule.run(data, { scope: "player", id: 7 })).toBeNull();
    expect(await internationalDoubleLifeRule.run(data, { scope: "player", id: 7 })).toBeNull();
  });

  it("treats null caps as UNKNOWN, not zero", async () => {
    const data = withEnrichment({
      trophies: 0,
      honours: 0,
      awards: 0,
      caps: null,
      internationalGoals: null,
      careerFee: null,
    });
    expect(await internationalDoubleLifeRule.run(data, { scope: "player", id: 7 })).toBeNull();
  });

  it("says 'without scoring' only when the goal count is a real zero", async () => {
    const data = withEnrichment({
      trophies: 0,
      honours: 0,
      awards: 0,
      caps: 80,
      internationalGoals: 0,
      careerFee: null,
    });
    const r = await internationalDoubleLifeRule.run(data, { scope: "player", id: 7 });
    expect(r!.text).toContain("without scoring");
  });
});

describe("R32 — the travelled manager", () => {
  it("reads the country from the TITLE, so England does not count twice", () => {
    // England appears under both GB1 (Premier League) and EFD1 (the old First Division);
    // both carry the same title text, so the title dedupes and the id would not.
    expect(nationalTitleCountry("English Champion")).toBe("english");
    expect(nationalTitleCountry("German Champion")).toBe("german");
    expect(nationalTitleCountry("Swiss champion")).toBe("swiss");
  });

  it("rejects everything that is not a national top flight", () => {
    // Every string below is real, taken from the committed map.
    for (const t of [
      "Dutch second tier champion",
      "English 2nd tier champion",
      "Austrian Second League Champion",
      "German Regionalliga Bavaria Champion",
      "Champion Westfalenliga 1",
      "Dutch amateur champion",
      "European champion",
      "European Under-19 champion",
      "UEFA Champions League winner",
      "Under-17 World Cup champion",
      "MLS Cup Champion",
    ]) {
      expect(nationalTitleCountry(t), t).toBeNull();
    }
  });

  it("fires for a manager with titles in three countries", async () => {
    const data = triviaStub({
      managers: async () => ({ 2024: { 1: [{ id: 50, name: "Carlo Ancelotti" }] } }) as never,
      managerHonours: async () =>
        ({
          50: {
            titles: [
              { kind: "trophy", title: "English Champion", count: 1, entries: [] },
              { kind: "trophy", title: "Italian champion", count: 1, entries: [] },
              { kind: "trophy", title: "French champion", count: 1, entries: [] },
              // Must NOT add a fourth "country".
              { kind: "trophy", title: "European champion", count: 1, entries: [] },
            ],
          },
        }) as never,
    });
    const r = await travelledManagerRule.run(data, league);
    expect(r).not.toBeNull();
    expect(r!.text).toContain("3 different countries");
    expect(r!.text).not.toContain("European");
    expect(await r!.verify(data)).toBe(true);
  });

  it("stays silent for a manager with titles in only two countries", async () => {
    const data = triviaStub({
      managers: async () => ({ 2024: { 1: [{ id: 9, name: "Someone" }] } }) as never,
      managerHonours: async () =>
        ({
          9: {
            titles: [
              { kind: "trophy", title: "English Champion", count: 1, entries: [] },
              { kind: "trophy", title: "Italian champion", count: 1, entries: [] },
            ],
          },
        }) as never,
    });
    expect(await travelledManagerRule.run(data, league)).toBeNull();
  });
});
