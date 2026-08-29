import { describe, expect, it } from "vitest";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { chemistry, chemistryBreakdown, linkTier } from "@/features/game/domain/chemistry";
import { formationByName } from "@/features/game/domain/formation";
import { adjacentPairs } from "@/features/game/domain/pitch-adjacency";

/**
 * TASK-1810 PR 5 — the chemistry model. Spec §1.
 *
 * Three EXCLUSIVE tiers: countrymen (1), club legends (2), teammates (3). Exclusive both
 * because a pair is one thing and because the tiers map 1:1 onto the three connector colours
 * the pitch draws — an additive score would have six values and no honest colour for four.
 */

let seq = 0;
const card = (over: Partial<PoolCard> = {}): PoolCard => {
  seq += 1;
  return {
    cardId: makeCardId(seq, over.season ?? 2020),
    playerId: seq,
    season: 2020,
    name: `P${seq}`,
    role: "CM",
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 70 },
    club: "Club A",
    teamId: 1,
    nationalityCode: "fr",
    ...over,
  } as PoolCard;
};

const shape = formationByName("4-4-2 Flat");
const PAIRS = adjacentPairs(shape).length;

describe("linkTier", () => {
  it("⛔ is EXCLUSIVE — teammates beats club beats nation, never summed", () => {
    // The pair below is countrymen AND club legends AND teammates. It scores as ONE thing.
    const a = card({ nationalityCode: "fr", teamId: 7, club: "Arsenal", season: 2004 });
    const b = card({ nationalityCode: "fr", teamId: 7, club: "Arsenal", season: 2004 });
    expect(linkTier(a, b)).toBe("teammates");
  });

  it("grades the three tiers off the same pair, one condition at a time", () => {
    const base = { nationalityCode: "fr", teamId: 7, club: "Arsenal", season: 2004 };
    const a = card(base);
    expect(linkTier(a, card({ ...base }))).toBe("teammates");
    // Same club, different season → club legends (Giggs '08 and Scholes '01).
    expect(linkTier(a, card({ ...base, season: 1999 }))).toBe("club");
    // Different club, same nation → countrymen.
    expect(linkTier(a, card({ ...base, teamId: 9, club: "Chelsea" }))).toBe("nation");
    // Nothing shared.
    expect(linkTier(a, card({ nationalityCode: "br", teamId: 9, club: "Chelsea" }))).toBe("none");
  });

  it("⛔ a MISSING nationality is never a match — absent is not equal", () => {
    // Same rule `ringOf` follows: two unknowns must not link, or every uncoded card becomes
    // everybody's countryman. 6 rows in the dataset carry no code.
    const a = card({ nationalityCode: null, teamId: 1, club: "A" });
    const b = card({ nationalityCode: null, teamId: 2, club: "B" });
    expect(linkTier(a, b)).toBe("none");
    expect(linkTier(a, card({ nationalityCode: undefined, teamId: 2, club: "B" }))).toBe("none");
  });

  it("⭐ identifies a club by teamId, so a RENAMED club still links", () => {
    /**
     * ⛔ The trap: a card's `club` is the club's name IN THAT SEASON, and clubs get renamed
     * across a 34-season archive. Keying the club link on the name would silently break the
     * link for exactly the long-history clubs the mode is built on. `teamId` is stable.
     */
    const a = card({ teamId: 42, club: "Tottenham Hotspur", season: 2020, nationalityCode: "br" });
    const b = card({ teamId: 42, club: "Spurs", season: 2003, nationalityCode: "fr" });
    expect(linkTier(a, b)).toBe("club");
    // …and same id + same season is still the teammate tier despite the different name.
    expect(
      linkTier(a, card({ teamId: 42, club: "Spurs", season: 2020, nationalityCode: "fr" })),
    ).toBe("teammates");
  });

  it("two cards with no club identity at all never link on club", () => {
    const a = card({ teamId: undefined, club: "", nationalityCode: "br" });
    const b = card({ teamId: undefined, club: "", nationalityCode: "fr" });
    expect(linkTier(a, b)).toBe("none");
  });
});

describe("chemistry score", () => {
  const fill = (make: (i: number) => PoolCard) =>
    Array.from({ length: shape.slots.length }, (_, i) => make(i));

  it("is 0 for an empty XI and 100 for an all-teammates XI", () => {
    expect(chemistry(Array(shape.slots.length).fill(null), shape)).toBe(0);
    const mates = fill(() => card({ teamId: 7, club: "Arsenal", season: 2004 }));
    expect(chemistry(mates, shape)).toBe(100);
  });

  it("⚠️ an EMPTY slot scores 0 but still counts in the denominator", () => {
    // So the number climbs as the XI fills rather than jumping about — chemistry is a
    // progress bar, not a verdict on a part-built side.
    const mates = fill(() => card({ teamId: 7, club: "Arsenal", season: 2004 }));
    const partial = [...mates];
    partial[0] = null;
    const half = chemistry(partial, shape);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(100);
    // Filling that slot can only raise it.
    expect(chemistry(mates, shape)).toBeGreaterThan(half);
  });

  it("⚠️ is ORDER-INDEPENDENT — the same placement always scores the same", () => {
    const xi = fill((i) =>
      card({ teamId: i < 6 ? 7 : 9, club: `C${i < 6 ? 7 : 9}`, season: 2004 }),
    );
    const a = chemistry(xi, shape);
    const b = chemistry([...xi], shape);
    expect(a).toBe(b);
  });

  it("grades: all-countrymen scores a THIRD of all-teammates", () => {
    // Strengths are 1/2/3 of a max 3, so a full sheet of nation links is exactly 33.
    const nation = fill((i) => card({ nationalityCode: "fr", teamId: i, club: `C${i}` }));
    expect(chemistry(nation, shape)).toBe(33);
    const legends = fill(() => card({ teamId: 7, club: "Arsenal", season: 1990 + seq }));
    expect(chemistry(legends, shape)).toBe(67);
  });

  it("⛔ only ADJACENT pairs count — a link across the pitch is worth nothing", () => {
    /**
     * The property that makes placement matter. Two teammates in slots that do not touch
     * (the keeper and a striker) must score exactly zero.
     */
    const xi: (PoolCard | null)[] = Array(shape.slots.length).fill(null);
    const gk = shape.slots.findIndex((s) => s.role === "GK");
    const cf = shape.slots.findIndex((s) => s.role === "CF");
    expect(
      adjacentPairs(shape).some(([i, j]) => (i === gk && j === cf) || (i === cf && j === gk)),
    ).toBe(false);
    xi[gk] = card({ teamId: 7, club: "Arsenal", season: 2004 });
    xi[cf] = card({ teamId: 7, club: "Arsenal", season: 2004 });
    expect(chemistry(xi, shape)).toBe(0);
  });
});

describe("chemistryBreakdown", () => {
  it("counts every adjacent pair exactly once, across the four states", () => {
    const xi = Array.from({ length: shape.slots.length }, (_, i) =>
      card({
        nationalityCode: i % 2 === 0 ? "fr" : "br",
        teamId: i < 4 ? 7 : 9,
        club: `C${i < 4 ? 7 : 9}`,
      }),
    );
    const b = chemistryBreakdown(xi, shape);
    expect(b.none + b.nation + b.club + b.teammates).toBe(PAIRS);
    expect(PAIRS).toBe(23); // the measured 4-4-2 Flat graph
  });

  it("reports the tiers a coach is shown on the meter", () => {
    const mates = Array.from({ length: shape.slots.length }, () =>
      card({ teamId: 7, club: "Arsenal", season: 2004 }),
    );
    const b = chemistryBreakdown(mates, shape);
    expect(b.teammates).toBe(PAIRS);
    expect(b.none).toBe(0);
  });
});
