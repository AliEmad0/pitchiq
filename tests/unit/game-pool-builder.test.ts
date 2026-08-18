import { describe, expect, it } from "vitest";
import { loadChaosPool } from "@/features/game/adapter/chaos-pool";
import { buildPool, clubChoices } from "@/features/game/adapter/pool";
import { CHAOS_PACK, packFor } from "@/features/game/domain/rule-packs";
import { eraForSeason } from "@/utils/era";

// Real committed data, real clubs. ⛔ No synthetic pool: the recurring failure in this
// codebase is a fixture that cannot occur.
describe("buildPool", () => {
  it("⛔ THE CONTROL — the Chaos recipe rebuilds the SAME cards the live pool ships", async () => {
    // The assertion that proves the seam is behaviour-preserving. Without it the recipe
    // could quietly drift and only a player would notice.
    const [viaRecipe, live] = await Promise.all([buildPool(CHAOS_PACK.pool), loadChaosPool()]);
    expect(viaRecipe.map((c) => c.cardId)).toEqual(live.map((c) => c.cardId));
  }, 120_000);

  it("⚠️ Manchester United's pool holds ONLY Man Utd, across decades", async () => {
    // Asserted by NAME and by era, not by count — "returns 900 things" stays green through
    // a total change in output.
    const pool = await buildPool(packFor("legacy")!.pool, 33);
    expect(pool.length).toBeGreaterThan(0);
    expect(new Set(pool.map((c) => c.teamId))).toEqual(new Set([33]));
    const eras = new Set(pool.map((c) => eraForSeason(c.season)));
    expect(eras.has("retro90s")).toBe(true);
    expect(eras.has("modern")).toBe(true);
  }, 180_000);

  it("⛔ EVERY season a player spent at the club is its own card", async () => {
    // The owner's 2026-08-17 rule, and the thing the old per-era sampling destroyed: a
    // ten-season stalwart must have ten cards, not one. Asserted as "some player has many
    // cards, each in a distinct season" rather than a fixed name, so a data refresh that
    // moves one player cannot make it lie.
    const pool = await buildPool(packFor("legacy")!.pool, 40);
    const bySeasonCount = new Map<number, number[]>();
    for (const c of pool) {
      const seasons = bySeasonCount.get(c.playerId) ?? [];
      seasons.push(c.season);
      bySeasonCount.set(c.playerId, seasons);
    }
    const longest = [...bySeasonCount.values()].sort((a, b) => b.length - a.length)[0]!;
    expect(longest.length).toBeGreaterThanOrEqual(8);
    // ⚠️ Distinct seasons, not merely repeated rows — duplicate cards for the SAME season
    // would satisfy a naive length check while being a straightforward bug.
    expect(new Set(longest).size).toBe(longest.length);
  }, 180_000);

  it("⚠️ the per-club payload stays in the range one page can carry", async () => {
    // The club is in the URL precisely so this number stays bounded. ~939 cards is the
    // measured worst case; all 51 clubs on one page would be ~6.7 MB.
    const pool = await buildPool(packFor("legacy")!.pool, 47);
    expect(pool.length).toBeGreaterThan(400);
    expect(pool.length).toBeLessThan(1500);
  }, 180_000);
});

describe("clubChoices", () => {
  it("⚠️ lists every club that ever played in the PL, ever-presents first", async () => {
    const clubs = await clubChoices();
    // 51 clubs have appeared in the Premier League across the 34 committed seasons.
    expect(clubs.length).toBeGreaterThanOrEqual(50);
    expect(new Set(clubs.map((c) => c.id)).size).toBe(clubs.length);
    // Sorted by seasons served, so the ever-presents head the menu.
    expect(clubs[0].seasons).toBe(34);
    for (let i = 1; i < clubs.length; i++) {
      expect(clubs[i - 1].seasons).toBeGreaterThanOrEqual(clubs[i].seasons);
    }
  }, 120_000);

  it("⛔ ships labels ONLY — never cards", async () => {
    // The menu page must stay cheap. If a card-shaped field ever appears here, the chooser
    // has started carrying the payload the route split exists to avoid.
    const clubs = await clubChoices();
    for (const c of clubs.slice(0, 5)) {
      expect(Object.keys(c).sort()).toEqual(["first", "id", "last", "name", "seasons"]);
    }
  }, 120_000);

  it("⚠️ the span each sticker prints is real, and brackets the seasons served", async () => {
    // The Sticker Album prints a club's span, so a wrong `first`/`last` is visible on the
    // sheet. A one-season club must read as a single year, not a range.
    const clubs = await clubChoices();
    for (const c of clubs) {
      expect(c.first, c.name).toBeLessThanOrEqual(c.last);
      expect(c.last - c.first + 1, `${c.name} cannot serve more seasons than its span`)
        .toBeGreaterThanOrEqual(c.seasons);
    }
    const luton = clubs.find((c) => c.name.includes("Luton"))!;
    expect(luton.seasons).toBe(1);
    expect(luton.first).toBe(luton.last);
  }, 120_000);
});
