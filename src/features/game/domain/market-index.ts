/**
 * TASK-1810 — cross-era money, made comparable.
 *
 * Premier League market values inflated ~6.4× between 2004 and 2025, so a euro from 2004 and
 * a euro from 2025 are not the same unit. Budget Cap shops across the whole priced window at
 * once, which is only coherent once every price is expressed in one year's money. Unindexed,
 * €100M buys a near-best 2004 XI (that season's p90 is €9.5M) or five average 2025 players,
 * so the optimal strategy collapses to "only buy the 2000s".
 *
 * ⛔ The basis is the mean of each season's FIFTY HIGHEST values, and that is a measurement
 * rather than a preference. The middle of the market inflated faster (~6.5×) than the top
 * (~4.3×), so a MEDIAN basis charges an 88+ player from 2004 €179M against €101M for one from
 * 2024 — a 1.8× penalty for being old, which is the unindexed bug with its sign flipped. On
 * the top-50 basis every rating band is flat to 1.13–1.37×, and the cheap band drifts UP while
 * the elite band drifts DOWN, so there is no single era to farm.
 *
 * ⛔ FROZEN, not recomputed. `market-index.test.ts` regenerates this from `data/` and asserts
 * the committed copy still matches, so extending the window is a deliberate, reviewed change.
 * If a new season entered the table silently, `top50Mean(BASE)` would move, every historical
 * price would move with it, and the rating-ranked pool would evict cards people have already
 * drafted — `replayWith` returns null on the first card it cannot find, so their share links
 * would die silently and present as "the link is broken". Same discipline as `DAILY_SHAPES`.
 *
 * ⭐ Freezing THIS table is what freezes the window, which is why no 600-entry pool id list has
 * to be committed: the pool is built from the seasons that have a factor, so a 2026 season
 * arriving in `data/` simply has none and is never drafted.
 *
 * Regenerate with: `node scripts/gen-market-index.mjs`
 */

/** The money year every indexed price is expressed in. */
export const BASE_SEASON = 2025;

/**
 * Mean of the 50 highest market values, per season, in euros.
 *
 * ⚠️ 2004–2025 only. `data/market-values.json` also has a 2003 key, but it holds 6 priced
 * players out of 517 — noise, not a market — so the generator's `MIN_PRICED` gate drops it.
 * Generated; do not hand-edit.
 */
export const TOP50_MEAN_EUR: Readonly<Partial<Record<number, number>>> = Object.freeze({
  2004: 18242000,
  2005: 17525000,
  2006: 18615000,
  2007: 21505000,
  2008: 25610000,
  2009: 22110000,
  2010: 25480000,
  2011: 26270000,
  2012: 26430000,
  2013: 26800000,
  2014: 30400000,
  2015: 32660000,
  2016: 38480000,
  2017: 64600000,
  2018: 74300000,
  2019: 62390000,
  2020: 61940000,
  2021: 60760000,
  2022: 67960000,
  2023: 74300000,
  2024: 71700000,
  2025: 78000000,
});

/**
 * How much a euro from `season` is worth in base-season money, or null if unpriced.
 *
 * ⚠️ Null rather than 1. A season with no market data is not "uninflated", it is ABSENT, and
 * defaulting it to parity would price twelve seasons of players at their face value in 2025
 * money — making every 1990s card look like a bargain that cannot actually be bought.
 */
export function indexFactor(season: number): number | null {
  const base = TOP50_MEAN_EUR[BASE_SEASON];
  const own = TOP50_MEAN_EUR[season];
  if (base == null || own == null) return null;
  return base / own;
}

/** A real market value, in base-season money. Null when the season is unpriced. */
export function indexedCost(valueEur: number, season: number): number | null {
  const factor = indexFactor(season);
  if (factor == null) return null;
  return Math.round(valueEur * factor);
}
