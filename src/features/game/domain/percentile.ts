/**
 * Fraction of the pool ≤ value (max → 1). Empty pool → 0.
 *
 * Kept for the standings-context ranking. For STAT ranking use `stat-pool`'s
 * `pctile`, which averages ties — this one hands a whole tied block its top rank,
 * which is what made every 0-goal player read as an elite attacker.
 */
export function percentileRank(value: number, pool: number[]): number {
  if (pool.length === 0) return 0;
  const le = pool.reduce((n, x) => (x <= value ? n + 1 : n), 0);
  return le / pool.length;
}
