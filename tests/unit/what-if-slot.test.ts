import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SCENARIOS } from "@/features/game/domain/what-if";
import { idbGet } from "@/features/game/storage/idb";
import { loadWhatIfBests, recordWhatIf } from "@/features/game/storage/what-if-slot";

/** TASK-1816 — the best result per scenario, kept locally. Only the result, never the match. */
const tot = SCENARIOS.find((s) => s.id === "2001-tot-mun")!; // coach AWAY; history 3–5
const newcastle = SCENARIOS.find((s) => s.id === "2011-new-ars")!; // coach HOME; history 4–4

async function wipe() {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("pitchiq-game");
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

describe("the What-If slot", () => {
  beforeEach(wipe);

  it("records a first result with its verdict", async () => {
    await recordWhatIf(newcastle, { home: 4, away: 4 });
    expect(await loadWhatIfBests()).toEqual({
      "2011-new-ars": { verdict: "matched", score: { home: 4, away: 4 } },
    });
  });

  it("keeps the BETTER result — by verdict, then goal difference from the coach's side", async () => {
    await recordWhatIf(tot, { home: 3, away: 6 }); // rewrote, +3 for the away coach
    await recordWhatIf(tot, { home: 3, away: 3 }); // repeated (worse) — ignored
    await recordWhatIf(tot, { home: 2, away: 7 }); // rewrote, +5 — better
    expect((await loadWhatIfBests())["2001-tot-mun"]).toEqual({
      verdict: "rewrote",
      score: { home: 2, away: 7 },
    });
  });

  it("⛔ an existing v3 database (match/daily/season) survives the v4 upgrade", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("pitchiq-game", 3);
      req.onupgradeneeded = () => {
        for (const name of ["match", "daily", "season"]) req.result.createObjectStore(name);
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("season", "readwrite");
        tx.objectStore("season").put({ marker: "pre-upgrade" }, "current");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    await recordWhatIf(newcastle, { home: 5, away: 4 });
    expect(await idbGet("season", "current")).toEqual({ marker: "pre-upgrade" });
    expect((await loadWhatIfBests())["2011-new-ars"]?.verdict).toBe("rewrote");
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

    it("is a no-op, never a throw", async () => {
      await expect(recordWhatIf(newcastle, { home: 1, away: 4 })).resolves.toBeUndefined();
      await expect(loadWhatIfBests()).resolves.toEqual({});
    });
  });
});
