import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { HAND_SIZE, roomDeals } from "@/features/game/domain/draft-room";
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
