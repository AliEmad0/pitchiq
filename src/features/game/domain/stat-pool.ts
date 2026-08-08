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

/**
 * Minutes at which a player's own rating is trusted in full.
 *
 * The floor above governs who DEFINES the scale; this governs how far an
 * individual is allowed to move along it. Per-90 rates are wildly noisy in small
 * samples — a striker with 400 minutes and 3 goals out-rates every regular in the
 * league — so a short season is pulled toward the middle instead of the extremes.
 */
export const FULL_CREDIT_MINUTES = 1800;

/** 0–1: how much of their own rating a player has earned, by minutes played. */
export function reliability(minutes: number): number {
  return Math.max(0, Math.min(1, minutes / FULL_CREDIT_MINUTES));
}

/**
 * Pull a dimension toward the neutral middle in proportion to how little the player
 * actually played. A full season is untouched; a cameo lands near 50.
 */
export function shrink(value: number, minutes: number, neutral = 50): number {
  return neutral + (value - neutral) * reliability(minutes);
}

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

/**
 * Weighted mean of each present part's percentile, 0–100. Null when nothing is present.
 *
 * Two subtleties, both load-bearing:
 *
 * A part whose POOL is empty is not available in this era (no 2008 player has xG),
 * so it is excluded from the coverage denominator — an era-wide absence must not
 * penalise anyone, or cards would drift by era rather than by ability.
 *
 * A part that IS available but missing for THIS player shrinks the result toward
 * neutral. Plain renormalisation made missing data an advantage: Kuijt '08 has no
 * recorded key passes, so his creation was computed from pass accuracy alone and
 * scored 95 — above Salah's 87 on 10 assists and 60 key passes.
 */
export function dimOf(
  bag: StatBag,
  pools: Pools,
  parts: readonly DimPart[],
  neutral = 50,
): number | null {
  let sum = 0;
  let present = 0;
  let available = 0;
  for (const [key, w] of parts) {
    const pool = pools[key];
    if (pool == null || pool.length === 0) continue; // absent for the whole era
    available += w;
    const v = bag[key];
    if (v == null) continue;
    sum += w * pctile(v, pool);
    present += w;
  }
  if (present === 0) return null;
  const value = (sum / present) * 100;
  const coverage = available === 0 ? 1 : present / available;
  return neutral + (value - neutral) * coverage;
}
