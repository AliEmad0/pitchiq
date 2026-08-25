import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { roomDeals } from "@/features/game/domain/draft-room";
import { formationByName } from "@/features/game/domain/formation";
import { createRoomState, roomReducer } from "@/features/game/view/room-state";

/**
 * TASK-1810 — the `captainFirst` rule: an icon is in the XI before a card is drafted.
 *
 * ⚠️ Asserted HERE rather than through the draft UI, where the hand is dealt face-down and
 * "his name is not on screen" would pass for the wrong reason.
 */
const ROLES: PlayerRole[] = ["GK", "RB", "CB", "LB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "CF"];

/** Several cards per role, several seasons per man — the shape the real pool has. */
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
    cardId: makeCardId(r * 10 + i, 2020 - (i % 3)),
    playerId: r * 10 + i,
    season: 2020 - (i % 3),
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
/**
 * ⚠️ The captain deliberately appears in THREE seasons, because the real pool does: a man
 * is one card per season he played. Without that the "excludes every season" test asserts
 * a precondition its own fixture cannot meet — it failed on exactly that first time round.
 */
const captainSeasons: PoolCard[] = [2018, 2017].map((season) => ({
  ...pool[0]!,
  cardId: makeCardId(pool[0]!.playerId, season),
  season,
}));
pool.push(...captainSeasons);

const shape = formationByName("4-4-2 Flat");
const captain = pool[0]!; // a GK, and now a three-season one

describe("roomDeals — excludePlayers", () => {
  /**
   * ⛔ The icon is IN the pool, because every path that rebuilds a match resolves the saved
   * XI against it and `replayWith` returns null on the first card it cannot find. So he has
   * to be kept out of the HANDS instead — a different question from whether the card exists.
   */
  it("⛔ never deals an excluded player, though he is in the pool", () => {
    const hands = roomDeals(pool, shape, 1234, {
      onePerPlayer: true,
      excludePlayers: new Set([captain.playerId]),
    });
    expect(pool.some((c) => c.playerId === captain.playerId)).toBe(true);
    expect(hands.flat().some((c) => c.playerId === captain.playerId)).toBe(false);
    // Still a full deal — the exclusion must not starve a slot.
    for (const hand of hands) expect(hand.length).toBeGreaterThan(0);
  });

  /**
   * ⛔ Excluding a PLAYER means all of his cards, not the one card handed in. The pool
   * holds a man once per season, so dropping a single `cardId` would let his 2019 card be
   * dealt while his 2020 card wore the armband.
   */
  it("⛔ excludes every SEASON of that player, not just one card", () => {
    const all = pool.filter((c) => c.playerId === captain.playerId);
    expect(all.length).toBeGreaterThan(1);
    const hands = roomDeals(pool, shape, 99, {
      excludePlayers: new Set([captain.playerId]),
    });
    expect(hands.flat().some((c) => c.playerId === captain.playerId)).toBe(false);
  });

  /**
   * ⚠️ Determinism control. The filter changes the bag and therefore every draw after it —
   * so it must be inert when empty, or Legacy's shipped deals would move.
   */
  it("⚠️ THE CONTROL — passing no exclusion deals exactly what it always did", () => {
    const before = roomDeals(pool, shape, 777, { onePerPlayer: true });
    const after = roomDeals(pool, shape, 777, { onePerPlayer: true, excludePlayers: undefined });
    expect(after.map((h) => h.map((c) => c.cardId))).toEqual(
      before.map((h) => h.map((c) => c.cardId)),
    );
  });
});

describe("createRoomState — a locked pick", () => {
  it("places the captain and opens on a slot the coach still has to fill", () => {
    const state = createRoomState(shape, { index: 0, cardId: captain.cardId });
    expect(state.picks[0]).toBe(captain.cardId);
    expect(state.locked).toBe(0);
    // ⚠️ Never parked on the locked slot — that decision has already been made for him.
    expect(state.open).not.toBe(0);
    expect(state.picks[state.open!]).toBeNull();
  });

  it("⚠️ leaves an ordinary room untouched — no lock, opens at the first slot", () => {
    const state = createRoomState(shape);
    expect(state.locked).toBeNull();
    expect(state.open).toBe(0);
    expect(state.picks.every((p) => p === null)).toBe(true);
  });

  /**
   * ⛔ A slot INDEX belongs to a formation. The captain's slot in a 4-4-2 is not his slot
   * in a 2-3-5, so `setFormation` carries a freshly derived lock rather than reusing one.
   */
  it("⛔ re-places the captain when the shape changes", () => {
    const other = formationByName("2-3-5 Pyramid");
    const start = createRoomState(shape, { index: 0, cardId: captain.cardId });
    const next = roomReducer(start, {
      type: "setFormation",
      formation: other,
      locked: { index: 0, cardId: captain.cardId },
    });
    expect(next.formation).toBe(other);
    expect(next.picks[0]).toBe(captain.cardId);
    expect(next.picks.filter(Boolean)).toHaveLength(1);
  });

  it("⚠️ a shape change with no lock clears the board, as it always did", () => {
    const start = createRoomState(shape, { index: 0, cardId: captain.cardId });
    const next = roomReducer(start, { type: "setFormation", formation: shape });
    expect(next.picks.every((p) => p === null)).toBe(true);
    expect(next.locked).toBeNull();
  });
});
