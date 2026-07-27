/**
 * TASK-M68 — pure market-value maths for the profile block, `/players` and
 * `/compare`. No React, no filesystem, no `server-only`: everything here is
 * unit-testable in isolation and safe to import from a client island.
 *
 * Spec: docs/superpowers/specs/2026-07-27-market-value-design.md §6.
 */

/** One committed valuation from `market-value-history.json`. */
export type MarketValuePoint = {
  season: number;
  valueEur: number;
  determined: string;
};

/** One cell of the career strip — a season collapsed to its last valuation. */
export type MarketValueSeason = {
  season: number;
  /** The season's LAST valuation — what the cell and the readout show. */
  valueEur: number;
  /** ISO date of that last valuation. */
  determined: string;
  /** How many times the player was revalued in the season (>= 1). */
  points: number;
  minEur: number;
  maxEur: number;
  /** True when the app holds a player-season row — these get the PL underline. */
  isPl: boolean;
  /** 1–7, the fixed absolute colour band. */
  band: number;
  /** Percentage change vs the previous season in the strip; null for the first. */
  changePct: number | null;
};

/**
 * The upper bound (exclusive) of bands 1–6, in euro. Band 7 is everything above.
 * FIXED and ABSOLUTE, deliberately not normalised per player: a per-player ramp
 * made a €500k journeyman's best season render as dark as Salah's €150m peak,
 * so the colour meant something different on every page (spec §6.1).
 */
export const MV_BAND_BOUNDS = [1e6, 5e6, 15e6, 30e6, 60e6, 100e6] as const;

/** The fixed absolute band (1–7) a value falls in. */
export function bandForValue(valueEur: number): number {
  let band = 1;
  for (const bound of MV_BAND_BOUNDS) {
    if (valueEur < bound) return band;
    band++;
  }
  return band;
}

/** Locale-supplied unit suffixes, so the formatter itself stays pure. */
export type MarketValueUnits = { k: string; m: string };

/**
 * `€25k` · `€1.5m` · `€150m`. The currency symbol is printed on every number
 * (owner decision, spec §6). Digits are localised by the caller via
 * `localizeDigits` — this returns Latin digits.
 */
export function formatMarketValue(valueEur: number, units: MarketValueUnits): string {
  if (valueEur >= 1e6) {
    const m = valueEur / 1e6;
    const text = m >= 10 ? String(Math.round(m)) : trimZero(m.toFixed(1));
    return `€${text}${units.m}`;
  }
  if (valueEur >= 1e3) return `€${Math.round(valueEur / 1e3)}${units.k}`;
  return `€${Math.round(valueEur)}`;
}

function trimZero(text: string): string {
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

/**
 * Collapse a player's whole-career points into one cell per season.
 *
 * `plSeasons` is the player's own season list from `findPlayerSeasons` — the
 * seasons the app holds a row for. Everything else (Salah at Basel, Henry at
 * Monaco) still renders; it just doesn't get the Premier League underline.
 */
export function buildMarketValueStrip(
  points: readonly MarketValuePoint[],
  plSeasons: readonly number[],
): MarketValueSeason[] {
  const pl = new Set(plSeasons);
  const bySeason = new Map<number, MarketValuePoint[]>();

  for (const point of points) {
    // `seasonId: 0` + `value: 0` is Transfermarkt's RETIREMENT marker, not a
    // valuation — it would draw a bogus €0 cell at the end of a retired
    // player's career (spec §2). The builder already filters these, so this is
    // belt-and-braces against a future re-crawl.
    if (point.season < 1990 || point.valueEur <= 0) continue;
    const list = bySeason.get(point.season);
    if (list) list.push(point);
    else bySeason.set(point.season, [point]);
  }

  const seasons = [...bySeason.keys()].sort((a, b) => a - b);
  const strip: MarketValueSeason[] = [];

  for (const season of seasons) {
    const list = bySeason
      .get(season)!
      .slice()
      .sort((a, b) => a.determined.localeCompare(b.determined));
    const last = list[list.length - 1];
    const values = list.map((p) => p.valueEur);
    const previous = strip[strip.length - 1];
    strip.push({
      season,
      valueEur: last.valueEur,
      determined: last.determined,
      points: list.length,
      minEur: Math.min(...values),
      maxEur: Math.max(...values),
      isPl: pl.has(season),
      band: bandForValue(last.valueEur),
      changePct:
        previous && previous.valueEur > 0
          ? Math.round(((last.valueEur - previous.valueEur) / previous.valueEur) * 100)
          : null,
    });
  }

  return strip;
}
