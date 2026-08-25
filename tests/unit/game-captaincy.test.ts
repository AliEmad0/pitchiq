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
    expect(rankCaptains([], new Map())).toEqual({ captain: null, vice: null, order: [] });
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

  it("returns null once both have left, when there is nobody else ranked", () => {
    expect(armbandAt({ captain: 1, vice: 2 }, new Set([1, 2]))).toBeNull();
  });

  /**
   * ⛔ Owner-visible regression (TASK-1838): with only a captain and a vice there is no
   * THIRD in line, so an XI that substituted both leaders showed "no recorded captain"
   * for the rest of the match — with nine men still on the pitch, one of whom the same
   * rule would have picked.
   */
  it("passes the armband on down the ranking when both leaders have left", () => {
    const squad = [
      { playerId: 1, rating: 90 },
      { playerId: 2, rating: 80 },
      { playerId: 3, rating: 70 },
      { playerId: 4, rating: 60 },
    ];
    const ranked = rankCaptains(squad, new Map());
    expect(armbandAt(ranked, new Set([1, 2]))).toBe(3);
    expect(armbandAt(ranked, new Set([1, 2, 3]))).toBe(4);
    // Nobody left on the pitch at all is still the honest null.
    expect(armbandAt(ranked, new Set([1, 2, 3, 4]))).toBeNull();
  });

  it("honours a real captaincy count over rating all the way down the order", () => {
    const squad = [
      { playerId: 1, rating: 90 },
      { playerId: 2, rating: 80 },
      { playerId: 3, rating: 70 },
    ];
    // Player 3 has the recorded armband, so he outranks both better-rated cards.
    const ranked = rankCaptains(squad, new Map([[3, 4]]));
    expect(armbandAt(ranked, new Set([3]))).toBe(1);
    expect(armbandAt(ranked, new Set([3, 1]))).toBe(2);
  });

  it("returns null for an XI with no recorded captain at all", () => {
    expect(armbandAt({ captain: null, vice: null }, new Set())).toBeNull();
  });
});

/**
 * TASK-1810 — the mode's icon leads his own XI (owner, 2026-08-25).
 *
 * Captain's Draft is built ON its icon: the mode is named for him and he is placed before
 * a card is drafted. Ranking him like anyone else meant he only wore the armband if he
 * would have won it on real captaincy counts anyway.
 */
describe("a forced captain", () => {
  const squad = [
    { playerId: 1, rating: 95 },
    { playerId: 2, rating: 90 },
    { playerId: 3, rating: 60 },
  ];

  it("wears it over a better-rated man and over a real captain", () => {
    // Player 1 is the best card AND player 2 has a real captaincy — the icon still leads.
    const ranked = rankCaptains(squad, new Map([[2, 5]]), 3);
    expect(ranked.captain).toBe(3);
    expect(armbandAt(ranked, new Set())).toBe(3);
  });

  /**
   * ⚠️ He is moved to the FRONT of the order, not given a fake count — inventing
   * captaincies would corrupt the honest data the rest of the rule reads. So the men
   * behind him keep their real ranking, and the handover still works.
   */
  it("⚠️ leaves the order behind him intact, so the armband still passes on", () => {
    const ranked = rankCaptains(squad, new Map([[2, 5]]), 3);
    expect(ranked.order).toEqual([3, 2, 1]);
    // Substitute the icon and it goes to the real captain, not to the best card.
    expect(armbandAt(ranked, new Set([3]))).toBe(2);
  });

  it("⚠️ THE CONTROL — no forced captain means the shipped ranking, untouched", () => {
    const ranked = rankCaptains(squad, new Map([[2, 5]]));
    expect(ranked.captain).toBe(2);
    expect(ranked.order).toEqual([2, 1, 3]);
  });

  it("⚠️ ignores a forced player who is not in this XI", () => {
    // The away sheet must never inherit the coach's icon.
    const ranked = rankCaptains(squad, new Map(), 999);
    expect(ranked.captain).toBe(1);
  });
});
