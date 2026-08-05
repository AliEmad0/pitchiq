import { describe, expect, it } from "vitest";
import type { MinuteContext } from "@/features/game/domain/match-types";
import {
  type Opponent,
  type OpponentRecord,
  opponentPower,
  opponentSetup,
  opponentTeam,
  styleEdge,
  tacticalStyleModifier,
} from "@/features/game/domain/opponent";
import type { GamePlayer } from "@/features/game/domain/player";
import { simulate } from "@/features/game/domain/simulate";
import { makeGameTeam } from "@/features/game/domain/team";

const rec = (name: string, gf: number, ga: number, rank: number): OpponentRecord => ({
  name,
  played: 38,
  goalsFor: gf,
  goalsAgainst: ga,
  points: 100 - rank * 2,
  rank,
});
const record = (r: OpponentRecord): Opponent => ({ kind: "record", record: r, style: "balanced" });

function homeTeam() {
  const roles = ["GK", "LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "CF", "CF"] as const;
  const slots = roles.map((role, i) => ({ row: 1, col: i + 1, role }));
  const players: GamePlayer[] = roles.map((role, i) => ({
    cardId: `${i}@2020`,
    playerId: i,
    season: 2020,
    name: `P${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: { attack: 60, creation: 55, defense: 55, physical: 55, discipline: 55, overall: 57 },
  }));
  return makeGameTeam(1, "Home", 2020, { name: "4-4-2", season: 2020, slots }, players);
}

describe("opponentPower", () => {
  it("derives a stronger champion-record power than a relegation record", () => {
    const champ = opponentPower(record(rec("Champs", 95, 25, 1)));
    const doomed = opponentPower(record(rec("Doomed", 30, 80, 20)));
    expect(champ.attack).toBeGreaterThan(doomed.attack);
    expect(champ.defense).toBeGreaterThan(doomed.defense);
    expect(champ.attack).toBeLessThanOrEqual(95);
    expect(doomed.defense).toBeGreaterThanOrEqual(15);
  });
  it("delegates to squad power for a squad opponent", () => {
    const squad: Opponent = { kind: "squad", team: homeTeam(), style: "balanced" };
    expect(opponentPower(squad).attack).toBeGreaterThan(0);
  });
  it("a record opponent realises as an XI-less GameTeam", () => {
    const t = opponentTeam(record(rec("Ghost", 50, 50, 10)), 2020);
    expect(t.players).toHaveLength(0);
    expect(t.name).toBe("Ghost");
  });
});

describe("styleEdge", () => {
  it("forms a counter-cycle", () => {
    expect(styleEdge("high-press", "tiki-taka")).toBe(1);
    expect(styleEdge("tiki-taka", "high-press")).toBe(-1);
    expect(styleEdge("counter", "high-press")).toBe(1);
  });
  it("is neutral for balanced or mirror match-ups", () => {
    expect(styleEdge("balanced", "tiki-taka")).toBe(0);
    expect(styleEdge("low-block", "low-block")).toBe(0);
  });
});

describe("tacticalStyleModifier", () => {
  it("rewards the countering side and penalises the countered one", () => {
    const mod = tacticalStyleModifier("high-press", "tiki-taka");
    expect(mod({ side: "home" } as MinuteContext).attack).toBeGreaterThan(0);
    expect(mod({ side: "away" } as MinuteContext).attack).toBeLessThan(0);
  });
});

describe("opponentSetup + simulate", () => {
  const base = { home: homeTeam(), homeStyle: "balanced" as const, season: 2020, targetGoalsPerMatch: 2.7 };

  it("simulates a record opponent deterministically", () => {
    const setup = opponentSetup({ ...base, opponent: record(rec("Rec", 60, 55, 8)), seed: 42 });
    expect(simulate(setup)).toEqual(simulate(setup));
  });

  it("a stronger record opponent concedes fewer home goals on average", () => {
    let vsWeak = 0;
    let vsStrong = 0;
    for (let seed = 0; seed < 60; seed++) {
      vsWeak += simulate(opponentSetup({ ...base, opponent: record(rec("Weak", 30, 80, 20)), seed })).score
        .home;
      vsStrong += simulate(
        opponentSetup({ ...base, opponent: record(rec("Strong", 95, 22, 1)), seed }),
      ).score.home;
    }
    expect(vsWeak).toBeGreaterThan(vsStrong);
  });
});
