/**
 * TASK-1817 — everything derivable about one daily challenge, from its date alone.
 *
 * ⚠️ NO CLOCK LIVES HERE. `domain/` may not read entropy or time (TASK-1803), so every
 * function takes the day as an argument. `view/` reads `new Date()` once and passes the
 * key down — the ticket's "a setup input, never read inside the engine".
 */

const MS_PER_DAY = 86_400_000;

/**
 * The UTC calendar day, `YYYY-MM-DD`.
 *
 * ⚠️ UTC GETTERS ONLY. A player in UTC+13 and one in UTC−8 must be given the same
 * challenge at the same instant — that is the entire premise of a daily. Local getters,
 * or `toISOString()` on a locally-adjusted date, break it for everyone outside UTC and
 * break it invisibly, because the developer's own machine usually agrees.
 */
export function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** A key → its UTC midnight, in ms. `Date.UTC` so no DST rule can ever apply. */
function utcMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

/** Step a key by whole days. Used to walk a streak backwards. */
export function dayKeyOffset(key: string, days: number): string {
  return dayKey(new Date(utcMs(key) + days * MS_PER_DAY));
}
