import { describe, expect, it } from "vitest";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { teamFitChemistry } from "@/features/game/domain/chemistry";
import { teamChemistryModifier } from "@/features/game/domain/chemistry-modifier";
import { formationByName } from "@/features/game/domain/formation";
import { makeGameTeam } from "@/features/game/domain/team";

/**
 * TASK-1824 — chemistry in the stored-result modes (season fixtures, the Weekly Ladder, the
 * Mystery Market). They need no identity flag because they never replay; what they need is the
 * SAME score a drafted single match plays — role fit included — for both sides.
 */
const shape = formationByName("4-4-2 Flat")!;
let seq = 0;
const side = (linked: boolean, offPosition = false) =>
  shape.slots.map((s) => {
    seq += 1;
    return {
      cardId: makeCardId(seq, 2004),
      playerId: seq,
      season: linked ? 2004 : 1994 + (seq % 25),
      name: `P${seq}`,
      role: offPosition && s.role !== "GK" ? "CM" : s.role,
      altRoles: [],
      foot: null,
      height: null,
      provenance: null,
      ratings: { attack: 70, creation: 70, defense: 70, physical: 70, discipline: 60, overall: 70 },
      club: linked ? "Arsenal" : `C${seq}`,
      teamId: linked ? 7 : 5000 + seq,
      nationalityCode: linked ? "fr" : `n${seq}`,
    } as PoolCard;
  });
const team = (players: PoolCard[]) => makeGameTeam(1, "T", 2004, shape, players as never);
const state = {
  home: { power: { attack: 100, defense: 100 } },
  away: { power: { attack: 100, defense: 100 } },
} as never;

describe("chemistry in stored-result modes", () => {
  it("⭐ a linked side is lifted and a side of strangers is not — each by its OWN score", () => {
    const mates = team(side(true));
    const strangers = team(side(false));
    expect(teamFitChemistry(mates)).toBe(100);
    expect(teamFitChemistry(strangers)).toBe(0);
    const mod = teamChemistryModifier(mates, strangers);
    expect(mod({ state, side: "home" } as never)).toEqual({ attack: 3, defense: 3 });
    expect(mod({ state, side: "away" } as never)).toEqual({ attack: 0, defense: 0 });
  });

  it("⛔ role fit counts here too — the same linked side, out of position, is lifted less", () => {
    const placed = team(side(true));
    const misplaced = team(side(true, true));
    expect(teamFitChemistry(misplaced)).toBeLessThan(teamFitChemistry(placed));
    const a = teamChemistryModifier(placed, misplaced)({ state, side: "away" } as never);
    const h = teamChemistryModifier(placed, misplaced)({ state, side: "home" } as never);
    expect(a.attack!).toBeLessThan(h.attack!);
  });
});
