import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENTS,
  earned,
  matchFacts,
  type AchievementId,
  type MatchFacts,
} from "@/features/game/domain/achievements";
import type { MatchEvent, MatchResult } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import { simulate } from "@/features/game/domain/simulate";
import { makeGameTeam } from "@/features/game/domain/team";
import { SCENARIOS } from "@/features/game/domain/what-if";

/** TASK-1813 — sixteen achievements, each a pure predicate over what a match or run provides. */
const RATINGS = {
  attack: 50,
  creation: 50,
  defense: 50,
  physical: 50,
  discipline: 50,
  overall: 50,
};
const p = (id: number, sparse = false): GamePlayer =>
  ({
    cardId: `${id}@2000`,
    playerId: id,
    season: 2000,
    name: `P${id}`,
    role: "CF",
    altRoles: [],
    foot: null,
    height: null,
    provenance: sparse
      ? { tier: "sparse", season: 2000, basis: { hasAdvanced: false, hasXg: false } }
      : null,
    ratings: RATINGS,
  }) as unknown as GamePlayer;
const COACH = [p(1), p(2), p(3, true)];

const g = (
  minute: number,
  side: "home" | "away",
  playerId: number,
  extra: Partial<MatchEvent> = {},
) =>
  ({
    minute,
    kind: "goal",
    side,
    playerId,
    source: "open",
    goalStyle: "tap-in",
    ...extra,
  }) as MatchEvent;
const red = (minute: number, side: "home" | "away") =>
  ({ minute, kind: "card", card: "red", side, playerId: 2 }) as MatchEvent;
const res = (events: MatchEvent[]): MatchResult => {
  const given = events.filter((e) => e.kind === "goal" && e.disallowedAt == null);
  return {
    seed: 1,
    events: [
      { minute: 0, kind: "kickoff" },
      ...events,
      { minute: 93, kind: "fulltime" },
    ] as MatchEvent[],
    score: {
      home: given.filter((e) => e.side === "home").length,
      away: given.filter((e) => e.side === "away").length,
    },
  };
};
const facts = (events: MatchEvent[], side: "home" | "away" = "home") =>
  matchFacts(res(events), side, COACH);
const got = (m: MatchFacts) => earned({ match: m });

describe("the list", () => {
  it("is the frozen sixteen, in order, each with an icon", () => {
    expect(ACHIEVEMENT_IDS).toEqual([
      "first-win",
      "clean-sheet",
      "thrashing",
      "hat-trick",
      "sparse-hat-trick",
      "comeback",
      "late-winner",
      "ten-men",
      "champions",
      "invincibles",
      "great-escape",
      "daily-7",
      "rewrite",
      "rewrite-all",
      "collector-100",
      "set-complete",
    ]);
    expect(ACHIEVEMENTS.map((a) => a.id)).toEqual([...ACHIEVEMENT_IDS]);
    for (const a of ACHIEVEMENTS) expect(a.icon.length).toBeGreaterThan(0);
  });
});

describe("match predicates", () => {
  it("a 5–0 is a win, a clean sheet and a thrashing; 4–0 is not a thrashing", () => {
    const five = [1, 2, 3, 4, 5].map((m) => g(m * 10, "home", 1 + (m % 3)));
    expect(got(facts(five)).sort()).toEqual(["clean-sheet", "first-win", "thrashing"].sort());
    expect(got(facts(five.slice(1)))).not.toContain("thrashing");
  });

  it("reads from the COACH's side — the same 0–5 away is his thrashing", () => {
    const five = [1, 2, 3, 4, 5].map((m) => g(m * 10, "away", 1 + (m % 3)));
    expect(got(facts(five, "away"))).toContain("thrashing");
    expect(got(facts(five, "home"))).toEqual([]);
  });

  it("a hat-trick by one of his men; ⛔ a VAR-disallowed goal does not make one", () => {
    expect(got(facts([g(10, "home", 1), g(20, "home", 1), g(30, "home", 1)]))).toContain(
      "hat-trick",
    );
    const chalked = [g(10, "home", 1), g(20, "home", 1), g(30, "home", 1, { disallowedAt: 32 })];
    expect(got(facts(chalked))).not.toContain("hat-trick");
  });

  it("⛔ an own goal credits nobody's hat-trick", () => {
    const ev = [
      g(10, "home", 1),
      g(20, "home", 1),
      g(30, "home", 1, { source: "own-goal", ownGoalBy: 99 } as Partial<MatchEvent>),
    ];
    expect(got(facts(ev))).not.toContain("hat-trick");
  });

  it("a sparse-era (1992–2002) card's hat-trick is Old School too", () => {
    const ev = [g(10, "home", 3), g(20, "home", 3), g(30, "home", 3)];
    expect(got(facts(ev))).toEqual(expect.arrayContaining(["hat-trick", "sparse-hat-trick"]));
    const modern = [g(10, "home", 1), g(20, "home", 1), g(30, "home", 1)];
    expect(got(facts(modern))).not.toContain("sparse-hat-trick");
  });

  it("a comeback is winning after trailing by two; trailing by one is not", () => {
    const two = [
      g(5, "away", 50),
      g(9, "away", 51),
      g(40, "home", 1),
      g(50, "home", 2),
      g(60, "home", 1),
    ];
    expect(got(facts(two))).toContain("comeback");
    const one = [g(5, "away", 50), g(40, "home", 1), g(60, "home", 2)];
    expect(got(facts(one))).not.toContain("comeback");
    const drawn = [g(5, "away", 50), g(9, "away", 51), g(40, "home", 1), g(50, "home", 2)];
    expect(got(facts(drawn))).not.toContain("comeback");
  });

  it("a late winner breaks a TIE at 90' or later; ⛔ 3–1 from 2–1 at 90' does not", () => {
    expect(got(facts([g(30, "home", 1), g(60, "away", 50), g(90, "home", 2)]))).toContain(
      "late-winner",
    );
    expect(got(facts([g(30, "home", 1), g(60, "away", 50), g(89, "home", 2)]))).not.toContain(
      "late-winner",
    );
    expect(
      got(facts([g(30, "home", 1), g(60, "home", 2), g(70, "away", 50), g(90, "home", 1)])),
    ).not.toContain("late-winner");
  });

  it("ten men is a win after one of HIS men is sent off", () => {
    expect(got(facts([red(20, "home"), g(70, "home", 1)]))).toContain("ten-men");
    expect(got(facts([red(20, "away"), g(70, "home", 1)]))).not.toContain("ten-men");
    expect(got(facts([red(20, "home"), g(70, "away", 50)]))).not.toContain("ten-men");
  });
});

describe("career predicates", () => {
  const at = (f: Parameters<typeof earned>[0], id: AchievementId) => earned(f).includes(id);
  it("seasons", () => {
    const league = { kind: "league" as const, won: true, unbeaten: true, complete: true };
    expect(earned({ season: league }).sort()).toEqual(["champions", "invincibles"]);
    expect(at({ season: { ...league, complete: false } }, "champions")).toBe(false);
    expect(at({ season: { ...league, won: false } }, "invincibles")).toBe(true);
    const survival = {
      kind: "survival" as const,
      won: false,
      unbeaten: true,
      complete: true,
      survived: true,
    };
    expect(earned({ season: survival })).toEqual(["great-escape"]);
    expect(at({ season: { ...survival, won: true } }, "champions")).toBe(false);
  });

  it("thresholds, and one under each", () => {
    expect(at({ dailyBestStreak: 7 }, "daily-7")).toBe(true);
    expect(at({ dailyBestStreak: 6 }, "daily-7")).toBe(false);
    expect(at({ whatIfRewritten: 1 }, "rewrite")).toBe(true);
    expect(at({ whatIfRewritten: 0 }, "rewrite")).toBe(false);
    expect(at({ whatIfRewritten: SCENARIOS.length }, "rewrite-all")).toBe(true);
    expect(at({ whatIfRewritten: SCENARIOS.length - 1 }, "rewrite-all")).toBe(false);
    expect(at({ albumTotal: 100 }, "collector-100")).toBe(true);
    expect(at({ albumTotal: 99 }, "collector-100")).toBe(false);
    expect(at({ setsComplete: 1 }, "set-complete")).toBe(true);
    expect(at({ setsComplete: 0 }, "set-complete")).toBe(false);
  });
});

describe("reachability", () => {
  it("⭐ every match badge comes out of the real engine", () => {
    const ROLES: PlayerRole[] = [
      "GK",
      "RB",
      "CB",
      "CB",
      "LB",
      "CDM",
      "CM",
      "CAM",
      "RW",
      "LW",
      "CF",
    ];
    const shape = { name: "", season: 2000, slots: [] };
    const xi = (level: number, offset: number, sparse: boolean): GamePlayer[] =>
      ROLES.map((role, i) => ({
        ...p(offset + i, sparse),
        role,
        ratings: { ...RATINGS, attack: level, defense: level, overall: level },
      }));
    const seen = new Set<AchievementId>();
    const levels = [35, 50, 65, 80];
    for (const a of levels)
      for (const b of levels)
        for (let seed = 1; seed <= 150; seed++) {
          const coach = xi(a, 0, true);
          const home = makeGameTeam(1, "H", 2000, shape, coach);
          const away = makeGameTeam(2, "A", 2000, shape, xi(b, 100, false));
          const r = simulate({ home, away, seed, targetGoalsPerMatch: 2.7 });
          for (const id of earned({ match: matchFacts(r, "home", coach) })) seen.add(id);
        }
    expect([...seen].sort()).toEqual(
      [
        "first-win",
        "clean-sheet",
        "thrashing",
        "hat-trick",
        "sparse-hat-trick",
        "comeback",
        "late-winner",
        "ten-men",
      ].sort(),
    );
  }, 120_000);
});
