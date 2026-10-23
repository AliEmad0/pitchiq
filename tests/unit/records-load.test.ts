import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { saveDaily } from "@/features/game/storage/daily-slot";
import { idbPut } from "@/features/game/storage/idb";
import { offerMarketBest } from "@/features/game/storage/market-slot";
import { loadRecords } from "@/features/game/view/records-load";

/**
 * TASK-1812 — a coach who played BEFORE the career log existed opens Records for the first
 * time: what his saves still hold must already be there, and opening it twice counts nothing
 * twice.
 */
beforeEach(() => {
  indexedDB.deleteDatabase("pitchiq-game");
});

const NOW = new Date("2026-10-23T12:00:00Z");

async function seedSaves() {
  // A four-club season in progress: the coach (club 0) won 3–0, drew 1–1.
  await idbPut("season", "current", {
    seed: 77,
    clubs: 4,
    coach: 0,
    results: [
      { week: 0, home: 0, away: 1, homeGoals: 3, awayGoals: 0, seed: 1 },
      { week: 0, home: 2, away: 3, homeGoals: 1, awayGoals: 0, seed: 2 },
      { week: 1, home: 2, away: 0, homeGoals: 1, awayGoals: 1, seed: 3 },
    ],
    cardIds: [],
    formationKey: "4-4-2 Flat/11",
  });
  await saveDaily({
    day: "2026-10-22",
    cardIds: [] as never,
    answers: [],
    fingerprint: 1,
    eventCount: 1,
    done: true,
    score: { home: 2, away: 1 },
  });
  await offerMarketBest({ wins: 5, rounds: 7, endedAt: "2026-10-21" } as never);
}

describe("loadRecords", () => {
  it("⭐ a first open already shows what the saves hold — the season's matches and the daily", async () => {
    await seedSaves();
    const r = await loadRecords(NOW);
    // Two season matches (only the coach's) plus one daily.
    expect(r.totals).toMatchObject({ played: 3, won: 2, drawn: 1, lost: 0 });
    expect(r.biggestWin).toMatchObject({ gf: 3, ga: 0, mode: "season" });
    expect(r.marketBest).toEqual({ wins: 5, rounds: 7 });
    expect(r.empty).toBe(false);
  });

  it("⛔ opening it twice counts nothing twice", async () => {
    await seedSaves();
    await loadRecords(NOW);
    const again = await loadRecords(NOW);
    expect(again.totals.played).toBe(3);
  });

  it("a coach with nothing saved sees the empty state", async () => {
    const r = await loadRecords(NOW);
    expect(r.empty).toBe(true);
    expect(r.totals.played).toBe(0);
  });
});
