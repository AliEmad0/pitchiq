import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { CRAFT_COST, craftable, craftedMap, duplicates } from "@/features/game/domain/crafting";
import type { MatchState } from "@/features/game/domain/match-types";
import { makeGameTeam } from "@/features/game/domain/team";
import { personalityModifier, traitsWith } from "@/features/game/domain/traits";
import { craftBadge, loadBadges } from "@/features/game/storage/badge-slot";
import { DB_VERSION, idbGet, idbPut } from "@/features/game/storage/idb";
import { addCards, loadAlbum } from "@/features/game/storage/trophy-slot";

/** TASK-1829 — spend duplicates to mint trait badges, atomically, and play them for the coach only. */
const henry = {
  cardId: "1@2003",
  teamId: 1,
  name: "Thierry Henry",
  role: "CF",
  season: 2003,
  ovr: 95,
};

beforeEach(() => {
  indexedDB.deleteDatabase("pitchiq-game");
});

describe("crafting rules", () => {
  it("a duplicate is every collection after the first; a keeper can only become a Rock", () => {
    expect(duplicates(1)).toBe(0);
    expect(duplicates(4)).toBe(3);
    expect(craftable({ role: "GK" })).toEqual(["rock"]);
    expect(craftable({ role: "CF" })).toHaveLength(4);
  });

  it("a crafted trait joins the data-derived ones, never doubled", () => {
    const p = { cardId: "9@2020", role: "CF" as const, ratings: null };
    expect(traitsWith(p, new Map([["9@2020", "engine"]]))).toEqual(["engine"]);
    expect(traitsWith(p)).toEqual([]);
  });
});

describe("crafting in storage", () => {
  it("⛔ spends exactly the cost, keeps the sticker, and mints one badge", async () => {
    for (let i = 0; i < 4; i++) await addCards([henry], "2026-10-21");
    expect(await craftBadge(henry, "talisman", "t")).toBe(true);
    const [entry] = await loadAlbum();
    expect(entry!.count).toBe(4 - CRAFT_COST);
    expect(await loadBadges()).toEqual([{ cardId: "1@2003", trait: "talisman", craftedAt: "t" }]);
  });

  it("⛔ refuses with too few duplicates, or a second badge — and writes NOTHING", async () => {
    for (let i = 0; i < 3; i++) await addCards([henry], "2026-10-21");
    expect(await craftBadge(henry, "engine", "t")).toBe(false);
    expect((await loadAlbum())[0]!.count).toBe(3);
    expect(await loadBadges()).toEqual([]);

    for (let i = 0; i < 5; i++) await addCards([henry], "2026-10-21"); // count 8
    expect(await craftBadge(henry, "engine", "t")).toBe(true);
    expect(await craftBadge(henry, "rock", "t")).toBe(false);
    expect((await loadAlbum())[0]!.count).toBe(8 - CRAFT_COST); // the refused craft spent nothing
  });

  it("two crafts racing on the same card — exactly one wins", async () => {
    for (let i = 0; i < 10; i++) await addCards([henry], "2026-10-21");
    const r = await Promise.all([craftBadge(henry, "engine", "a"), craftBadge(henry, "rock", "b")]);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect((await loadAlbum())[0]!.count).toBe(10 - CRAFT_COST);
  });

  it("⛔ an existing v7 database (with a coach profile) survives the v8 upgrade", async () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(8);
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("pitchiq-game", 7);
      req.onupgradeneeded = () => {
        for (const name of [
          "match",
          "daily",
          "season",
          "whatIf",
          "album",
          "trophies",
          "trophyLog",
          "weekly",
          "profile",
        ])
          req.result.createObjectStore(name);
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("profile", "readwrite");
        tx.objectStore("profile").put({ marker: "pre-upgrade" }, "me");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    await idbPut("badges", "x", { ok: true });
    expect(await idbGet("profile", "me")).toEqual({ marker: "pre-upgrade" });
  });
});

describe("a badge plays for the coach only", () => {
  const card = (id: number) =>
    ({ playerId: id, cardId: `${id}@2020`, role: "CF", ratings: null }) as never;
  const state = {
    minute: 80,
    events: [],
    home: { score: 0, unavailable: new Set(), broughtOn: new Set() },
    away: { score: 1, unavailable: new Set(), broughtOn: new Set() },
  } as unknown as MatchState;

  it("⛔ a rival fielding the SAME card never inherits the coach's badge", () => {
    const shape = { name: "x", season: 0, slots: [] };
    const both = [card(7)];
    const crafted = craftedMap([{ cardId: "7@2020", trait: "talisman", craftedAt: "t" }]);
    const mod = personalityModifier(
      makeGameTeam(1, "Me", 0, shape, both),
      makeGameTeam(2, "Them", 0, shape, both),
      { side: "home", traits: crafted },
    );
    // Home trails after 70' with a crafted Talisman: lifted. Away has the same card, no badge.
    expect(mod({ state, side: "home" }).attack).toBeGreaterThan(0);
    const away = { ...state, home: state.away, away: state.home } as MatchState;
    expect(mod({ state: away, side: "away" }).attack ?? 0).toBe(0);
  });
});
