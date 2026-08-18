import { describe, expect, it } from "vitest";
import { armbandAt, rankCaptains } from "@/features/game/domain/captaincy";

/**
 * The owner's measured example, with the REAL ids from `data/captains.json`:
 * Steven Gerrard 4 → armband, Virgil van Dijk 3 → vice.
 *
 * ⚠️ Verified against the committed file, not assumed — counting it also showed the
 * all-time maximum is Hugo Lloris on 9, across 20 thinly-covered seasons and 164 distinct
 * captains. `tests/unit/game-captaincy-data.test.ts` pins those numbers to the data.
 */
const GERRARD = 1003033;
const VAN_DIJK = 1001545;
const counts = new Map([
  [GERRARD, 4],
  [VAN_DIJK, 3],
]);

const squad = [
  { playerId: GERRARD, rating: 88 },
  { playerId: VAN_DIJK, rating: 91 },
  { playerId: 999, rating: 95 },
];

describe("rankCaptains", () => {
  it("gives the armband to the most-capped captain, not the best player", () => {
    const r = rankCaptains(squad, counts);
    expect(r.captain).toBe(GERRARD); // 4 caps, rated 88
    expect(r.vice).toBe(VAN_DIJK); // 3 caps, rated 91
    // ⛔ The 95-rated player is neither. Captaincies outrank rating outright.
    expect(r.captain).not.toBe(999);
  });

  it("falls back to rating when nobody in the XI has a record", () => {
    // `captains.json` covers 20 seasons thinly, so this is the COMMON path for Legacy.
    const r = rankCaptains(squad, new Map());
    expect(r.captain).toBe(999);
    expect(r.vice).toBe(VAN_DIJK);
  });

  it("breaks a tie on captaincies by rating", () => {
    const tied = new Map([
      [GERRARD, 2],
      [VAN_DIJK, 2],
    ]);
    expect(rankCaptains(squad, tied).captain).toBe(VAN_DIJK); // 91 beats 88
  });

  it("is stable when both captaincies and ratings tie", () => {
    // A total order matters: the armband must not wander between renders of one XI.
    const flat = [
      { playerId: 20, rating: 70 },
      { playerId: 10, rating: 70 },
    ];
    expect(rankCaptains(flat, new Map()).captain).toBe(10);
    expect(rankCaptains([...flat].reverse(), new Map()).captain).toBe(10);
  });

  it("has no vice in a one-man squad, and no captain in an empty one", () => {
    expect(rankCaptains([{ playerId: 7, rating: 70 }], new Map()).vice).toBeNull();
    expect(rankCaptains([], new Map())).toEqual({ captain: null, vice: null });
  });
});

describe("armbandAt", () => {
  it("keeps the captain while he is on the pitch", () => {
    expect(armbandAt({ captain: 1, vice: 2 }, new Set())).toBe(1);
  });

  it("hands it to the vice when the captain is sent off or substituted", () => {
    expect(armbandAt({ captain: 1, vice: 2 }, new Set([1]))).toBe(2);
  });

  it("keeps the captain when it is the VICE who left", () => {
    expect(armbandAt({ captain: 1, vice: 2 }, new Set([2]))).toBe(1);
  });

  it("returns null once both have left", () => {
    expect(armbandAt({ captain: 1, vice: 2 }, new Set([1, 2]))).toBeNull();
  });

  it("returns null for an XI with no recorded captain at all", () => {
    expect(armbandAt({ captain: null, vice: null }, new Set())).toBeNull();
  });
});
