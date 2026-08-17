import { describe, expect, it, vi } from "vitest";
import { CHAOS_PACK, LEGACY_CLUBS, packFor } from "@/features/game/domain/rule-packs";
import { eraForSeason } from "@/utils/era";

/**
 * ⚠️ `resolvePhotos` pixel-probes every card's photo over the network to tell a transparent
 * cutout from a background shot. That is correct at build time and impossible here — this
 * environment cannot reach `resources.premierleague.com`, the same limit that stops
 * `next build` from fetching Google Fonts.
 *
 * Mocked rather than designed around: card identity comes from the RECIPE, not from pixels,
 * so every assertion below is unaffected. CI's Build check is what exercises the real probe.
 */
vi.mock("@/features/game/adapter/photo-kind", () => ({
  resolvePhotos: (urls: Array<string | undefined>) =>
    Promise.resolve(urls.map((url) => ({ kind: "photo" as const, url }))),
}));

const { buildPool } = await import("@/features/game/adapter/pool");
const { loadChaosPool } = await import("@/features/game/adapter/chaos-pool");

/**
 * Built ONCE and shared. Assembling Legacy walks 10 clubs × 34 seasons of committed JSON
 * and takes ~28s; three independent builds put this file near 90s on its own, which is real
 * CI time for zero extra coverage — the assertions differ, the pool does not.
 */
const legacyPool = buildPool(packFor("legacy")!.pool);

// Real committed data, real clubs. ⛔ No synthetic pool: the recurring failure in this
// codebase is a fixture that cannot occur.
describe("buildPool", () => {
  it("⛔ THE CONTROL — the Chaos recipe rebuilds the SAME cards the live pool ships", async () => {
    // This is the assertion that proves the seam is behaviour-preserving. Without it the
    // recipe could quietly drift and only a player would notice.
    const [viaRecipe, live] = await Promise.all([buildPool(CHAOS_PACK.pool), loadChaosPool()]);
    expect(viaRecipe.map((c) => c.cardId)).toEqual(live.map((c) => c.cardId));
  }, 180_000);

  it("⚠️ Legacy: Manchester United's pool holds ONLY Man Utd, across decades", async () => {
    // Asserted by NAME and by era, not by count — "returns 30 things" stays green through
    // a total change in output.
    const pool = await legacyPool;
    const utd = pool.filter((c) => c.teamId === 33);
    expect(utd.length).toBeGreaterThan(0);
    expect(new Set(utd.map((c) => c.teamId))).toEqual(new Set([33]));
    const eras = new Set(utd.map((c) => eraForSeason(c.season)));
    expect(eras.has("retro90s")).toBe(true);
    expect(eras.has("modern")).toBe(true);
  }, 180_000);

  it("⚠️ every one of the ten clubs contributes, and spans at least two eras", async () => {
    // A club whose data thins out (Man City has only 4 retro seasons) must fail loudly
    // rather than silently shipping a one-era pool.
    const pool = await legacyPool;
    for (const id of LEGACY_CLUBS) {
      const cards = pool.filter((c) => c.teamId === id);
      expect(cards.length, `club ${id} contributed nothing`).toBeGreaterThan(0);
      const eras = new Set(cards.map((c) => eraForSeason(c.season)));
      expect(eras.size, `club ${id} spans only ${[...eras]}`).toBeGreaterThanOrEqual(2);
    }
  }, 300_000);

  it("keeps the payload in the proven range", async () => {
    // Chaos ships 252 cards on a force-static route. Legacy must stay the same order.
    const pool = await legacyPool;
    expect(pool.length).toBeLessThan(450);
  }, 300_000);
});
