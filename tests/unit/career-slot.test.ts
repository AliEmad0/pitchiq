import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { CareerEntry } from "@/features/game/domain/records";
import { loadCareer, logCareer } from "@/features/game/storage/career-slot";
import { DB_VERSION, idbGet } from "@/features/game/storage/idb";
import { recordFullTime } from "@/features/game/view/trophy-record";

/** TASK-1812 — the `career` store (IndexedDB v9), and the one path that writes it. */
const entry = (key: string, gf = 2, ga = 1): CareerEntry => ({
  kind: "match",
  key,
  at: 1,
  day: "2026-10-23",
  mode: "draft",
  gf,
  ga,
  context: "A 2–1 B",
});

beforeEach(() => {
  indexedDB.deleteDatabase("pitchiq-game");
});

describe("career slot", () => {
  it("⛔ an entry is logged ONCE — a second write for the key is refused, not an overwrite", async () => {
    expect(await logCareer(entry("m:/game/draft:1"))).toBe(true);
    expect(await logCareer(entry("m:/game/draft:1", 9, 0))).toBe(false);
    expect(await loadCareer()).toEqual([entry("m:/game/draft:1")]);
  });

  it("⭐ every full time is logged by recordFullTime, and only once", async () => {
    const e = {
      key: "m:/game/legacy/7:42",
      day: "2026-10-23",
      cards: [],
      facts: {
        match: { for: 3, against: 0, won: true, maxDeficit: 0, lateTieBreaker: false } as never,
      },
      context: "Your XI 3–0 Arsenal",
    };
    await recordFullTime(e);
    await recordFullTime(e);
    const log = await loadCareer();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: "match", mode: "legacy", gf: 3, ga: 0 });
  });

  it("⛔ the daily is NOT logged — its own store keeps every day", async () => {
    await recordFullTime({
      key: "d:2026-10-23",
      day: "2026-10-23",
      cards: [],
      facts: { match: { for: 1, against: 0, won: true } as never },
      context: "",
    });
    expect(await loadCareer()).toEqual([]);
  });

  it("⛔ an existing v8 database (with a badge) survives the v9 upgrade", async () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(9);
    const v8 = [
      "match",
      "daily",
      "season",
      "whatIf",
      "album",
      "trophies",
      "trophyLog",
      "weekly",
      "profile",
      "badges",
      "market",
    ];
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("pitchiq-game", 8);
      req.onupgradeneeded = () => {
        for (const name of v8) req.result.createObjectStore(name);
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("badges", "readwrite");
        tx.objectStore("badges").put({ marker: "pre-upgrade" }, "1@2020");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    await logCareer(entry("k:4:1"));
    expect(await idbGet("badges", "1@2020")).toEqual({ marker: "pre-upgrade" });
    expect(await loadCareer()).toHaveLength(1);
  });
});
