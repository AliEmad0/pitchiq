import type { Player } from "@/data/schemas";

/**
 * The ranking layer for the rating model (TASK-1820).
 *
 * Owns the three things the old model conflated: converting a counting stat to a
 * per-90 RATE, deciding who is eligible to define the SCALE, and RANKING a value
 * against that scale.
 */

/**
 * Minutes below which a player is excluded from the ranking pools. They are still
 * rated — a low-minute player just doesn't get to distort the scale everyone else
 * is measured against.
 */
export const MIN_MINUTES = 600;

/** One player's stats for one season, keyed by stat name. `minutes` is always present. */
export interface StatBag {
  minutes: number;
  [key: string]: number | null;
}

export type Pools = Record<string, number[]>;

/** `[statKey, weight]` — the parts that blend into one dimension. */
export type DimPart = [string, number];

export function minutesOf(p: Player): number {
  const explicit = p.metrics.extended?.minutesPlayed;
  if (explicit != null) return explicit;
  // Pre-2004 carries no `extended` block at all, so appearances are all we have.
  return (p.metrics.appearances ?? 0) * 90;
}

export function per90(value: number | null | undefined, minutes: number): number | null {
  if (value == null || minutes <= 0) return null;
  return (value * 90) / minutes;
}

/**
 * A success percentage over the RESOLVED denominator only.
 *
 * The dataset's `duels` field counts total involvements and is NOT won + lost
 * (Wan-Bissaka '18: duels 377, won+lost 171), so dividing by it silently deflates
 * every rate. Always pass the won and lost counts.
 */
export function successRate(
  won: number | null | undefined,
  lost: number | null | undefined,
): number | null {
  if (won == null || lost == null) return null;
  const resolved = won + lost;
  if (resolved <= 0) return null;
  return (100 * won) / resolved;
}

/**
 * Ties-averaged (midpoint) percentile: a block of equal values lands in the MIDDLE
 * of the block, not at its top.
 *
 * This is what stops zero-inflation reading as excellence. The old `x <= value`
 * count handed every 0-goal player the whole zero block's credit — the mechanism
 * behind Van der Sar rating ATT 100.
 */
export function pctile(value: number, pool: number[]): number {
  if (pool.length === 0) return 0;
  let below = 0;
  let equal = 0;
  for (const x of pool) {
    if (x < value) below++;
    else if (x === value) equal++;
  }
  return (below + equal / 2) / pool.length;
}

export function buildPools(bags: StatBag[], keys: readonly string[]): Pools {
  const pools: Pools = Object.fromEntries(keys.map((k) => [k, [] as number[]]));
  for (const bag of bags) {
    if (bag.minutes < MIN_MINUTES) continue;
    for (const key of keys) {
      const v = bag[key];
      if (v != null) pools[key].push(v);
    }
  }
  return pools;
}

/** Weighted mean of each present part's percentile, 0–100. Null when nothing is present. */
export function dimOf(bag: StatBag, pools: Pools, parts: readonly DimPart[]): number | null {
  let sum = 0;
  let weight = 0;
  for (const [key, w] of parts) {
    const v = bag[key];
    if (v == null) continue;
    const pool = pools[key];
    if (pool == null || pool.length === 0) continue;
    sum += w * pctile(v, pool);
    weight += w;
  }
  return weight === 0 ? null : (sum / weight) * 100;
}
