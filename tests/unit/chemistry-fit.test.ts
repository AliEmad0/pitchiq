import { describe, expect, it } from "vitest";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import {
  OFF_POSITION_PENALTY,
  chemistry,
  fitChemistry,
  offPosition,
  offPositionSlots,
} from "@/features/game/domain/chemistry";
import { formationByName } from "@/features/game/domain/formation";

/**
 * TASK-1824 — role compatibility. A man in a slot that is not his own position plays there
 * only through `altRoles`, and each one costs the side `OFF_POSITION_PENALTY` chemistry.
 *
 * ⛔ The link score itself (`chemistry`) is untouched: the Chemistry Draft's saved matches
 * derive their modifier from it, so changing it would rewrite them. Fit is a SECOND score
 * layered on top, and only a match that declares `fit` plays it.
 */
let seq = 0;
const card = (over: Partial<PoolCard> = {}): PoolCard => {
  seq += 1;
  return {
    cardId: makeCardId(seq, 2020),
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

const shape = formationByName("4-4-2 Flat")!;
/** One teammate side, every man in his own position. */
const inPosition = () => shape.slots.map((s) => card({ role: s.role }));

describe("role fit", () => {
  it("a man is off position only when his PRIMARY role is not the slot's", () => {
    expect(offPosition(card({ role: "CB" }), "CB")).toBe(false);
    expect(offPosition(card({ role: "CB", altRoles: ["RB"] }), "RB")).toBe(true);
    // A card with no recorded role cannot be judged — absent is not a mismatch.
    expect(offPosition(card({ role: null }), "CF")).toBe(false);
  });

  it("an XI in position scores exactly its link chemistry", () => {
    const xi = inPosition();
    expect(offPositionSlots(xi, shape)).toEqual([]);
    expect(fitChemistry(xi, shape)).toBe(chemistry(xi, shape));
  });

  it("each man out of position costs the penalty, and empty slots cost nothing", () => {
    const xi: (PoolCard | null)[] = inPosition();
    const gk = shape.slots.findIndex((s) => s.role === "GK");
    const st = shape.slots.findIndex((s) => s.role === "CF");
    xi[st] = card({ role: "CB", altRoles: ["CF"] });
    xi[gk] = null;
    expect(offPositionSlots(xi, shape)).toEqual([st]);
    expect(fitChemistry(xi, shape)).toBe(Math.max(0, chemistry(xi, shape) - OFF_POSITION_PENALTY));
  });

  it("never drops below zero", () => {
    const xi = shape.slots.map((s) =>
      card({
        role: s.role === "GK" ? "CF" : "GK",
        teamId: undefined,
        club: undefined,
        nationalityCode: null,
      }),
    );
    expect(chemistry(xi, shape)).toBe(0);
    expect(fitChemistry(xi, shape)).toBe(0);
  });
});
