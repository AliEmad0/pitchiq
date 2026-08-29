import { describe, expect, it } from "vitest";
import { FORMATIONS } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { ADJACENCY_BAND, adjacentPairs } from "@/features/game/domain/pitch-adjacency";

/**
 * TASK-1810 PR 5 — the pitch graph the Chemistry Draft's links run along.
 *
 * ⭐ Adjacency is what stops chemistry being a set-cover puzzle: WHERE a card is placed
 * decides whether its links count. Measured 2026-08-28 across all 20 shapes — see the spec
 * §0.4 for the band sweep that chose 0.26.
 */

/** A pair as "ROLE(r,c)—ROLE(r,c)", so a failure names the football rather than two indices. */
const label = (f: ReturnType<typeof formationByName>, [i, j]: [number, number]) => {
  const a = f.slots[i]!;
  const b = f.slots[j]!;
  return `${a.role}(${a.row},${a.col})—${b.role}(${b.row},${b.col})`;
};

describe("pitch adjacency", () => {
  it("⛔ the 4-4-2 Flat graph, exactly — a golden, so geometry cannot drift silently", () => {
    /**
     * ⚠️ Resolved by NAME (`FORMATIONS`' order is presentation only), and asserted as the
     * full set rather than a count: a band change that swapped which pairs link while
     * keeping the total would otherwise pass. This graph reads like a real team, which is
     * the whole point of the measurement that chose the band.
     */
    const f = formationByName("4-4-2 Flat");
    expect(
      adjacentPairs(f)
        .map((p) => label(f, p))
        .sort(),
    ).toEqual(
      [
        "GK(1,1)—CB(2,2)",
        "GK(1,1)—CB(2,3)",
        "LB(2,1)—CB(2,2)",
        "LB(2,1)—LM(3,1)",
        "LB(2,1)—CM(3,2)",
        "CB(2,2)—CB(2,3)",
        "CB(2,2)—LM(3,1)",
        "CB(2,2)—CM(3,2)",
        "CB(2,2)—CM(3,3)",
        "CB(2,3)—RB(2,4)",
        "CB(2,3)—CM(3,2)",
        "CB(2,3)—CM(3,3)",
        "CB(2,3)—RM(3,4)",
        "RB(2,4)—CM(3,3)",
        "RB(2,4)—RM(3,4)",
        "LM(3,1)—CM(3,2)",
        "LM(3,1)—CF(4,1)",
        "CM(3,2)—CM(3,3)",
        "CM(3,2)—CF(4,1)",
        "CM(3,3)—RM(3,4)",
        "CM(3,3)—CF(4,2)",
        "RM(3,4)—CF(4,2)",
        "CF(4,1)—CF(4,2)",
      ].sort(),
    );
  });

  it("⭐ the keeper links to his CENTRE-BACKS and nobody else", () => {
    // The band was chosen so this falls out of the geometry rather than being special-cased:
    // a keeper who linked to his wing-backs — or worse, to a striker — would be nonsense.
    for (const f of FORMATIONS) {
      const gk = f.slots.findIndex((s) => s.role === "GK");
      if (gk < 0) continue;
      for (const [i, j] of adjacentPairs(f)) {
        if (i !== gk && j !== gk) continue;
        const other = f.slots[i === gk ? j : i]!;
        expect(other.row, `${f.name}: GK linked to ${other.role} on row ${other.row}`).toBe(2);
      }
    }
  });

  it("⛔ never links across two rows — no keeper-to-striker chemistry", () => {
    for (const f of FORMATIONS) {
      for (const [i, j] of adjacentPairs(f)) {
        expect(
          Math.abs(f.slots[i]!.row - f.slots[j]!.row),
          `${f.name}: ${label(f, [i, j])}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it("⚠️ every shape lands in the MEASURED 14–25 band", () => {
    // Spec §0.4. A shape falling out of this band means the geometry moved, and the whole
    // chemistry scale moves with it — every score ever shared would mean something else.
    for (const f of FORMATIONS) {
      const n = adjacentPairs(f).length;
      expect(n, `${f.name} has ${n} pairs`).toBeGreaterThanOrEqual(14);
      expect(n, `${f.name} has ${n} pairs`).toBeLessThanOrEqual(25);
    }
  });

  it("is symmetric, irreflexive and duplicate-free, for all 20 shapes", () => {
    expect(FORMATIONS).toHaveLength(20); // a vacuous loop would pass everything below
    for (const f of FORMATIONS) {
      const seen = new Set<string>();
      for (const [i, j] of adjacentPairs(f)) {
        expect(i, `${f.name}: self-link`).not.toBe(j);
        // Emitted low-index-first, so the reversed key can never also appear.
        expect(i).toBeLessThan(j);
        const key = `${i}-${j}`;
        expect(seen.has(key), `${f.name}: duplicate ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it("⚠️ the band is a FROZEN measured constant, not a preference", () => {
    // Changing it changes every chemistry score ever shared — same discipline as the
    // market-index factors. Pinned so a tweak has to be deliberate.
    expect(ADJACENCY_BAND).toBe(0.26);
  });

  it("returns a stable result for the same formation", () => {
    const f = formationByName("3-5-2");
    expect(adjacentPairs(f)).toEqual(adjacentPairs(f));
  });
});
