import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import type { MatchResult, MatchSetup } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import type { PlayerRatings } from "@/features/game/domain/ratings";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import { defaultAnswer } from "@/features/game/domain/match-decisions";
import { drive, runMatch, simulate } from "@/features/game/domain/simulate";
import { makeGameTeam } from "@/features/game/domain/team";

function squad(prefix: string, offset: number, base: Partial<PlayerRatings> = {}): GamePlayer[] {
  const roles: PlayerRole[] = ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CAM", "RW", "LW", "CF"];
  return roles.map((role, i) => ({
    cardId: `${offset + i}@2020`,
    playerId: offset + i,
    season: 2020,
    name: `${prefix}${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: {
      attack: 50,
      creation: 50,
      defense: 50,
      physical: 50,
      discipline: 50,
      overall: 50,
      ...base,
    },
  }));
}

function bench(prefix: string, offset: number): GamePlayer[] {
  const roles: PlayerRole[] = ["GK", "CB", "CM", "CF", "RW"];
  return roles.map((role, i) => ({
    cardId: `${offset + i}@2020`,
    playerId: offset + i,
    season: 2020,
    name: `${prefix}B${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: {
      attack: 50,
      creation: 50,
      defense: 50,
      physical: 50,
      discipline: 50,
      overall: 50,
    },
  }));
}

const shape = { name: "", season: 2020, slots: [] };
const setup = (seed: number, over: Partial<MatchSetup> = {}): MatchSetup => ({
  home: makeGameTeam(1, "H", 2020, shape, squad("H", 100), bench("H", 200)),
  away: makeGameTeam(2, "A", 2020, shape, squad("A", 300), bench("A", 400)),
  seed,
  targetGoalsPerMatch: 2.7,
  ...over,
});

/** Drive a match, recording every decision the engine raised. */
function record(
  s: MatchSetup,
  policy: (d: MatchDecision) => DecisionAnswer = defaultAnswer,
): { seen: MatchDecision[]; result: MatchResult } {
  const seen: MatchDecision[] = [];
  const result = drive(runMatch(s), (d) => {
    seen.push(d);
    return policy(d);
  });
  return { seen, result };
}

describe("sub-offer", () => {
  it("is raised for both sides on every minute of the substitution window", () => {
    const { seen } = record(setup(11));
    const offers = seen.filter((d) => d.kind === "sub-offer");
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(o.minute).toBeGreaterThanOrEqual(46);
      expect(o.minute).toBeLessThanOrEqual(90);
    }
    expect(new Set(offers.map((o) => o.side))).toEqual(new Set(["home", "away"]));
  });

  it("carries the engine's own roll and its own suggestion", () => {
    const { seen } = record(setup(11));
    const suggested = seen.filter((d) => d.kind === "sub-offer" && d.engineSuggests);
    expect(suggested.length).toBeGreaterThan(0);
  });

  it("never offers the goalkeeper as an outfield change", () => {
    const { seen } = record(setup(23));
    for (const d of seen) {
      if (d.kind !== "sub-offer") continue;
      for (const p of d.legalOff) expect(p.role).not.toBe("GK");
    }
  });

  it("driving with defaultAnswer reproduces simulate exactly", () => {
    for (const seed of [1, 42, 777, 20260811]) {
      expect(record(setup(seed)).result).toEqual(simulate(setup(seed)));
    }
  });
});
