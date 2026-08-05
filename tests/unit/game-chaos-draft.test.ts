import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import {
  FORMATIONS,
  type PoolCard,
  chaosDraft,
  chaosMatchup,
} from "@/features/game/domain/chaos-draft";

const ROLES: PlayerRole[] = [
  "GK",
  "RB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "SS",
  "CF",
];

// A pool with several cards per role, so any formation can be filled eligibly.
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 6 }, (_, i) => {
    const id = r * 100 + i;
    return {
      cardId: `${id}@2020` as const,
      playerId: id,
      season: 2000 + (i % 20),
      name: `${role}-${i}`,
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
        overall: 50 + i,
      },
      club: `Club ${r}`,
    };
  }),
);

describe("chaosDraft", () => {
  it("is deterministic for a given seed", () => {
    const a = chaosDraft(pool, 42);
    const b = chaosDraft(pool, 42);
    expect(a.players.map((p) => p.playerId)).toEqual(b.players.map((p) => p.playerId));
    expect(a.formation.name).toBe(b.formation.name);
  });
  it("drafts a full, distinct XI in one of the known formations", () => {
    const team = chaosDraft(pool, 7);
    expect(team.players).toHaveLength(11);
    expect(new Set(team.players.map((p) => p.playerId)).size).toBe(11);
    expect(FORMATIONS.map((f) => f.name)).toContain(team.formation.name);
  });
  it("fills each slot with an eligible card when the pool allows", () => {
    const team = chaosDraft(pool, 99);
    team.formation.slots.forEach((s, i) => {
      const p = team.players[i];
      expect(p.role === s.role || p.altRoles.includes(s.role)).toBe(true);
    });
  });
  it("different seeds generally yield different squads", () => {
    const a = chaosDraft(pool, 1)
      .players.map((p) => p.playerId)
      .join(",");
    const b = chaosDraft(pool, 2)
      .players.map((p) => p.playerId)
      .join(",");
    expect(a).not.toBe(b);
  });
});

describe("chaosMatchup", () => {
  it("drafts a home XI and a distinct squad opponent with styles", () => {
    const m = chaosMatchup(pool, 2024);
    expect(m.home.players).toHaveLength(11);
    expect(m.opponent.kind).toBe("squad");
    if (m.opponent.kind === "squad") expect(m.opponent.team.players).toHaveLength(11);
    expect(typeof m.homeStyle).toBe("string");
    // home and opponent should not be the identical XI
    const homeIds = m.home.players.map((p) => p.playerId).join(",");
    const awayIds =
      m.opponent.kind === "squad" ? m.opponent.team.players.map((p) => p.playerId).join(",") : "";
    expect(homeIds).not.toBe(awayIds);
  });
});
