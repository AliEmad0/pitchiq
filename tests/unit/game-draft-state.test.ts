import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { FORMATIONS } from "@/features/game/domain/chaos-draft";
import {
  createDraftState,
  draftReducer,
  isComplete,
  validateSquad,
} from "@/features/game/view/draft-state";

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

const gk = card(1, "GK");
const cb = card(2, "CB");
const cb2 = card(4, "CB");
const rb = card(5, "RB");
const pool = [gk, cb, cb2, rb];
const start = () => createDraftState(formationByName("4-4-2"), 123); // 4-4-2

describe("draftReducer", () => {
  it("places a card into a slot and clears the selection", () => {
    const s = draftReducer(start(), { type: "place", index: 2, cardId: cb.cardId });
    expect(s.slots[2]).toBe(cb.cardId);
    expect(s.selection).toBeNull();
  });

  it("MOVES a placed card rather than duplicating it", () => {
    // A card is a player-season; the same man cannot occupy two slots, and an XI with
    // a duplicate is one the engine cannot assemble.
    let s = draftReducer(start(), { type: "place", index: 2, cardId: cb.cardId });
    s = draftReducer(s, { type: "place", index: 3, cardId: cb.cardId });
    expect(s.slots[2]).toBeNull();
    expect(s.slots[3]).toBe(cb.cardId);
  });

  it("swaps when the destination is already occupied", () => {
    let s = draftReducer(start(), { type: "place", index: 2, cardId: cb.cardId });
    s = draftReducer(s, { type: "place", index: 3, cardId: cb2.cardId });
    s = draftReducer(s, { type: "place", index: 2, cardId: cb2.cardId });
    expect(s.slots[2]).toBe(cb2.cardId);
    expect(s.slots[3]).toBe(cb.cardId);
  });

  it("selects a slot, then a card, and places on the second click", () => {
    let s = draftReducer(start(), { type: "selectSlot", index: 2 });
    expect(s.selection).toEqual({ kind: "slot", index: 2 });
    s = draftReducer(s, { type: "selectCard", cardId: cb.cardId });
    expect(s.slots[2]).toBe(cb.cardId);
    expect(s.selection).toBeNull();
  });

  it("selects a card, then a slot, and places on the second click", () => {
    // Both instincts are common; supporting only one reads as broken to the other half.
    let s = draftReducer(start(), { type: "selectCard", cardId: cb.cardId });
    expect(s.selection).toEqual({ kind: "card", cardId: cb.cardId });
    s = draftReducer(s, { type: "selectSlot", index: 3 });
    expect(s.slots[3]).toBe(cb.cardId);
    expect(s.selection).toBeNull();
  });

  it("clicking the same slot twice deselects instead of trapping the coach", () => {
    let s = draftReducer(start(), { type: "selectSlot", index: 2 });
    s = draftReducer(s, { type: "selectSlot", index: 2 });
    expect(s.selection).toBeNull();
  });

  it("clicking the same card twice deselects too", () => {
    let s = draftReducer(start(), { type: "selectCard", cardId: cb.cardId });
    s = draftReducer(s, { type: "selectCard", cardId: cb.cardId });
    expect(s.selection).toBeNull();
  });

  it("clears a slot", () => {
    let s = draftReducer(start(), { type: "place", index: 2, cardId: cb.cardId });
    s = draftReducer(s, { type: "clearSlot", index: 2 });
    expect(s.slots[2]).toBeNull();
  });

  it("keeps players in place when the formation changes", () => {
    // They are flagged by validateSquad, never silently dropped — dropping them would
    // discard the coach's work invisibly.
    let s = draftReducer(start(), { type: "place", index: 2, cardId: cb.cardId });
    s = draftReducer(s, { type: "setFormation", formation: formationByName("3-5-2") }); // 3-5-2
    expect(s.slots[2]).toBe(cb.cardId);
    expect(s.formation.name).toBe("3-5-2");
  });
});

describe("validateSquad", () => {
  it("passes a legal XI", () => {
    let s = draftReducer(start(), { type: "place", index: 0, cardId: gk.cardId });
    s = draftReducer(s, { type: "place", index: 2, cardId: cb.cardId });
    expect(validateSquad(s, pool)).toEqual([]);
  });

  it("⚠️ reports a player left misplaced by a formation change, naming him and the slot", () => {
    // THE case the hard ban exists for. Click-to-place never offers an illegal slot, so
    // this is the only way an illegal XI can arise through the UI — and it is easy to hit.
    //
    // Slot 4 is the one index whose role genuinely changes between these two shapes:
    //   formationByName("4-4-2") 4-4-2 → [GK, LB, CB, CB, RB, LM, CM, CM, RM, CF, CF]
    //   formationByName("3-5-2") 3-5-2 → [GK, CB, CB, CB, LM, CM, CAM, CM, RM, CF, CF]
    // So a right-back is legal at index 4 in a 4-4-2 and illegal there in a 3-5-2.
    // Any other index would make this test pass for the wrong reason.
    let s = draftReducer(start(), { type: "place", index: 4, cardId: rb.cardId });
    expect(validateSquad(s, pool)).toEqual([]);
    s = draftReducer(s, { type: "setFormation", formation: formationByName("3-5-2") });
    const errors = validateSquad(s, pool);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      slotIndex: 4,
      role: "LM",
      cardId: rb.cardId,
      playerName: "P5",
    });
  });

  it("ignores empty slots — incompleteness is not an eligibility offence", () => {
    expect(validateSquad(start(), pool)).toEqual([]);
  });
});

describe("isComplete", () => {
  it("is false while any slot is empty", () => {
    expect(isComplete(start())).toBe(false);
  });

  it("is true once every slot is filled", () => {
    let s = start();
    s.formation.slots.forEach((_, i) => {
      s = draftReducer(s, { type: "place", index: i, cardId: makeCardId(900 + i, 2020) });
    });
    expect(isComplete(s)).toBe(true);
  });
});
