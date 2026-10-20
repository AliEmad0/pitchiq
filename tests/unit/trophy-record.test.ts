import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchFacts } from "@/features/game/domain/achievements";
import type { AlbumEntry, AlbumCard, Unlock } from "@/features/game/storage/trophy-slot";

/** An in-memory stand-in for the three stores, with the real once-only semantics. */
const mem = {
  album: new Map<string, AlbumEntry>(),
  unlocks: new Map<string, Unlock>(),
  log: new Set<string>(),
};
vi.mock("@/features/game/storage/trophy-slot", () => ({
  addCards: async (cards: AlbumCard[], day: string) => {
    for (const c of cards) {
      const k = `${c.cardId}#${c.teamId}`;
      const old = mem.album.get(k);
      mem.album.set(k, { ...c, firstDay: old?.firstDay ?? day, count: (old?.count ?? 0) + 1 });
    }
  },
  loadAlbum: async () => [...mem.album.values()],
  unlock: async (u: Unlock) => {
    if (mem.unlocks.has(u.id)) return false;
    mem.unlocks.set(u.id, u);
    return true;
  },
  loadUnlocks: async () => [...mem.unlocks.values()],
  claimLog: async (k: string) => {
    if (mem.log.has(k)) return false;
    mem.log.add(k);
    return true;
  },
}));

const { albumCards, recordFullTime } = await import("@/features/game/view/trophy-record");

/**
 * TASK-1813 / 1819 — the ONE entry point every full-time path calls: it adds the coach's cards
 * to the album and unlocks what the match (or run) earned, exactly once per record key.
 */
const card = (i: number, teamId = 42): AlbumCard => ({
  cardId: `${100 + i}@2003`,
  teamId,
  name: `P${i}`,
  role: "CM",
  season: 2003,
  ovr: 70,
});
const win50: MatchFacts = {
  won: true,
  for: 5,
  against: 0,
  maxDeficit: 0,
  lateTieBreaker: false,
  coachRed: false,
  hatTricks: [],
};
const entry = (key: string, cards: AlbumCard[], match?: MatchFacts) => ({
  key,
  day: "2026-10-21",
  cards,
  facts: match == null ? {} : { match },
  context: "Arsenal 5–0 Spurs",
});
const setOf = (n: number) => ({
  season: 2003,
  clubs: [
    {
      teamId: 42,
      name: "Arsenal",
      cards: Array.from({ length: n }, (_, i) => ({
        id: `${100 + i}@2003`,
        n: `P${i}`,
        r: "CM",
        o: 70,
      })),
    },
  ],
});

describe("recordFullTime", () => {
  beforeEach(() => {
    mem.album.clear();
    mem.unlocks.clear();
    mem.log.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => setOf(20) })),
    );
  });

  it("a 5–0 unlocks first win, clean sheet and thrashing — once", async () => {
    const got = await recordFullTime(entry("m:chaos:1", [card(1)], win50));
    expect(got).toEqual(["first-win", "clean-sheet", "thrashing"]);
    expect(await recordFullTime(entry("m:chaos:2", [card(1)], win50))).toEqual([]);
    expect(mem.unlocks.get("thrashing")!.context).toBe("Arsenal 5–0 Spurs");
  });

  it("⛔ the same record key twice is recorded once (StrictMode double effects)", async () => {
    await recordFullTime(entry("m:chaos:7", [card(1), card(2)], win50));
    expect(await recordFullTime(entry("m:chaos:7", [card(1), card(2)], win50))).toEqual([]);
    expect([...mem.album.values()].map((e) => e.count)).toEqual([1, 1]);
  });

  it("a simmed fixture adds cards but unlocks no match badge", async () => {
    expect(await recordFullTime(entry("s:1:3", [card(1)]))).toEqual([]);
    expect(mem.album.size).toBe(1);
  });

  it("completing a club-season set unlocks Full Set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => setOf(3) })),
    );
    await recordFullTime(entry("c:a:1", [card(0), card(1)]));
    expect(mem.unlocks.has("set-complete")).toBe(false);
    const got = await recordFullTime(entry("c:a:2", [card(2)]));
    expect(got).toContain("set-complete");
    expect(mem.unlocks.get("set-complete")!.context).toBe("Arsenal 2003/04");
  });

  it("a card fielded for ANOTHER club does not fill this club's set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => setOf(2) })),
    );
    await recordFullTime(entry("c:a:1", [card(0), card(1, 47)]));
    expect(mem.unlocks.has("set-complete")).toBe(false);
  });

  it("a failed set fetch never throws and unlocks no Full Set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    await expect(recordFullTime(entry("m:x:1", [card(1)], win50))).resolves.toEqual([
      "first-win",
      "clean-sheet",
      "thrashing",
    ]);
  });

  it("100 cards in the album unlocks Collector", async () => {
    const cards = Array.from({ length: 100 }, (_, i) => card(i, 1000 + i));
    expect(await recordFullTime(entry("d:2026-10-21", cards))).toContain("collector-100");
  });
});

describe("albumCards", () => {
  it("reads the card's own club, or the club the squad belongs to", () => {
    const players = [
      {
        cardId: "1@2003",
        name: "A",
        role: "CF",
        season: 2003,
        ratings: { overall: 90 },
        teamId: 42,
      },
      { cardId: "2@2003", name: "B", role: null, season: 2003, ratings: null },
    ] as never;
    expect(albumCards(players, 7)).toEqual([
      { cardId: "1@2003", teamId: 42, name: "A", role: "CF", season: 2003, ovr: 90 },
      { cardId: "2@2003", teamId: 7, name: "B", role: "", season: 2003, ovr: 0 },
    ]);
  });
});
