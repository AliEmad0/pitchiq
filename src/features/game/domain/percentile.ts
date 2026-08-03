import type { ComparisonMetrics, Player } from "@/data/schemas";
import type { PlayerRole } from "@/data/schemas";

/** Fraction of the pool ≤ value (max → 1). Empty pool → 0. */
export function percentileRank(value: number, pool: number[]): number {
  if (pool.length === 0) return 0;
  const le = pool.reduce((n, x) => (x <= value ? n + 1 : n), 0);
  return le / pool.length;
}

const MIN_ROLE_PEERS = 8;

/**
 * Non-null values of one metric across the role-peer cohort that season.
 * Falls back to the whole-season pool when the role group is thin or role is null.
 */
export function poolOf(
  cohort: Player[],
  role: PlayerRole | null,
  pick: (m: ComparisonMetrics) => number | null,
): number[] {
  const rolePeers = role == null ? [] : cohort.filter((p) => p.role === role);
  const base = rolePeers.length >= MIN_ROLE_PEERS ? rolePeers : cohort;
  const out: number[] = [];
  for (const p of base) {
    const v = pick(p.metrics);
    if (v != null) out.push(v);
  }
  return out;
}
