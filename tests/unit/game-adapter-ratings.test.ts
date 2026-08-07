import { describe, expect, it } from "vitest";
import { loadRatedSquad, rateGamePlayer } from "@/features/game/adapter/ratings";

describe("rateGamePlayer (committed data)", () => {
  it("rates a sparse-era card (Alan Shearer 1995) with tier=sparse", async () => {
    const card = await rateGamePlayer(1003185, 1995);
    expect(card).not.toBeNull();
    expect(card!.provenance?.tier).toBe("sparse");
    expect(card!.provenance?.basis.hasAdvanced).toBe(false);
    expect(card!.ratings).not.toBeNull();
    // A 31-goal season → strong attack.
    expect(card!.ratings!.attack).toBeGreaterThan(60);
    expect(card!.ratings!.overall).toBeGreaterThanOrEqual(0);
    expect(card!.ratings!.overall).toBeLessThanOrEqual(100);
  });

  it("rates a rich-era card (Agüero 2015) with tier=rich, hasXg=false", async () => {
    const card = await rateGamePlayer(1001412, 2015);
    expect(card).not.toBeNull();
    expect(card!.provenance?.tier).toBe("rich");
    // hasSaves is false for an outfielder in every era — the field is GK-only.
    expect(card!.provenance?.basis).toEqual({
      hasAdvanced: true,
      hasXg: false,
      hasSaves: false,
    });
    expect(card!.ratings!.attack).toBeGreaterThan(0);
  });

  it("returns null for an unknown player/season", async () => {
    expect(await rateGamePlayer(999999, 2015)).toBeNull();
  });
});

describe("loadRatedSquad (committed data)", () => {
  it("rates every card in a squad", async () => {
    const squad = await loadRatedSquad(63, 2003); // Leeds 2003
    expect(squad).not.toBeNull();
    expect(squad!.length).toBeGreaterThan(0);
    for (const c of squad!) {
      expect(c.ratings).not.toBeNull();
      expect(c.provenance).not.toBeNull();
    }
  });

  it("returns null for an unsupported season", async () => {
    expect(await loadRatedSquad(63, 1800)).toBeNull();
  });
});
