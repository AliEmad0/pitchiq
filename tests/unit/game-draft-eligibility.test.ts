import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { eligibleCards, eligibleSlots } from "@/features/game/view/draft-eligibility";

const card = (playerId: number, role: PlayerRole, altRoles: PlayerRole[] = []): PoolCard => ({
  cardId: makeCardId(playerId, 2020),
  playerId,
  season: 2020,
  name: `P${playerId}`,
  role,
  altRoles,
  foot: null,
  height: null,
  provenance: null,
  ratings: null,
  club: "Club",
});

const keeper = card(1, "GK");
const centreBack = card(2, "CB");
const utility = card(3, "CB", ["CM"]);
const pool = [keeper, centreBack, utility];
// 4-4-2 → [GK, LB, CB, CB, RB, LM, CM, CM, RM, CF, CF]
const shape = formationByName("4-4-2 Flat");

describe("eligibleCards", () => {
  it("returns only cards that can play the slot's role", () => {
    expect(eligibleCards(pool, "GK").map((c) => c.playerId)).toEqual([1]);
    expect(eligibleCards(pool, "CB").map((c) => c.playerId)).toEqual([2, 3]);
  });

  it("counts an alternate role as eligible", () => {
    expect(eligibleCards(pool, "CM").map((c) => c.playerId)).toEqual([3]);
  });

  it("returns nothing rather than falling back when no card fits", () => {
    // The ban is hard. chaosDraft deliberately falls back to "anyone free" so a thin
    // pool still yields an XI, but the coach must never be OFFERED an illegal
    // placement — an empty list is the correct answer here.
    expect(eligibleCards(pool, "LW")).toEqual([]);
  });
});

describe("eligibleSlots", () => {
  it("returns every slot index the card may legally fill", () => {
    expect(eligibleSlots(shape, keeper)).toEqual([0]);
    expect(eligibleSlots(shape, centreBack)).toEqual([2, 3]);
  });

  it("includes slots reachable only through an alternate role", () => {
    expect(eligibleSlots(shape, utility)).toEqual([2, 3, 6, 7]);
  });
});
