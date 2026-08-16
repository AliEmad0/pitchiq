import { describe, expect, it } from "vitest";

import {
  rankBy,
  buildBoards,
  LEADERBOARD_CATEGORIES,
  LEADERBOARD_GROUPS,
  type MetricKey,
} from "../../src/features/players/leaderboards-index";
import type { ExtendedMetrics, Player } from "../../src/data/schemas";

const mk = (id: number, over: Partial<Player["metrics"]>, name = `P${id}`): Player => ({
  id,
  name,
  teamId: 10,
  teamName: "Team",
  position: "Forward",
  photo: null,
  metrics: {
    appearances: 38,
    goals: 0,
    assists: 0,
    passAccuracy: null,
    keyPasses: null,
    tackles: null,
    interceptions: null,
    duelsWon: null,
    dribblesCompleted: null,
    shotsOnTarget: null,
    yellowCards: 0,
    redCards: 0,
    ...over,
  },
});

describe("rankBy", () => {
  const players = [
    mk(1, { goals: 10 }),
    mk(2, { goals: 20 }),
    mk(3, { goals: 0 }),
    mk(4, { goals: 20 }),
  ];

  it("ranks desc, drops null/zero, breaks value ties by id", () => {
    const rows = rankBy(players, "goals");
    expect(rows.map((r) => r.playerId)).toEqual([2, 4, 1]); // 3 dropped (0); 2 before 4 (tie → lower id)
    expect(rows[0].rank).toBe(1);
    expect(rows[0].value).toBe(20);
  });

  it("rounds decimal metrics for display", () => {
    const rows = rankBy([mk(1, { xg: 20.84 })], "xg", { decimals: 1 });
    expect(rows[0].value).toBe(20.8);
  });
});

describe("buildBoards", () => {
  it("includes core boards, omits boards with no data", () => {
    const boards = buildBoards([mk(1, { goals: 5, saves: null }), mk(2, { goals: 3 })]);
    const keys = boards.map((b) => b.cat.key);
    expect(keys).toContain("goals");
    expect(keys).toContain("appearances"); // universal
    expect(keys).not.toContain("saves"); // no data → omitted
  });

  it("includes a keeper board when the season has data", () => {
    const boards = buildBoards([mk(1, { saves: 100 }), mk(2, { saves: 80 })]);
    expect(boards.map((b) => b.cat.key)).toContain("saves");
  });

  it("restricts the Clean Sheets board to GK/DEF (M21)", () => {
    const gk = mk(1, { cleanSheets: 12 });
    gk.position = "Goalkeeper";
    const mid = mk(2, { cleanSheets: 14 }, "Mid");
    mid.position = "Midfielder";
    const boards = buildBoards([gk, mid]);
    const cs = boards.find((b) => b.cat.key === "cleanSheets");
    expect(cs).toBeDefined();
    expect(cs!.rows.map((r) => r.playerId)).toEqual([1]); // midfielder excluded
  });
});

/** A player whose row carries `metrics.extended`, as every 2008+ row does. */
const mkExt = (id: number, ext: Partial<ExtendedMetrics>, name = `E${id}`): Player => {
  const base = mk(id, {}, name);
  return { ...base, metrics: { ...base.metrics, extended: ext as ExtendedMetrics } };
};

describe("rankBy over extended metrics", () => {
  it("resolves an extended.* key from metrics.extended", () => {
    const players = [
      mkExt(1, { touches: 900 }),
      mkExt(2, { touches: 2500 }),
      mkExt(3, { touches: 1700 }),
    ];
    const rows = rankBy(players, "extended.touches");
    expect(rows.map((r) => r.playerId)).toEqual([2, 3, 1]);
    expect(rows[0].value).toBe(2500);
  });

  // ⚠️ Not NaN, not a throw — a pre-2008 row simply has no `extended` object, and the
  // board must omit the player rather than rank them at the bottom.
  it("produces NO row for a player with no metrics.extended at all", () => {
    const rows = rankBy([mk(1, {}), mkExt(2, { touches: 10 })], "extended.touches");
    expect(rows.map((r) => r.playerId)).toEqual([2]);
  });

  it("produces no row when the specific extended field is null or zero", () => {
    const rows = rankBy(
      [mkExt(1, { touches: null }), mkExt(2, { touches: 0 }), mkExt(3, { touches: 5 })],
      "extended.touches",
    );
    expect(rows.map((r) => r.playerId)).toEqual([3]);
  });

  it("still resolves a base metric key exactly as before", () => {
    expect(
      rankBy([mk(1, { goals: 3 }), mk(2, { goals: 9 })], "goals").map((r) => r.playerId),
    ).toEqual([2, 1]);
  });
});

describe("the category registry", () => {
  it("gives every category a group in the union", () => {
    for (const cat of LEADERBOARD_CATEGORIES) {
      expect(LEADERBOARD_GROUPS, cat.key).toContain(cat.group);
    }
  });

  // ⛔ A group defined but never assigned renders a heading over nothing on EVERY season.
  it("leaves no group without at least one category", () => {
    for (const group of LEADERBOARD_GROUPS) {
      expect(
        LEADERBOARD_CATEGORIES.some((c) => c.group === group),
        `group "${group}" has no categories`,
      ).toBe(true);
    }
  });

  it("keys are unique — they are also the React keys", () => {
    const keys = LEADERBOARD_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("the metric key cannot address the extended OBJECT", () => {
  it('⛔ rejects key: "extended" at compile time', () => {
    // ⚠️ Enforced by `pnpm type-check`, NOT by this suite — vitest does not type-check, so
    // a green run here proves nothing on its own. Ranking by the object would compare
    // objects with `>`, which silently yields a meaningless order instead of throwing.
    // @ts-expect-error "extended" is deliberately excluded from MetricKey
    const bad: MetricKey = "extended";
    expect(bad).toBe("extended");
  });
});
