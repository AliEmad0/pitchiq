import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  allDaily,
  loadDaily,
  markStarted,
  saveDaily,
  wasStarted,
  type DailyRecord,
} from "@/features/game/storage/daily-slot";
import { idbGetAll, idbPut } from "@/features/game/storage/idb";

const record = (day: string): DailyRecord => ({
  day,
  cardIds: ["1@2025"],
  answers: [],
  fingerprint: 123,
  eventCount: 4,
  done: false,
});

describe("idbGetAll", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("pitchiq-game");
  });

  it("returns every value in a store", async () => {
    await idbPut("daily", "2026-08-16", { day: "2026-08-16" });
    await idbPut("daily", "2026-08-17", { day: "2026-08-17" });
    const all = await idbGetAll<{ day: string }>("daily");
    expect(all.map((r) => r.day).sort()).toEqual(["2026-08-16", "2026-08-17"]);
  });

  it("is empty-safe", async () => {
    expect(await idbGetAll("daily")).toEqual([]);
  });

  it("⚠️ a REAL v1 → v2 upgrade adds the store and keeps existing matches", async () => {
    // ⛔ Opening through the app's own helpers would create the database at v2 outright
    // and never exercise an upgrade at all — the test would pass while proving nothing.
    // So build a genuine v1 database, holding only the `match` store, by hand first.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("pitchiq-game", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("match");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        expect([...db.objectStoreNames]).toEqual(["match"]);
        const tx = db.transaction("match", "readwrite");
        tx.objectStore("match").put({ seed: 7 }, "current");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => reject(tx.error);
      };
    });

    // Now go through the app, which opens at v2 and must upgrade in place.
    await idbPut("daily", "2026-08-17", { day: "2026-08-17" });

    expect(await idbGetAll<{ seed: number }>("match")).toEqual([{ seed: 7 }]);
    expect(await idbGetAll<{ day: string }>("daily")).toEqual([{ day: "2026-08-17" }]);
  });
});

describe("daily record", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("pitchiq-game");
    sessionStorage.clear();
  });

  it("round-trips by day", async () => {
    await saveDaily(record("2026-08-17"));
    expect((await loadDaily("2026-08-17"))?.day).toBe("2026-08-17");
  });

  it("keeps days separate and lists them all", async () => {
    await saveDaily(record("2026-08-16"));
    await saveDaily(record("2026-08-17"));
    expect((await allDaily()).length).toBe(2);
    expect(await loadDaily("2026-08-15")).toBeNull();
  });

  it("overwrites the same day rather than appending", async () => {
    await saveDaily(record("2026-08-17"));
    await saveDaily({ ...record("2026-08-17"), done: true, score: { home: 2, away: 0 } });
    const all = await allDaily();
    expect(all).toHaveLength(1);
    expect(all[0]!.done).toBe(true);
  });
});

describe("session lock", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("marks and reads a day", () => {
    markStarted("2026-08-17");
    expect(wasStarted("2026-08-17")).toBe(true);
  });

  it("⚠️ yesterday's marker does NOT lock today", () => {
    markStarted("2026-08-16");
    expect(wasStarted("2026-08-17")).toBe(false);
  });

  it("reports false when nothing was marked", () => {
    expect(wasStarted("2026-08-17")).toBe(false);
  });
});
