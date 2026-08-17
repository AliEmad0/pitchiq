import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { HAND_SIZE, STANDOUT_OVR, roomDeals } from "@/features/game/domain/draft-room";
import { canPlay } from "@/features/game/domain/eligibility";
import { formationByName } from "@/features/game/domain/formation";

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

const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 12 }, (_, i) => ({
    cardId: makeCardId(r * 100 + i, 2020),
    playerId: r * 100 + i,
    season: 2020,
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
    club: "Club",
  })),
);

const shape = formationByName("4-4-2 Flat");
const key = (hs: PoolCard[][]) => hs.map((h) => h.map((c) => c.cardId).join(",")).join("|");

describe("roomDeals", () => {
  it("deals one hand per slot", () => {
    const hands = roomDeals(pool, shape, 42);
    expect(hands).toHaveLength(11);
    for (const h of hands) expect(h).toHaveLength(HAND_SIZE);
  });

  it("is deterministic from the seed", () => {
    expect(key(roomDeals(pool, shape, 42))).toBe(key(roomDeals(pool, shape, 42)));
  });

  it("different seeds deal differently", () => {
    expect(key(roomDeals(pool, shape, 1))).not.toBe(key(roomDeals(pool, shape, 2)));
  });

  it("⚠️ every candidate is eligible for its slot — the hard ban, by construction", () => {
    const hands = roomDeals(pool, shape, 42);
    hands.forEach((hand, i) => {
      for (const c of hand) expect(canPlay(c, shape.slots[i].role), `${c.name} @ ${i}`).toBe(true);
    });
  });

  it("⚠️ no player appears in two hands, so a duplicate pick is impossible", () => {
    const ids = roomDeals(pool, shape, 42)
      .flat()
      .map((c) => c.cardId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("⚠️ visiting order cannot change any hand", () => {
    // THE property that lets free roam and seed-sharing coexist. Hands are a function of
    // (pool, formation, seed) only — there is no visit order to pass in, and that is the
    // point.
    const a = roomDeals(pool, shape, 42);
    const b = roomDeals(pool, shape, 42);
    expect(a.map((h) => h.map((c) => c.cardId))).toEqual(b.map((h) => h.map((c) => c.cardId)));
  });

  it("⚠️ deals a hand of the REQUESTED size (TASK-1810 — Legacy rounds offer three)", () => {
    const hands = roomDeals(pool, shape, 42, { handSize: 3 });
    expect(hands).toHaveLength(11);
    for (const h of hands) expect(h).toHaveLength(3);
  });

  it("⛔ THE CONTROL — the three-argument call still deals five", () => {
    // This half is what proves `/game/draft` is untouched. The parameter defaults to the
    // shipped constant, so every existing caller deals exactly what it dealt before.
    expect(HAND_SIZE).toBe(5);
    for (const h of roomDeals(pool, shape, 42)) expect(h).toHaveLength(HAND_SIZE);
  });

  it("⚠️ a three-card round keeps BOTH construction guarantees", () => {
    // The hard ban and the no-duplicates property come from the loop this parameter
    // changes, so they are re-asserted at the new size rather than assumed to carry over.
    const hands = roomDeals(pool, shape, 42, { handSize: 3 });
    hands.forEach((hand, i) => {
      for (const c of hand) expect(canPlay(c, shape.slots[i].role), `${c.name} @ ${i}`).toBe(true);
    });
    const ids = hands.flat().map((c) => c.cardId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("⛔ standout: every hand carries a card at 80+ when the club has them", () => {
    // The owner's guarantee. `pool` runs 50–61, so nothing reaches 80 on its own — a
    // deliberately strong card per role is what makes the assertion meaningful.
    // ⚠️ EIGHT per role. The guarantee is "an 80+ card if one is still available for this
    // position", and two things eat availability: a shape with two slots of one role, and
    // the RANDOM FOUR, which may itself draw the remaining strong cards. Measured on a
    // three-per-role fixture, slot 6 took all three CMs and slot 7 correctly fell back to
    // best-available — so a thin fixture tests exhaustion rather than the guarantee.
    const strong = ROLES.flatMap((role, r) =>
      [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({
        ...pool[r * 12]!,
        cardId: makeCardId(9000 + r * 10 + k, 2021),
        playerId: 9000 + r * 10 + k,
        name: `${role}-STAR-${k}`,
        ratings: { ...pool[0]!.ratings!, overall: 84 },
      })),
    );
    const hands = roomDeals([...pool, ...strong], shape, 42, { handSize: 5, standout: true });
    hands.forEach((hand, i) => {
      expect(hand.some((c) => (c.ratings?.overall ?? 0) >= STANDOUT_OVR), `slot ${i}`).toBe(true);
    });
  });

  it("⛔ standout falls back to the BEST available when the club has nothing at 80+", () => {
    // 12 of the 51 real clubs have never had an 80 — Huddersfield's best ever is a 67 — so
    // this is the branch most clubs actually take, not an edge case.
    const hands = roomDeals(pool, shape, 42, { handSize: 5, standout: true });
    hands.forEach((hand, i) => {
      const role = shape.slots[i].role;
      const bestPossible = Math.max(
        ...pool.filter((c) => canPlay(c, role)).map((c) => c.ratings?.overall ?? 0),
      );
      const bestOffered = Math.max(...hand.map((c) => c.ratings?.overall ?? 0));
      // Earlier slots consume the top cards, so the guarantee is "the best still available",
      // which for slot 0 is exactly the best in the pool.
      if (i === 0) expect(bestOffered).toBe(bestPossible);
      expect(bestOffered).toBeGreaterThan(50);
    });
  });

  it("⚠️ the guaranteed card is not always in the same position in the hand", () => {
    // Without the shuffle the strong card sits first in every hand and the other four are
    // never read — the guarantee would become a tell.
    const strong = ROLES.map((role, r) => ({
      ...pool[r * 12]!,
      cardId: makeCardId(9100 + r, 2021),
      playerId: 9100 + r,
      name: `${role}-STAR`,
      ratings: { ...pool[0]!.ratings!, overall: 90 },
    }));
    const positions = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const hand of roomDeals([...pool, ...strong], shape, seed, { handSize: 5, standout: true })) {
        const at = hand.findIndex((c) => (c.ratings?.overall ?? 0) >= 90);
        if (at >= 0) positions.add(at);
      }
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it("⛔ onePerPlayer: the same player can never be offered twice across the draft", () => {
    // Legacy holds one card per player-SEASON, so without this Gary Neville 1996 and Gary
    // Neville 2003 are different cards and could both be drafted into one XI.
    const multiSeason = ROLES.flatMap((role, r) =>
      [2018, 2019, 2020, 2021].map((season) => ({
        ...pool[r * 12]!,
        cardId: makeCardId(r * 100, season),
        playerId: r * 100, // the SAME player, four seasons
        season,
      })),
    );
    const hands = roomDeals(multiSeason, shape, 42, { handSize: 5, onePerPlayer: true });
    const ids = hands.flat().map((c) => c.playerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("⛔ THE CONTROL — cardId dedupe alone would let one player in twice", () => {
    // Proves the option above is load-bearing rather than decorative: the identical pool
    // without `onePerPlayer` repeats players, which is exactly the shipped behaviour that
    // is correct for Chaos (one card per player) and wrong for Legacy.
    const multiSeason = ROLES.flatMap((role, r) =>
      [2018, 2019, 2020, 2021].map((season) => ({
        ...pool[r * 12]!,
        cardId: makeCardId(r * 100, season),
        playerId: r * 100,
        season,
      })),
    );
    const ids = roomDeals(multiSeason, shape, 42, { handSize: 5 }).flat().map((c) => c.playerId);
    expect(new Set(ids).size).toBeLessThan(ids.length);
  });

  it("⚠️ a starved pool yields a SHORT hand, never an ineligible candidate", () => {
    // The real pool cannot reach this branch (TASK-1831 measured every slot of every
    // shape), so without a deliberately thin pool it would never be exercised — and
    // padding a short hand is the one way an illegal candidate could reach the coach,
    // because this path has no validation behind it.
    const thin = pool
      .filter((c) => c.role !== "CF")
      .concat(pool.filter((c) => c.role === "CF").slice(0, 1));
    const hands = roomDeals(thin, shape, 42);
    const forwards = shape.slots
      .map((s, i) => (s.role === "CF" ? hands[i] : null))
      .filter((h): h is PoolCard[] => h != null);
    expect(forwards.some((h) => h.length < HAND_SIZE)).toBe(true);
    forwards.forEach((h, i) => {
      for (const c of h) expect(canPlay(c, "CF"), `${c.name} in forward hand ${i}`).toBe(true);
    });
  });
});
