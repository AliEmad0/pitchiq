import { describe, expect, it } from "vitest";
import { captaincyCounts } from "@/features/game/adapter/pool";
import { rankCaptains } from "@/features/game/domain/captaincy";

/**
 * TASK-1810 — the captaincy rule against the REAL committed data.
 *
 * ⭐ Asserts a known fact about a NAMED player, which is the standing audit rule here: an
 * aggregate ("164 captains exist") stays green through a join that silently matches
 * nobody, but "Steven Gerrard has exactly 4" does not.
 *
 * Steven Gerrard = 1003033, Virgil van Dijk = 1001545, Hugo Lloris = 1000591.
 */
const GERRARD = 1003033;
const VAN_DIJK = 1001545;
const LLORIS = 1000591;

describe("captaincyCounts, over data/captains.json", () => {
  it("reproduces the owner's measured example — Gerrard 4, van Dijk 3", async () => {
    const counts = await captaincyCounts([GERRARD, VAN_DIJK]);
    expect(counts[GERRARD]).toBe(4);
    expect(counts[VAN_DIJK]).toBe(3);
  });

  it("ranks Gerrard captain and van Dijk vice, despite van Dijk being the better card", async () => {
    const counts = new Map(
      Object.entries(await captaincyCounts([GERRARD, VAN_DIJK])).map(([k, v]) => [Number(k), v]),
    );
    const ranked = rankCaptains(
      [
        { playerId: GERRARD, rating: 88 },
        { playerId: VAN_DIJK, rating: 91 },
      ],
      counts,
    );
    expect(ranked).toEqual({
      captain: GERRARD,
      vice: VAN_DIJK,
      order: [GERRARD, VAN_DIJK],
    });
  });

  it("⚠️ NARROWS to the ids it is asked about", async () => {
    // The whole point of the narrowing: the page must not ship the full map.
    const counts = await captaincyCounts([GERRARD]);
    expect(Object.keys(counts)).toEqual([String(GERRARD)]);
  });

  it("returns nothing for players with no record — the COMMON case, not an edge", async () => {
    // 20 thinly-covered seasons and 164 distinct captains across 34 seasons of football.
    const counts = await captaincyCounts([-1, -2]);
    expect(counts).toEqual({});
  });

  it("pins the ceiling, so a counting change cannot pass unnoticed", async () => {
    const counts = await captaincyCounts([LLORIS]);
    expect(counts[LLORIS]).toBe(9); // the all-time maximum in the committed file
  });
});
