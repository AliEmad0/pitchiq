import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import {
  headlineFor,
  HEADLINE_POOL,
  scorersOf,
  type HeadlineArc,
} from "@/features/game/domain/match-headline";
import type { MatchEvent, MatchResult } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import type { PlayerRatings } from "@/features/game/domain/ratings";
import { simulate } from "@/features/game/domain/simulate";
import { makeGameTeam } from "@/features/game/domain/team";

/** TASK-1815 — the match's arc, read from the coach's side. */
const RATINGS = {
  attack: 50,
  creation: 50,
  defense: 50,
  physical: 50,
  discipline: 50,
  overall: 50,
};
const p = (id: number, name: string): GamePlayer =>
  ({
    cardId: `${id}@2020`,
    playerId: id,
    season: 2020,
    name,
    role: "CF",
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: RATINGS,
  }) as unknown as GamePlayer;
const shape = { name: "", season: 2020, slots: [] };
const HOME = makeGameTeam(1, "Rovers", 2020, shape, [p(1, "Smith"), p(2, "Jones")], [p(3, "Sub")]);
const AWAY = makeGameTeam(2, "United", 2020, shape, [p(11, "Brown"), p(12, "Green")]);

const g = (
  minute: number,
  side: "home" | "away",
  playerId: number,
  extra: Partial<MatchEvent> = {},
): MatchEvent =>
  ({
    minute,
    kind: "goal",
    side,
    playerId,
    source: "open",
    goalStyle: "tap-in",
    ...extra,
  }) as MatchEvent;
const res = (events: MatchEvent[], seed = 1): MatchResult => {
  const given = events.filter((e) => e.kind === "goal" && e.disallowedAt == null);
  return {
    seed,
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
const arc = (r: MatchResult, side: "home" | "away" = "home") =>
  headlineFor(r, HOME, AWAY, side).arc;
const misses = (side: "home" | "away") =>
  Array.from(
    { length: 10 },
    (_, i) => ({ minute: 20 + i, kind: "chance", side, outcome: "post" }) as MatchEvent,
  );

describe("headlineFor — arcs", () => {
  it("comeback beats late winner (priority)", () => {
    expect(
      arc(
        res([
          g(10, "away", 11),
          g(20, "away", 12),
          g(60, "home", 1),
          g(70, "home", 2),
          g(88, "home", 1),
        ]),
      ),
    ).toBe("comeback");
  });

  it("late winner / late loser", () => {
    expect(arc(res([g(10, "home", 1), g(30, "away", 11), g(89, "home", 2)]))).toBe("lateWinner");
    expect(arc(res([g(10, "home", 1), g(30, "away", 11), g(89, "away", 12)]))).toBe("lateLoser");
  });

  it("the late winner names the scorer and the minute", () => {
    const h = headlineFor(res([g(89, "home", 2)]), HOME, AWAY, "home");
    expect(h.values).toMatchObject({ player: "Jones", minute: 89 });
  });

  it("robbed / smash-and-grab read the xG gap", () => {
    expect(arc(res([...misses("home"), g(50, "away", 11, { goalStyle: "long-range" })]))).toBe(
      "robbed",
    );
    expect(arc(res([...misses("away"), g(50, "home", 1, { goalStyle: "long-range" })]))).toBe(
      "smashAndGrab",
    );
  });

  it("rout, either way", () => {
    const four = (side: "home" | "away", id: number) =>
      [10, 20, 30, 40].map((m) => g(m, side, id + (m % 20 ? 0 : 1)));
    expect(arc(res(four("home", 1)))).toBe("routWin");
    expect(arc(res(four("away", 11)))).toBe("routLoss");
  });

  it("hat-trick names the hero — even a SUBSTITUTE", () => {
    const h = headlineFor(
      res([g(10, "home", 3), g(40, "home", 3), g(80, "home", 3), g(50, "away", 11)]),
      HOME,
      AWAY,
      "home",
    );
    expect(h.arc).toBe("hatTrick");
    expect(h.values.player).toBe("Sub");
  });

  it("ten men", () => {
    const red = { minute: 20, kind: "card", side: "home", card: "red", playerId: 2 } as MatchEvent;
    expect(arc(res([red, g(60, "home", 1)]))).toBe("tenMen");
  });

  it("VAR drama", () => {
    expect(arc(res([g(30, "home", 1, { disallowedAt: 32 }), g(60, "away", 11)]))).toBe("varDrama");
  });

  it("bore draw, thriller, fallbacks", () => {
    expect(arc(res([]))).toBe("boreDraw");
    expect(
      arc(
        res([
          g(5, "home", 1),
          g(15, "away", 11),
          g(25, "home", 2),
          g(35, "away", 12),
          g(45, "home", 1),
        ]),
      ),
    ).toBe("thriller");
    expect(arc(res([g(30, "home", 1)]))).toBe("win");
    expect(arc(res([g(30, "home", 1), g(50, "away", 11)]))).toBe("draw");
    expect(arc(res([g(30, "away", 11)]))).toBe("loss");
  });
});

describe("headlineFor — side, determinism, values", () => {
  it("⛔ written from the COACH's side: an away win is a win", () => {
    expect(arc(res([g(30, "away", 11)]), "away")).toBe("win");
    const h = headlineFor(res([g(30, "away", 11)]), HOME, AWAY, "away");
    expect(h.values).toMatchObject({
      coach: "United",
      opponent: "Rovers",
      coachGoals: 1,
      oppGoals: 0,
    });
  });

  it("the same match prints the same headline; the key is in the pool", () => {
    const r = res([g(30, "home", 1)], 4242);
    expect(headlineFor(r, HOME, AWAY, "home")).toEqual(headlineFor(r, HOME, AWAY, "home"));
    expect(headlineFor(r, HOME, AWAY, "home").key).toMatch(
      new RegExp(`^gameReport\\.headline\\.win\\.[0-${HEADLINE_POOL - 1}]$`),
    );
  });
});

describe("scorersOf", () => {
  it("groups given goals per player, includes the bench, marks own goals, skips disallowed", () => {
    const r = res([
      g(10, "home", 1),
      g(20, "home", 1),
      g(30, "home", 3),
      g(40, "home", 2, { disallowedAt: 41 }),
      { minute: 50, kind: "goal", side: "away", source: "own-goal", ownGoalBy: 2 } as MatchEvent,
    ]);
    expect(scorersOf(r, HOME, AWAY)).toEqual([
      { side: "home", name: "Smith", goals: 2, ownGoal: false },
      { side: "home", name: "Sub", goals: 1, ownGoal: false },
      { side: "away", name: "Jones", goals: 1, ownGoal: true },
    ]);
  });
});

describe("headlineFor — reachability", () => {
  const ROLES: PlayerRole[] = ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CAM", "RW", "LW", "CF"];
  const xi = (base: Partial<PlayerRatings>, offset: number): GamePlayer[] =>
    ROLES.map((role, i) => ({
      ...p(offset + i, `P${offset + i}`),
      role,
      ratings: { ...RATINGS, ...base },
    }));

  it("⭐ every arc is reachable from real engine output (none is dead copy)", () => {
    const seen = new Map<HeadlineArc, number>();
    const levels = [35, 50, 65, 80];
    for (const a of levels)
      for (const b of levels)
        for (let seed = 1; seed <= 150; seed++) {
          const home = makeGameTeam(
            1,
            "H",
            2020,
            shape,
            xi({ attack: a, defense: a, overall: a }, 0),
          );
          const away = makeGameTeam(
            2,
            "A",
            2020,
            shape,
            xi({ attack: b, defense: b, overall: b }, 100),
          );
          const r = simulate({ home, away, seed, targetGoalsPerMatch: 2.7 });
          const k = headlineFor(r, home, away, "home").arc;
          seen.set(k, (seen.get(k) ?? 0) + 1);
        }
    expect([...seen.keys()].sort()).toEqual(
      [
        "boreDraw",
        "comeback",
        "draw",
        "hatTrick",
        "lateLoser",
        "lateWinner",
        "loss",
        "robbed",
        "routLoss",
        "routWin",
        "smashAndGrab",
        "tenMen",
        "thriller",
        "varDrama",
        "win",
      ].sort(),
    );
  });
});
