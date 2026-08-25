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
  /**
   * The WHOLE XI, ranked by the same rule — the captain and the vice are simply its first
   * two entries (TASK-1838).
   *
   * ⛔ It exists because two names are not enough. A coach who substitutes both leaders
   * leaves nine men on the pitch and no armband, and the caption then read "no recorded
   * captain" for the rest of the match — a sentence about the DATA, in a situation that is
   * purely about who is still playing.
   *
   * ⚠️ Optional so a caller may still describe a captaincy by its two names alone; those
   * fall back to `[captain, vice]`, which is exactly the behaviour they had before.
   */
  order?: readonly number[];
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
 * The full ranking is returned alongside the two names, so the armband has somewhere to
 * go when both leaders leave. See `Captaincy.order`.
 *
 * ⚠️ The rating fallback is NOT an edge case. `captains.json` covers 20 seasons thinly
 * (1997 has two entries in the entire file), so most Legacy XIs have no recorded captain
 * at all and land here. Treat it as the common path, not the exception.
 */
export function rankCaptains(
  squad: readonly CaptainCandidate[],
  counts: ReadonlyMap<number, number>,
  /**
   * A player who wears it no matter what (owner, 2026-08-25).
   *
   * ⭐ Captain's Draft is built ON its icon — the mode is named for him and he is placed in
   * the XI before a card is drafted — so ranking him on real captaincy counts like anyone
   * else meant he only led if he would have won it anyway. He now leads by the mode's rule.
   *
   * ⚠️ He is moved to the FRONT of the order, not given a fake count. Inventing captaincies
   * would corrupt the honest data the rest of the rule reads, and the handover still works
   * from here: substitute him and the armband passes down the same ranking as ever.
   */
  forced?: number | null,
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
  const order = ranked.map((r) => r.playerId);
  if (forced != null && order.includes(forced)) {
    order.splice(order.indexOf(forced), 1);
    order.unshift(forced);
  }
  return { captain: order[0] ?? null, vice: order[1] ?? null, order };
}

/**
 * Who is wearing it right now: the highest-ranked man still on the pitch.
 *
 * ⛔ The vice is NEVER displayed as such while the captain is on the pitch — he is only
 * the fallback. He inherits the armband the moment the captain leaves, by red card or by
 * substitution, and the handover is written into the commentary. The same is true of
 * everyone behind him: the rule does not stop after two names.
 *
 * ⚠️ Null means there is nobody left to wear it — an empty XI, or every ranked man off the
 * pitch. It does NOT mean "this squad has no recorded captain": `rankCaptains` falls back
 * to rating, so a non-empty XI always has an order.
 */
export function armbandAt(c: Captaincy, offPitch: ReadonlySet<number>): number | null {
  for (const id of c.order ?? [c.captain, c.vice]) {
    if (id != null && !offPitch.has(id)) return id;
  }
  return null;
}
