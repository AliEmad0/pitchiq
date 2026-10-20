import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveDaily } from "@/features/game/storage/daily-slot";
import { claimLog, loadAlbum, loadUnlocks } from "@/features/game/storage/trophy-slot";
import { idbPut } from "@/features/game/storage/idb";
import { backfillTrophies } from "@/features/game/view/trophy-backfill";

/**
 * TASK-1813/1819 — the first open of the Trophy Room fills in what a coach already did before it
 * shipped: the daily XIs and saved seasons go into the album, and what those saves prove
 * (streaks, rewrites) unlocks. ⛔ Each item is claimed under the SAME key full time uses, so a
 * match already recorded at full time is never counted twice.
 */
async function wipe() {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("pitchiq-game");
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
const ids = (base: number) => Array.from({ length: 11 }, (_, i) => `${base + i}@2003`);
const set2003 = {
  season: 2003,
  clubs: [
    {
      teamId: 42,
      name: "Arsenal",
      cards: Array.from({ length: 30 }, (_, i) => ({
        id: `${100 + i}@2003`,
        n: `P${i}`,
        r: "CM",
        o: 80 - i,
      })),
    },
  ],
};
const daily = (day: string, cardIds: string[]) =>
  saveDaily({
    day,
    cardIds: cardIds as never,
    answers: [],
    fingerprint: 1,
    eventCount: 1,
    done: true,
    score: { home: 1, away: 0 }, // a WON day — the app's streak counts wins
  });

describe("backfillTrophies", () => {
  beforeEach(async () => {
    await wipe();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).endsWith("/api/game/album/2003")
          ? { ok: true, json: async () => set2003 }
          : { ok: false, json: async () => ({}) },
      ),
    );
  });

  it("finished dailies go into the album, with their club and name from the set lists", async () => {
    await daily("2026-10-01", ids(100));
    await backfillTrophies("2026-10-21");
    const album = await loadAlbum();
    expect(album).toHaveLength(11);
    expect(album.find((e) => e.cardId === "100@2003")).toMatchObject({
      teamId: 42,
      name: "P0",
      ovr: 80,
    });
  });

  it("⛔ a daily already recorded at full time is not counted again", async () => {
    await daily("2026-10-01", ids(100));
    await claimLog("d:2026-10-01"); // full time got there first
    await backfillTrophies("2026-10-21");
    expect(await loadAlbum()).toEqual([]);
  });

  it("running it twice changes nothing", async () => {
    await daily("2026-10-01", ids(100));
    await backfillTrophies("2026-10-21");
    await backfillTrophies("2026-10-21");
    expect((await loadAlbum()).every((e) => e.count === 1)).toBe(true);
  });

  it("seven consecutive WON dailies unlock Seven Days; a What-If rewrite unlocks History Rewritten", async () => {
    for (let d = 1; d <= 7; d++) await daily(`2026-10-0${d}`, ids(100));
    await idbPut("whatIf", "2011-new-ars", {
      id: "2011-new-ars",
      verdict: "rewrote",
      score: { home: 5, away: 4 },
    });
    await backfillTrophies("2026-10-07");
    const got = (await loadUnlocks()).map((u) => u.id).sort();
    expect(got).toEqual(expect.arrayContaining(["daily-7", "rewrite"]));
    expect(got).not.toContain("first-win"); // match badges need events, which saves do not keep
  });

  it("never throws, even with the set lists unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    await daily("2026-10-01", ids(100));
    await expect(backfillTrophies("2026-10-21")).resolves.toBeUndefined();
  });
});
