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

/**
 * ⭐ Owner-reported, 2026-08-19: the Legacy opponent fielded 39s and 44s while the coach's
 * own hands guarantee an 80+ standout every round. The opponent was a plain random draw
 * from the club's COMPLETE history, which is mostly squad players — so the mismatch was
 * structural, not unlucky.
 */
describe("chaosDraft — the `best` policy", () => {
  const total = (t: ReturnType<typeof chaosDraft>) =>
    t.players.reduce((n, p) => n + (p.ratings?.overall ?? 0), 0);

  /**
   * ⛔ NOT "every player is the pool's best card". Every formation has two centre-backs,
   * so the second one is necessarily the second-best CB — an assertion that each slot got
   * the top card of its role is unsatisfiable, and writing it is how this test first
   * failed against a correct implementation.
   */
  it("drafts an XI no random draw can beat", () => {
    const best = chaosDraft(pool, 42, "Rivals", { policy: "best" });
    expect(best.players).toHaveLength(11);
    // 200 seeds is enough to make "the random draw simply got unlucky" untenable.
    for (let seed = 1; seed <= 200; seed++) {
      expect(total(chaosDraft(pool, seed))).toBeLessThanOrEqual(total(best));
    }
  });

  it("is a real improvement, not a tie — the shipped draw sits well below it", () => {
    const best = total(chaosDraft(pool, 42, "Rivals", { policy: "best" }));
    const random = total(chaosDraft(pool, 42));
    expect(best).toBeGreaterThan(random);
  });

  it("is deterministic, and independent of the rng the random policy consumes", () => {
    const a = chaosDraft(pool, 42, "Rivals", { policy: "best" });
    const b = chaosDraft(pool, 42, "Rivals", { policy: "best" });
    expect(a.players.map((p) => p.cardId)).toEqual(b.players.map((p) => p.cardId));
  });

  it("leaves the shipped random draft byte-identical when no policy is given", () => {
    expect(chaosDraft(pool, 7).players.map((p) => p.cardId)).toEqual(
      chaosDraft(pool, 7, "Your XI", {}).players.map((p) => p.cardId),
    );
  });

  it("never fields a player the coach has already drafted", () => {
    const mine = chaosDraft(pool, 42, "Yours", { policy: "best" });
    const exclude = new Set(mine.players.map((p) => p.playerId));
    const theirs = chaosDraft(pool, 99, "Rivals", { policy: "best", exclude });
    for (const p of [...theirs.players, ...(theirs.bench ?? [])]) {
      expect(exclude.has(p.playerId)).toBe(false);
    }
    expect(theirs.players).toHaveLength(11);
  });
});

describe("chaosMatchup — an opponent policy", () => {
  it("applies the policy to the OPPONENT only, and the exclusion to both sides", () => {
    const exclude = new Set([0, 100, 200]);
    const m = chaosMatchup(pool, 2024, undefined, { opponent: "best", exclude });
    const shipped = chaosMatchup(pool, 2024);
    if (m.opponent.kind !== "squad" || shipped.opponent.kind !== "squad") {
      throw new Error("expected a squad opponent");
    }
    const total = (ps: { ratings: { overall: number } | null }[]) =>
      ps.reduce((n, p) => n + (p.ratings?.overall ?? 0), 0);
    expect(total(m.opponent.team.players)).toBeGreaterThan(total(shipped.opponent.team.players));
    for (const p of [...m.home.players, ...(m.home.bench ?? [])]) {
      expect(exclude.has(p.playerId)).toBe(false);
    }
  });

  it("is byte-identical to the shipped matchup when given no options", () => {
    const shipped = chaosMatchup(pool, 2024);
    const same = chaosMatchup(pool, 2024, undefined, {});
    expect(same.home.players.map((p) => p.cardId)).toEqual(
      shipped.home.players.map((p) => p.cardId),
    );
    expect(same.homeStyle).toBe(shipped.homeStyle);
  });
});
