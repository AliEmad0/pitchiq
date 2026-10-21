import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DB_VERSION, idbGet } from "@/features/game/storage/idb";
import {
  addCards,
  claimLog,
  loadAlbum,
  loadUnlocks,
  unlock,
} from "@/features/game/storage/trophy-slot";

/**
 * TASK-1813 / 1819 — the album, the unlocked achievements and the record log. Best-effort like
 * every game store: nothing here may throw into a full-time screen.
 */
async function wipe() {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("pitchiq-game");
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
const henry = {
  cardId: "1000457@2003",
  teamId: 42,
  name: "Thierry Henry",
  role: "CF",
  season: 2003,
  ovr: 95,
};

describe("the trophy slots", () => {
  beforeEach(wipe);

  it("counts a card every time it plays, and keeps the day it was first collected", async () => {
    await addCards([henry], "2026-10-21");
    await addCards([henry], "2026-10-22");
    expect(await loadAlbum()).toEqual([{ ...henry, firstDay: "2026-10-21", count: 2 }]);
  });

  it("⛔ concurrent adds of the same card all count (bulk sim fires them without awaiting)", async () => {
    await Promise.all(Array.from({ length: 10 }, () => addCards([henry], "2026-10-21")));
    expect((await loadAlbum())[0]!.count).toBe(10);
  });

  it("the same card for two clubs is two stickers", async () => {
    await addCards([henry, { ...henry, teamId: 47 }], "2026-10-21");
    const album = await loadAlbum();
    expect(album).toHaveLength(2);
    expect(album.map((e) => e.teamId).sort()).toEqual([42, 47]);
  });

  it("an achievement unlocks once", async () => {
    const u = { id: "first-win" as const, day: "2026-10-21", context: "Arsenal 2–0 Spurs" };
    expect(await unlock(u)).toBe(true);
    expect(await unlock({ ...u, day: "2026-10-22" })).toBe(false);
    expect(await loadUnlocks()).toEqual([u]);
  });

  it("a log key is claimed exactly once", async () => {
    expect(await claimLog("m:chaos:42")).toBe(true);
    expect(await claimLog("m:chaos:42")).toBe(false);
    expect(await claimLog("m:chaos:43")).toBe(true);
  });

  it("⛔ two claims of one key in the same tick — exactly one wins (StrictMode double effects)", async () => {
    const results = await Promise.all([claimLog("d:2026-10-21"), claimLog("d:2026-10-21")]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("⛔ an existing v4 database (with a What-If best) survives the v5+ upgrade", async () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(5);
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("pitchiq-game", 4);
      req.onupgradeneeded = () => {
        for (const name of ["match", "daily", "season", "whatIf"])
          req.result.createObjectStore(name);
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("whatIf", "readwrite");
        tx.objectStore("whatIf").put({ id: "x", marker: "pre-upgrade" }, "x");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    await addCards([henry], "2026-10-21");
    expect(await idbGet("whatIf", "x")).toEqual({ id: "x", marker: "pre-upgrade" });
    expect(await loadAlbum()).toHaveLength(1);
  });

  describe("without IndexedDB", () => {
    const saved = globalThis.indexedDB;
    beforeEach(() => {
      // @ts-expect-error — simulate private browsing / a browser with no IndexedDB.
      delete globalThis.indexedDB;
    });
    afterEach(() => {
      globalThis.indexedDB = saved;
    });

    it("every call resolves, none throws", async () => {
      await expect(addCards([henry], "2026-10-21")).resolves.toBeUndefined();
      await expect(loadAlbum()).resolves.toEqual([]);
      await expect(unlock({ id: "first-win", day: "d", context: "" })).resolves.toBe(false);
      await expect(loadUnlocks()).resolves.toEqual([]);
      await expect(claimLog("k")).resolves.toBe(false);
    });
  });
});
