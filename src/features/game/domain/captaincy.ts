/**
 * TASK-1810 — who wears the armband (owner requirement, 2026-08-18).
 *
 * Pure and data-free: the COUNTS are handed in, because `captains.json` is a server-only
 * read and this runs inside a client component. The adapter narrows the map to the pool
 * at build time and ships the result as a prop.
 */

export interface Captaincy {
  captain: number | null;
  vice: number | null;
}

export interface CaptainCandidate {
  playerId: number;
  rating: number;
}

/**
 * Rank an XI into captain and vice.
 *
 * ⚠️ Real captaincies OUTRANK rating, always — that is the whole point of the rule.
 * Measured on the sample XI: Gerrard's 4 takes the armband from van Dijk's 3 even though
 * van Dijk is the better card.
 *
 * ⚠️ The rating fallback is NOT an edge case. `captains.json` covers 20 seasons thinly
 * (1997 has two entries in the entire file), so most Legacy XIs have no recorded captain
 * at all and land here. Treat it as the common path, not the exception.
 */
export function rankCaptains(
  squad: readonly CaptainCandidate[],
  counts: ReadonlyMap<number, number>,
): Captaincy {
  const ranked = [...squad].sort((a, b) => {
    const ca = counts.get(a.playerId) ?? 0;
    const cb = counts.get(b.playerId) ?? 0;
    if (ca !== cb) return cb - ca;
    // Ties break on rating, then on id so the order is total and the armband cannot
    // wander between renders of the same XI.
    if (a.rating !== b.rating) return b.rating - a.rating;
    return a.playerId - b.playerId;
  });
  return { captain: ranked[0]?.playerId ?? null, vice: ranked[1]?.playerId ?? null };
}

/**
 * Who is wearing it right now.
 *
 * ⛔ The vice is NEVER displayed as such while the captain is on the pitch — he is only
 * the fallback. He inherits the armband the moment the captain leaves, by red card or by
 * substitution, and the handover is written into the commentary.
 */
export function armbandAt(c: Captaincy, offPitch: ReadonlySet<number>): number | null {
  if (c.captain != null && !offPitch.has(c.captain)) return c.captain;
  if (c.vice != null && !offPitch.has(c.vice)) return c.vice;
  return null;
}
