import type { Formation } from "./formation";
import { adjacentPairs } from "./pitch-adjacency";
import type { GameTeam } from "./team";

/**
 * The minimum a card must carry to be linkable.
 *
 * Structural rather than a concrete card type, so the SAME function scores the coach's draft
 * and a finished `GameTeam` - whose `players` are typed `GamePlayer` even though the runtime
 * objects are pool cards. Every field but `season` is optional, so a genuinely bare player
 * scores zero links, which is the honest answer rather than a crash.
 */
export interface Linkable {
  season: number;
  teamId?: number;
  club?: string;
  nationalityCode?: string | null;
}

/**
 * TASK-1810 PR 5 — squad chemistry: how well a placed XI is linked together.
 *
 * ⭐ Measured before it was designed (spec §0). The three things that shaped this model:
 *
 *  1. **Era overlap is DISQUALIFIED as a link.** At 64% of pairs in a dense pool it is very
 *     nearly a constant, so weighting it would flatten the score into noise — exactly the
 *     failure TASK-1824's design constraint predicted. Era survives only inside the teammate
 *     tier, where "the same season" means something specific.
 *  2. **True teammates are the prize, not the baseline** — 1.1% of random pairs, and 54% of
 *     random XIs contain none at all. That rarity earns them the top tier and the loud
 *     treatment on the pitch.
 *  3. **Chasing chemistry costs ~6.8 rating points per player.** That trade-off is the whole
 *     game: the linked countryman or the better stranger. It is also the exchange rate the
 *     engine modifier has to pay back — see `chemistry-modifier.ts`.
 *
 * ⚠️ PURE and stateless: `(cards, formation) → number`. No memo, no clock, no I/O. It
 * recomputes on every placement, which is what lets the draft surface it live and what makes
 * it exhaustively testable.
 */

/** How strongly one adjacent pair is linked. ⛔ EXCLUSIVE — a pair is exactly one of these. */
export type LinkTier = "none" | "nation" | "club" | "teammates";

/**
 * ⛔ Exclusive rather than additive, for two reasons that are both load-bearing.
 *
 * Conceptually a pair IS one thing — there is no "a bit of teammate plus some nation".
 * Practically, these four states map 1:1 onto the connector colours the pitch draws (grey /
 * amber / green); an additive score would have six values and no honest colour for four of
 * them. The UI and the score therefore cannot drift apart.
 */
const STRENGTH: Record<LinkTier, number> = { none: 0, nation: 1, club: 2, teammates: 3 };

/** The strongest tier a pair reaches. */
export const MAX_STRENGTH = STRENGTH.teammates;

/**
 * The raw fraction that DISPLAYS as 100 — the calibration anchor.
 *
 * ⛔ MEASURED, not chosen (2026-08-28, 200 dealt rooms across five shapes on the real pool):
 *
 * ```
 *   raw score        mean   p50   p75   p90   max
 *   random pick       9.3     9    12    16    25
 *   steering coach   29.8    29    35    39    53
 *   best-of-hands    36.7    36    41    46    61
 * ```
 *
 * ⚠️ The theoretical maximum — every adjacent pair a teammate pair — is unreachable from
 * five random candidates a slot. Scoring against it would tell a coach who played well that
 * he got 30, which reads as failure and makes the meter useless. Anchoring at 40 puts a
 * steering coach around 75, a random one around 23, and leaves 100 genuinely reachable for
 * an exceptional draft (the ceiling's p90 of 46 clips there).
 *
 * ⚠️ Changing it changes every score ever shown or shared. It is the same class of frozen
 * constant as `ADJACENCY_BAND` and the market-index factors — refit it against a fresh
 * distribution, never nudge it to taste.
 */
export const CHEM_ANCHOR = 40;

/**
 * A club's stable identity.
 *
 * ⛔ `teamId`, NOT the club's name. A card's `club` is the name that club carried IN THAT
 * SEASON, and clubs get renamed across a 34-season archive — so keying on the name would
 * silently break the link for exactly the long-history clubs this mode is built on. The name
 * is only a fallback for a card that has no id at all.
 */
function clubKey(card: Linkable): string | null {
  if (card.teamId != null) return `t${card.teamId}`;
  return card.club ? `n${card.club}` : null;
}

/**
 * The link between two cards, taking the strongest tier that applies.
 *
 * ⚠️ A MISSING nationality never matches — the same absent-is-not-equal rule `ringOf`
 * follows. Six rows in the dataset carry no code, and treating unknown-as-equal would make
 * every one of them everybody's countryman.
 */
export function linkTier(a: Linkable, b: Linkable): LinkTier {
  const clubA = clubKey(a);
  const clubB = clubKey(b);
  if (clubA != null && clubA === clubB) {
    return a.season === b.season ? "teammates" : "club";
  }
  const natA = a.nationalityCode;
  return natA != null && natA === b.nationalityCode ? "nation" : "none";
}

/** Every adjacent pair's tier, for a placed XI. Slots may be empty. */
function tiers(cards: readonly (Linkable | null | undefined)[], formation: Formation): LinkTier[] {
  return adjacentPairs(formation).map(([i, j]) => {
    const a = cards[i];
    const b = cards[j];
    return a != null && b != null ? linkTier(a, b) : "none";
  });
}

/**
 * How many adjacent pairs sit at each tier — what the meter reports in words.
 *
 * ⚠️ The four counts always sum to the formation's adjacent-pair count, which is what makes
 * the meter's breakdown a complete account rather than a highlight reel.
 */
export function chemistryBreakdown(
  cards: readonly (Linkable | null | undefined)[],
  formation: Formation,
): Record<LinkTier, number> {
  const out: Record<LinkTier, number> = { none: 0, nation: 0, club: 0, teammates: 0 };
  for (const tier of tiers(cards, formation)) out[tier] += 1;
  return out;
}

/**
 * Chemistry, 0–100.
 *
 * ⚠️ Normalised PER ADJACENT PAIR, so a 14-pair shape and a 25-pair shape are directly
 * comparable and no formation is quietly easier to score in.
 *
 * ⚠️ An empty slot contributes 0 but still counts in the denominator, so the number climbs as
 * the XI fills instead of lurching — chemistry reads as a progress bar, not as a verdict on a
 * half-built side.
 *
 * ⚠️ CALIBRATED against `CHEM_ANCHOR`, so 100 means "an excellent draft" rather than the
 * unreachable all-teammates ideal. The tier RATIOS live in the raw scale and are asserted as
 * an ordering (nation < club < teammates) rather than a fixed fraction, which survives a
 * refit of the anchor.
 */
export function chemistry(
  cards: readonly (Linkable | null | undefined)[],
  formation: Formation,
): number {
  const all = tiers(cards, formation);
  if (all.length === 0) return 0;
  const total = all.reduce((sum, tier) => sum + STRENGTH[tier], 0);
  const raw = (total / (all.length * MAX_STRENGTH)) * 100;
  return Math.min(100, Math.round((raw / CHEM_ANCHOR) * 100));
}

/**
 * A finished side's chemistry - the same score, for either team (owner, 2026-08-28).
 *
 * A `GameTeam` already carries its `formation` and its `players`, so the coach's XI and the
 * opponent's are scored by exactly the same function. That matters beyond convenience: the
 * programme shows both numbers side by side, so computing them differently would make the
 * comparison the coach is invited to draw a dishonest one.
 */
export function teamChemistry(team: GameTeam): number {
  return chemistry(team.players as readonly Linkable[], team.formation);
}
