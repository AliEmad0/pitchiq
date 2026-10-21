import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DB_VERSION, idbGet, idbPut } from "@/features/game/storage/idb";
import { allWeekly, loadWeekly, saveWeekly } from "@/features/game/storage/weekly-slot";
import { newLadderRun } from "@/features/game/view/weekly-run";

/** TASK-1828 — the `weekly` store (IndexedDB v6), and that nothing older is lost to it. */
const record = (week: string) => ({
  week,
  cardIds: ["1@2020"] as never,
  rivalIds: [1, 2, 3, 4, 5, 6, 7],
  run: newLadderRun(42),
});

beforeEach(() => {
  indexedDB.deleteDatabase("pitchiq-game");
});

describe("weekly slot", () => {
  it("round-trips a week, keyed by the week", async () => {
    await saveWeekly(record("2026-W43"));
    expect(await loadWeekly("2026-W43")).toEqual(record("2026-W43"));
    expect(await loadWeekly("2026-W44")).toBeNull();
    expect((await allWeekly()).map((r) => r.week)).toEqual(["2026-W43"]);
  });

  it("⛔ a stored value that is not a ladder is treated as absent (storage is untrusted)", async () => {
    await idbPut("weekly", "2026-W43", { week: "2026-W43", run: { clubs: 20 } });
    expect(await loadWeekly("2026-W43")).toBeNull();
    expect(await allWeekly()).toEqual([]);
  });

  it("⛔ an existing v5 database (with an album card) survives the v6 upgrade", async () => {
    expect(DB_VERSION).toBe(6);
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("pitchiq-game", 5);
      req.onupgradeneeded = () => {
        for (const name of ["match", "daily", "season", "whatIf", "album", "trophies", "trophyLog"])
          req.result.createObjectStore(name);
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("album", "readwrite");
        tx.objectStore("album").put({ marker: "pre-upgrade" }, "1@2020#1");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    await saveWeekly(record("2026-W43"));
    expect(await idbGet("album", "1@2020#1")).toEqual({ marker: "pre-upgrade" });
    expect(await loadWeekly("2026-W43")).not.toBeNull();
  });
});
