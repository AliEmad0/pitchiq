/**
 * TASK-1810 — the GAME price of a card, in the Fantasy Premier League idiom.
 *
 * A card's real indexed market value spans €1.5M to €223M. Shown raw that is unusable: the
 * owner's report was a **£104M card against a £100M budget**, which is absurd on its face and
 * makes every number on screen hard to read. FPL solves the same problem the same way — its
 * prices are a compressed game currency, roughly £4.0m to £15.0m, not a market.
 *
 * ⭐ THE PROPERTY THAT MAKES THIS SAFE: a bargain is a **rank disagreement between rating and
 * price**, and this mapping is strictly monotonic in the real value. So every disagreement
 * survives untouched — Vardy 2015 is 91-rated at £8.5m while Rodri 2020 is 91-rated at £15.1m,
 * exactly as their real market values said. Compression changes the numbers, never the order.
 *
 * ⛔ The mapping is by PERCENTILE within the pool, not by a linear or logarithmic rescale of
 * the value. A linear rescale crushes 90% of cards into £4.0–7.4m because market values are
 * heavily skewed; percentile spreads them evenly and then `CURVE` decides where the mass sits.
 *
 * ⚠️ Prices are integer TENTHS of a million (`164` = £16.4m). Floats would drift: the reserve
 * rule sums ten of them on every render and compares the total against the cap, so a
 * 0.1 + 0.2 !== 0.3 error would show as a card that is affordable one render and not the next.
 */

/** The cheapest a card can be, in tenths of a million. */
export const PRICE_FLOOR = 40;
/** The dearest a card can be. ⚠️ Owner's constraint: top players stay UNDER £20m. */
export const PRICE_CEILING = 195;

/**
 * How the mass of the pool is distributed between floor and ceiling.
 *
 * ⛔ MEASURED, not chosen. The curve decides the whole balance of the mode, because it sets
 * what an XI costs relative to the cap. Across 60 dealt rooms at a £100.0m cap:
 *
 * | curve | median-pick XI | priciest-pick XI | slack vs a median XI |
 * | ----- | -------------- | ---------------- | -------------------- |
 * | 1.5   | £96m           | £161m            | +£4m                 |
 * | **2.0** | **£81m**     | **£150m**        | **+£19m**            |
 * | 2.5   | £71m           | £140m            | +£29m                |
 * | 3.0   | £65m           | £132m            | +£35m                |
 *
 * At 2.0 the cap binds in **every** room (you can never take the dearest card each round) and
 * is never infeasible, while leaving about £19m to spend up — enough for one or two premiums
 * if the coach economises elsewhere. That is the FPL feel. Flatter curves leave no room to
 * manoeuvre; steeper ones make the cap decorative.
 */
export const PRICE_CURVE = 2.0;

/**
 * A card's game price from its rank in the pool.
 *
 * @param percentile 0 = the cheapest card in the pool, 1 = the dearest.
 * @returns tenths of a million, e.g. `164` for £16.4m.
 */
export function bandPrice(percentile: number): number {
  const p = Math.min(1, Math.max(0, percentile));
  const raw = PRICE_FLOOR + (PRICE_CEILING - PRICE_FLOOR) * p ** PRICE_CURVE;
  return Math.round(raw);
}

/**
 * Tenths of a million as a display string: `164` → `"16.4"`, `40` → `"4.0"`.
 *
 * ⚠️ Digits only — no currency mark and no locale. The caller adds the symbol, and the card
 * face deliberately keeps Western numerals in every locale (the owner's pinned rule for game
 * numbers; see the match-flow numeral decision).
 */
export function priceLabel(tenths: number): string {
  return (tenths / 10).toFixed(1);
}
