import { describe, expect, it } from "vitest";
import type { MatchSetup } from "@/features/game/domain/match-types";
import { simulate } from "@/features/game/domain/simulate";
import type { GameTeam } from "@/features/game/domain/team";

/**
 * TASK-1822 Phase 5 — colour.
 *
 * How a goal was scored, own goals, the weather and the crowd. None of this changes
 * who wins; all of it changes whether the match is worth watching.
 */

const mk = (id: number, role: string) => ({
  playerId: id,
  cardId: `${id}@2020`,
  season: 2020,
  name: `P${id}`,
  role,
  altRoles: [],
  ratings: { attack: 70, creation: 70, defense: 70, physical: 60, overall: 70, discipline: 50 },
});

const ROLES = ["GK", "CB", "CB", "LB", "RB", "CDM", "CM", "CM", "LW", "CF", "RW"];

const team = (name: string, base: number): GameTeam =>
  ({
    teamId: base,
    name,
    season: 2020,
    formation: null,
    players: ROLES.map((r, i) => mk(base + i + 1, r)),
    bench: [mk(base + 20, "GK"), mk(base + 21, "CB"), mk(base + 22, "CM"), mk(base + 23, "CF")],
  }) as unknown as GameTeam;

const setup = (over: Partial<MatchSetup> = {}): MatchSetup => ({
  home: team("H", 100),
  away: team("A", 200),
  seed: 7,
  targetGoalsPerMatch: 2.7,
  ...over,
});

const matches = Array.from({ length: 2500 }, (_, i) => simulate(setup({ seed: i + 1 })));
const events = (kind: string) => matches.flatMap((m) => m.events.filter((e) => e.kind === kind));
const goals = matches.flatMap((m) => m.events.filter((e) => e.kind === "goal"));

describe("goal descriptions", () => {
  it("describes every open-play goal that has not already been narrated", () => {
    // A goal gifted by a keeper blunder is excluded: the keeper event in the same
    // minute already told that story, and describing it twice reads as two goals —
    // the same trap Phase 2 hit with converted penalties.
    const open = goals.filter((g) => g.source === "open" && !g.narrated);
    expect(open.length).toBeGreaterThan(1000);
    for (const g of open) expect(g.goalStyle).toBeDefined();
  });

  it("covers the whole repertoire", () => {
    const seen = new Set(goals.map((g) => g.goalStyle).filter(Boolean));
    for (const style of [
      "header",
      "counter",
      "chip",
      "trivela",
      "tap-in",
      "long-range",
      "volley",
    ]) {
      expect(seen).toContain(style);
    }
  });

  it("does not describe a penalty as a header from a corner", () => {
    // The set-piece events already carry their own description.
    for (const g of goals.filter((g) => g.source === "penalty" || g.source === "freekick")) {
      expect(g.goalStyle).toBeUndefined();
    }
  });

  it("gives defenders headers and wingers curled finishes", () => {
    const styleFor = (role: string) => {
      const ids = new Set(
        [100, 200].flatMap((b) => ROLES.map((r, i) => (r === role ? b + i + 1 : -1))),
      );
      const theirs = goals.filter((g) => g.playerId != null && ids.has(g.playerId));
      const headers = theirs.filter((g) => g.goalStyle === "header").length;
      return { total: theirs.length, headerShare: headers / Math.max(1, theirs.length) };
    };
    const cb = styleFor("CB");
    const winger = styleFor("LW");
    expect(cb.total).toBeGreaterThan(20);
    expect(winger.total).toBeGreaterThan(20);
    // A centre-back who scores has almost always headed it; a winger rarely has.
    expect(cb.headerShare).toBeGreaterThan(winger.headerShare);
  });
});

describe("own goals", () => {
  const owns = goals.filter((g) => g.source === "own-goal");

  it("happen, at roughly the real rate", () => {
    const perMatch = owns.length / matches.length;
    expect(perMatch).toBeGreaterThan(0.02);
    expect(perMatch).toBeLessThan(0.3);
  });

  it("credit the goal to the OTHER side and name the unlucky defender", () => {
    for (const g of owns) {
      expect(g.ownGoalBy).toBeDefined();
      // The scorer is not credited as a goalscorer for the side that benefits.
      expect(g.playerId).toBeUndefined();
    }
  });

  it("still count on the scoreboard", () => {
    for (const m of matches) {
      const home = m.events.filter((e) => e.kind === "goal" && e.side === "home").length;
      const away = m.events.filter((e) => e.kind === "goal" && e.side === "away").length;
      expect({ home, away }).toEqual(m.score);
    }
  });
});

describe("weather", () => {
  it("is set for every match and announced", () => {
    for (const m of matches.slice(0, 100)) {
      const w = m.events.find((e) => e.kind === "weather");
      expect(w).toBeDefined();
      expect(["clear", "rain", "heavy-rain", "wind", "snow"]).toContain(w?.weather);
    }
  });

  it("varies across matches", () => {
    const seen = new Set(events("weather").map((w) => w.weather));
    expect(seen.size).toBeGreaterThan(2);
  });

  it("makes a wet pitch scrappier without changing the goal rate", () => {
    // Deliberate: weather changes how a match FEELS, not how many goals it yields, so
    // the season-authentic calibration survives. It shows up in fouls and cards.
    const bucket = (kinds: string[]) => {
      const wet = matches.filter((m) =>
        m.events.some(
          (e) => e.kind === "weather" && (e.weather === "rain" || e.weather === "heavy-rain"),
        ),
      );
      const dry = matches.filter((m) =>
        m.events.some((e) => e.kind === "weather" && e.weather === "clear"),
      );
      const rate = (ms: typeof matches) =>
        ms.flatMap((m) => m.events.filter((e) => kinds.includes(e.kind))).length /
        Math.max(1, ms.length);
      return { wet: rate(wet), dry: rate(dry) };
    };
    const cards = bucket(["card"]);
    expect(cards.wet).toBeGreaterThan(cards.dry);

    const goalsIn = bucket(["goal"]);
    // Within noise of each other — no systematic goal inflation from the weather.
    expect(Math.abs(goalsIn.wet - goalsIn.dry)).toBeLessThan(0.35);
  });
});

describe("crowd hostility", () => {
  it("is noted when the atmosphere turns", () => {
    expect(events("crowd").length).toBeGreaterThan(0);
  });

  it("only ever turns on the away side — it is the home crowd", () => {
    for (const c of events("crowd")) expect(c.side).toBe("away");
  });
});

describe("phase 5 keeps the engine honest", () => {
  it("replays byte-identically", () => {
    expect(simulate(setup({ seed: 4242 }))).toEqual(simulate(setup({ seed: 4242 })));
  });
});
