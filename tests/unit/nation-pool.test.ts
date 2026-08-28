import { describe, expect, it } from "vitest";
import { buildPool, nationChoices } from "@/features/game/adapter/pool";
import { ringOf } from "@/features/game/domain/continents";
import { roomDeals } from "@/features/game/domain/draft-room";
import { canPlay } from "@/features/game/domain/eligibility";
import { formationByName } from "@/features/game/domain/formation";
import { NATION_PACK, type PoolSpec } from "@/features/game/domain/rule-packs";

/** The pack's own spec — never a second literal that could drift from it (the #201 rule). */
const SPEC = NATION_PACK.pool as Extract<PoolSpec, { kind: "nationRings" }>;

// Real committed data. ⛔ No synthetic pool: the recurring failure in this codebase is a
// fixture that cannot occur — and this mode exists BECAUSE of how the real data is shaped.
describe("nation choices", () => {
  it("offers every nation at or above the threshold, Egypt included, England on top", async () => {
    const choices = await nationChoices();
    // Measured 2026-08-27: 57 nations hold >= 11 distinct players. Pinned loosely so a data
    // refresh can move it without churn, tightly enough that a broken count cannot pass.
    expect(choices.length).toBeGreaterThanOrEqual(50);
    expect(choices.length).toBeLessThanOrEqual(70);
    expect(choices[0]!.code).toBe("gb-eng");
    expect(choices[0]!.players).toBeGreaterThan(1700);
    // ⚠️ The owner's own example must stay offerable — Egypt holds 14, the threshold is 11.
    const egypt = choices.find((c) => c.code === "eg");
    expect(egypt?.players).toBeGreaterThanOrEqual(SPEC.minPlayers);
    for (const c of choices) expect(c.players).toBeGreaterThanOrEqual(SPEC.minPlayers);
  }, 300_000);
});

describe("nation rings pool", () => {
  it("Egypt: every Egyptian is in, fallbacks fill every role to the floor, one card per man", async () => {
    const pool = await buildPool(SPEC, "eg");
    // One card per distinct player — the Captain's/Budget rule.
    expect(new Set(pool.map((c) => c.playerId)).size).toBe(pool.length);
    // Egypt is far under the cap at every role, so ALL its rated players are present —
    // "show me the available players", verbatim. (14 measured; ≥ 12 allows for the odd
    // unrated row without letting the ring collapse.)
    const egyptians = pool.filter((c) => c.nationalityCode === "eg");
    expect(egyptians.length).toBeGreaterThanOrEqual(12);
    // Every role reaches the floor — Egypt's gaps are what the Africa ring is FOR.
    for (const role of ["GK", "LB", "LM", "CB", "CF"] as const) {
      const n = pool.filter((c) => canPlay(c, role)).length;
      expect(n, role).toBeGreaterThanOrEqual(SPEC.roleFloor);
    }
    // The fills come from AFRICA first — the continent ring is real, not skipped over.
    expect(pool.some((c) => ringOf(c, "eg") === "continent")).toBe(true);
    /**
     * ⚠️ WORLD cards are CORRECT here, and the first draft of this test said the opposite.
     * Africa holds only FIVE goalkeepers across the whole archive (measured 2026-08-27)
     * against a floor of 20, so the world pass tops the role up — Peter Schmeichel in
     * Egypt's baked pool is the recipe working. What the coach SEES is still African: the
     * deal narrows each hand to the narrowest non-empty ring, so world cards surface only
     * once the continent itself is exhausted mid-draft.
     */
    const africanGks = pool.filter((c) => ringOf(c, "eg") === "continent" && canPlay(c, "GK"));
    expect(africanGks.length).toBeGreaterThanOrEqual(3); // the ~5 that exist, allowing churn
    expect(pool.some((c) => ringOf(c, "eg") === "world" && canPlay(c, "GK"))).toBe(true);
  }, 600_000);

  it("England: the cap holds the payload, and no fallback ring is baked at all", async () => {
    const pool = await buildPool(SPEC, "gb-eng");
    // 13 roles × cap 30 minus altRoles overlap — well under the uncapped 1,767.
    expect(pool.length).toBeLessThanOrEqual(13 * SPEC.perRoleCap);
    expect(pool.length).toBeGreaterThanOrEqual(100);
    // England covers every role past the floor on its own (471 CM-eligible alone), so a
    // non-English card here would mean the fill pass misfired.
    for (const c of pool) expect(c.nationalityCode, c.name).toBe("gb-eng");
  }, 600_000);

  it("⛔ THE NO-EMPTY-HAND CONTROL — the floor is verified, not trusted", async () => {
    /**
     * The spec's own words: the floor number is this test's input, not its proof. The worst
     * shapes are the 3-CB and 3-CM families (measured maxima), where same-role hands consume
     * up to 15 cards before altRoles theft. A thin nation (Egypt), a mid one (Japan — zero
     * GKs, Asia holds two total), and the giant (England) each deal every one of them.
     */
    const shapes = ["5-3-2", "3-5-2", "4-3-3 Flat", "4-4-2 Flat"]
      .map((n) => {
        try {
          return formationByName(n);
        } catch {
          return null;
        }
      })
      .filter((f): f is NonNullable<typeof f> => f != null);
    expect(shapes.length).toBeGreaterThanOrEqual(3);

    for (const code of ["eg", "jp", "gb-eng"]) {
      const pool = await buildPool(SPEC, code);
      for (const shape of shapes) {
        for (const seed of [1, 42, 999]) {
          const hands = roomDeals(pool, shape, seed, {
            onePerPlayer: true,
            rings: { nation: code },
          });
          hands.forEach((hand, i) => {
            expect(hand.length, `${code} ${shape.name} seed ${seed} slot ${i}`).toBeGreaterThan(0);
            // …and single-ring, the deal's own promise, re-checked against real data.
            const rs = new Set(hand.map((c) => ringOf(c, code)));
            expect(rs.size, `${code} ${shape.name} slot ${i}`).toBe(1);
          });
        }
      }
    }
  }, 300_000);

  it("Japan's goalkeeper hand is ASIAN — the widening the owner described, on real data", async () => {
    // Japan holds 16 players and not one goalkeeper; Asia holds exactly two. The GK hand
    // must widen to the continent and deal them — short, honest, never empty.
    const pool = await buildPool(SPEC, "jp");
    const shape = formationByName("4-4-2 Flat");
    const hands = roomDeals(pool, shape, 7, { onePerPlayer: true, rings: { nation: "jp" } });
    const gk = hands[shape.slots.findIndex((s) => s.role === "GK")]!;
    expect(gk.length).toBeGreaterThan(0);
    for (const c of gk) {
      expect(c.nationalityCode).not.toBe("jp");
      expect(ringOf(c, "jp"), c.name).toBe("continent");
    }
  }, 300_000);
});
