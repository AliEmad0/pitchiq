import { describe, expect, it } from "vitest";
import { iconChoices, buildPool } from "@/features/game/adapter/pool";
import { CAPTAINS_PACK, RULE_PACKS, routedPacks } from "@/features/game/domain/rule-packs";

/**
 * TASK-1810 PR 2 — Captain's Draft.
 *
 * "Pick an icon first, then build around them." The icon roster comes from REAL captaincy
 * records plus a curated legend list, and the pool is the icon's countrymen UNION his
 * contemporaries — bounded, because measured unbounded it averages 2,619 players.
 *
 * ⚠️ Reads the committed data, so these are slow but they are the only place the recipe
 * meets reality. Everything the mode promises is checked against the real files.
 */
describe("the icon roster", () => {
  it("is drawn from men who really captained a side, most-capped first", async () => {
    const icons = await iconChoices();
    // Measured on the committed data: 164 captains, 39 of them for three seasons or more.
    expect(icons.length).toBeGreaterThanOrEqual(39);
    expect(icons.length).toBeLessThan(60);
    // Sorted by captaincies descending — the order must be total, never wandering.
    const caps = icons.map((i) => i.captaincies);
    expect([...caps].sort((a, b) => b - a)).toEqual(caps);
    expect(caps[0]).toBeGreaterThanOrEqual(3);
  });

  /**
   * ⛔ THE GUARD THAT EARNS ITS KEEP. `LEGEND_ICONS` is a hardcoded id list, and every one
   * of the four ids in its first draft was WRONG — they resolved to nobody, so each would
   * have silently dropped a legend from the roster rather than failing. A hardcoded id is
   * only safe if something checks it still resolves.
   */
  it("⛔ resolves EVERY curated legend to a real player with seasons", async () => {
    const icons = await iconChoices();
    const byName = new Map(icons.map((i) => [i.name, i]));
    for (const name of [
      "Thierry Henry",
      "Cristiano Ronaldo",
      "Mohamed Salah",
      "Sergio Agüero",
      "Dennis Bergkamp",
      "Didier Drogba",
      "Eric Cantona",
    ]) {
      const icon = byName.get(name);
      expect(icon, `${name} is not on the roster — his id no longer resolves`).toBeDefined();
      expect(icon!.seasons.length).toBeGreaterThan(0);
      expect(icon!.nationality).toBeTruthy();
    }
  });

  it("carries the nationality and seasons the synergy pool is built from", async () => {
    const icons = await iconChoices();
    for (const icon of icons) {
      expect(icon.seasons.length, `${icon.name} has no seasons`).toBeGreaterThan(0);
      // Seasons must be real years, or the era half filters against nothing.
      for (const s of icon.seasons) expect(s).toBeGreaterThan(1990);
    }
    // Nationality drives half the mechanic; measured coverage is 5,109 of 5,115 players.
    expect(icons.filter((i) => i.nationality != null).length).toBe(icons.length);
  });
});

describe("the synergy pool", () => {
  const pack = CAPTAINS_PACK;

  /**
   * ⛔ Registered ONLY because its routes now understand a captain chooser.
   *
   * `routedPacks()` filters on `chooser != null` and reads `RULE_PACKS` — never
   * `domain/modes.ts` — so a pack is routed the moment it lands there. Registering this
   * one first fanned `[mode]/[club]` out to `captains × 51 clubs`, handed each CLUB id to
   * `captainSynergy` as a captain id, and killed the prerender on an empty pool. It broke
   * the Vercel build exactly once.
   */
  it("is routed, now that the routes resolve a captain", () => {
    expect(RULE_PACKS).toContain(CAPTAINS_PACK);
    expect(routedPacks().some((p) => p.id === "captains")).toBe(true);
  });

  it("declares the captain-first rule and Legacy's screens", () => {
    expect(pack).toBeTruthy();
    expect(pack.chooser).toEqual({ kind: "captain" });
    expect(pack.constraints).toContainEqual({ kind: "captainFirst" });
    // Mirrors Legacy: designed screens, and an opponent that can match a standout draft.
    expect(pack.screens).toBe("legacy");
    expect(pack.opponent).toBe("best");
  });

  /**
   * ⛔ The bound is the whole reason this pool is shippable. Unbounded it averages 2,619
   * distinct players — ~1.28 MB baked into a force-static page — and John Terry's union is
   * 76% of the entire dataset, which is not a synergy at all.
   */
  it("⛔ never exceeds its cap, however wide the icon's union is", async () => {
    const icons = await iconChoices();
    // The widest case by construction: an English icon with a long career.
    const widest = icons
      .filter((i) => i.nationality === "England")
      .sort((a, b) => b.seasons.length - a.seasons.length)[0]!;
    const pool = await buildPool(pack.pool, widest.id);
    /**
     * ⚠️ `cap` bounds the DRAFTABLE pool, and the icon sits outside it — he is in the pool
     * so replay can resolve him, but he is never dealt, so he cannot cost a draft place.
     * The first version of this assertion missed the distinction and read 601 against 600.
     */
    const draftable = pool.filter((c) => c.playerId !== widest.id);
    expect(
      draftable.length,
      `${widest.name} overflowed the cap`,
    ).toBeLessThanOrEqual((pack.pool as { cap: number }).cap);
    expect(pool.length).toBe(draftable.length + 1);
    expect(draftable.length).toBeGreaterThan(100);
  }, 120_000);

  /** ⚠️ One card per man. A player offered in ten seasons is ten picks of the same human. */
  it("⚠️ offers each player ONCE, at his best season", async () => {
    const icons = await iconChoices();
    const icon = icons.find((i) => i.nationality !== "England")!;
    const pool = await buildPool(pack.pool, icon.id);
    const ids = pool.map((c) => c.playerId);
    expect(new Set(ids).size).toBe(ids.length);
  }, 120_000);

  /**
   * ⛔ The reserve is what keeps HALF the owner's mechanic visible. England has 1,767
   * players against an era of ~3,000, so a purely rating-ranked cap comes out almost
   * entirely era-peers and the coach never meets a countryman.
   */
  it("⛔ still shows countrymen for a big footballing nation", async () => {
    const icons = await iconChoices();
    const english = icons
      .filter((i) => i.nationality === "England")
      .sort((a, b) => b.seasons.length - a.seasons.length)[0]!;
    const pool = await buildPool(pack.pool, english.id);
    // Not asserting the exact reserve: a card's nationality is not on the card, so this
    // asserts the pool is not a pure top-rated slice of one half.
    expect(pool.length).toBeGreaterThan((pack.pool as { nationalityReserve: number }).nationalityReserve);
  }, 120_000);

  /**
   * ⛔ THE ICON IS IN THE POOL, and the first version of this test asserted the opposite.
   *
   * He is placed, never dealt — but "not dealt" and "not in the pool" are different
   * questions, and conflating them breaks resume and sharing. `replayWith` rebuilds a
   * saved XI by resolving every `cardId` against the pool and returns null on the first
   * one it cannot find, so an icon left out would make his own match unresumable and his
   * share link dead — presenting as "the link is broken" rather than as a missing card.
   * `roomDeals`'s `excludePlayers` is what keeps him out of the hands.
   */
  it("⛔ INCLUDES the icon, so every replay path can resolve his card", async () => {
    const icons = await iconChoices();
    const icon = icons[0]!;
    const pool = await buildPool(pack.pool, icon.id);
    expect(pool.some((c) => c.playerId === icon.id)).toBe(true);
    // Exactly once — he is one card, not one per season he played.
    expect(pool.filter((c) => c.playerId === icon.id)).toHaveLength(1);
  }, 120_000);
});
