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

/**
 * A pool where EVERY card clears the standout bar, so `strong` draws inside the band rather
 * than falling back.
 *
 * ⚠️ Six per role at 80-90, mirroring `pool` above. Two fixtures rather than one because the
 * two halves of `strong` — draw from the band, fall back to the best there is — are
 * different code paths and a single fixture can only exercise one of them.
 */
const strongPool: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 6 }, (_, i) => {
    const id = 5000 + r * 100 + i;
    return {
      cardId: `${id}@2020` as const,
      playerId: id,
      season: 2000 + (i % 20),
      name: `${role}-strong-${i}`,
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
        overall: 80 + i * 2,
      },
      club: `Club ${r}`,
    };
  }),
);

/**
 * A club that is strong in some positions and thin in others — the real shape of most.
 *
 * ⚠️ Neither `pool` nor `strongPool` can exercise the fallback and the band in ONE draft,
 * and it is the interleaving of the two that the rng-ordering rule is about.
 */
const mixedPool: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 6 }, (_, i) => {
    const id = 9000 + r * 100 + i;
    return {
      cardId: `${id}@2020` as const,
      playerId: id,
      season: 2000 + (i % 20),
      name: `${role}-mixed-${i}`,
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
        overall: r % 2 === 0 ? 82 + i : 60 + i,
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

/**
 * ⭐ Owner's answer to what `best` costs (2026-08-19): "selecting from Arsenal's card pool
 * randomly rather than strictly taking their top-rated cards … so Arsenal feels fresh with
 * different line-ups, formations and ratings (staying around the 82–90 range) every time".
 *
 * A club that always fields its single strongest XI is the same match forever. `strong`
 * draws inside the standout band instead — the quality of `best`, the variety of `random`.
 */
describe("chaosDraft — the `strong` policy", () => {
  const ovr = (t: ReturnType<typeof chaosDraft>) => t.players.map((p) => p.ratings?.overall ?? 0);
  const mean = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;

  /**
   * ⛔ NOT "every pick is the pool's top card". Two centre-back slots means the second one
   * gets the second-best centre-back — an assertion that each slot got the maximum is
   * unsatisfiable, and writing it is how this test first failed against correct code (the
   * same trap the `best` suite above records).
   *
   * ⚠️ 12 of the 51 real clubs have never had a player reach 80, so this is the COMMON path
   * for them, not an edge case.
   */
  it("falls back to best-available for a club with nobody at the bar", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const strong = chaosDraft(pool, seed, "Rivals", { policy: "strong" });
      const best = chaosDraft(pool, seed, "Rivals", { policy: "best" });
      expect(strong.players).toHaveLength(11);
      expect(strong.players.map((p) => p.cardId)).toEqual(best.players.map((p) => p.cardId));
    }
  });

  it("⚠️ VARIES the line-up — the whole reason it exists rather than `best`", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      seen.add(
        chaosDraft(strongPool, seed, "Rivals", { policy: "strong" })
          .players.map((p) => p.playerId)
          .sort((a, b) => a - b)
          .join(","),
      );
    }
    // `best` would produce ONE XI across all forty seeds.
    expect(seen.size).toBeGreaterThan(20);
    expect(
      new Set(
        Array.from({ length: 40 }, (_, i) =>
          chaosDraft(strongPool, i + 1, "Rivals", { policy: "best" })
            .players.map((p) => p.playerId)
            .join(","),
        ),
      ).size,
    ).toBeLessThanOrEqual(FORMATIONS.length);
  });

  it("stays inside the band — no line-up drops to the pool's floor", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const team = chaosDraft(strongPool, seed, "Rivals", { policy: "strong" });
      // Every card in the band is 80+, so a whole XI of them cannot average below it.
      expect(Math.min(...ovr(team))).toBeGreaterThanOrEqual(80);
      expect(mean(ovr(team))).toBeGreaterThanOrEqual(80);
    }
  });

  it("is deterministic — the same seed replays the same XI", () => {
    const a = chaosDraft(strongPool, 4242, "Rivals", { policy: "strong" });
    const b = chaosDraft(strongPool, 4242, "Rivals", { policy: "strong" });
    expect(a.players.map((p) => p.cardId)).toEqual(b.players.map((p) => p.cardId));
    expect(a.bench?.map((p) => p.cardId)).toEqual(b.bench?.map((p) => p.cardId));
  });

  /**
   * ⛔ Verified BY SABOTAGE, and the first version of this test was vacuous.
   *
   * `strongFor` draws its rng BEFORE deciding whether the band is empty, so every slot costs
   * exactly one number whether or not the club has cover there. Move that draw inside the
   * branch and a MIXED club — some roles at the bar, some below — shifts every later slot's
   * draw, so the same seed produces a different XI.
   *
   * ⚠️ The fixture has to be mixed. Tested against a pool that was entirely above the bar or
   * entirely below it, the sabotage changed nothing at all and the test passed over it.
   */
  it("costs one rng draw per slot whether or not the band has anyone in it", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      seen.add(
        chaosDraft(mixedPool, seed, "Rivals", { policy: "strong" })
          .players.map((p) => p.cardId)
          .join(","),
      );
    }
    // The property under test is an EXACT stream, so pin it: this is what the unconditional
    // draw produces, and it is not what the conditional one does.
    expect(
      chaosDraft(mixedPool, 7, "Rivals", { policy: "strong" }).players.map((p) => p.cardId),
    ).toMatchSnapshot();
    expect(seen.size).toBeGreaterThan(10);
  });
});
