import type { Player, Standing } from "@/data/schemas";
import { GK_KEYS, OUTFIELD_KEYS, gkStats, outfieldStats } from "./player-stats";
import { rawRatings } from "./rate";
import { MIN_MINUTES, type Pools, buildPools, minutesOf } from "./stat-pool";

/** Which pipeline produced the rating. */
export type RatingTier = "rich" | "sparse";

/** Honest detail about what data backed the rating (owner: 2-tier + basis). */
export interface RatingBasis {
  hasAdvanced: boolean; // advanced core present (passAccuracy != null) → 2003+
  hasXg: boolean; // xG present (xg != null) → 2017+
  hasSaves: boolean; // GK saves present → 2008+; keeps a keeper card honest
}

export interface Provenance {
  tier: RatingTier;
  season: number;
  basis: RatingBasis;
}

/**
 * Goalkeeper-specific face numbers. Null where the era has no input for one — the
 * card renders a dash rather than a fabricated number.
 */
export interface GkRatings {
  reflexes: number | null;
  handling: number | null;
  kicking: number | null;
  positioning: number | null;
  command: number | null;
}

/**
 * 0–100 sub-ratings the match engine (TASK-1803) consumes.
 *
 * The six numeric keys are the ENGINE CONTRACT and are populated for every player
 * including goalkeepers — `team-power`, `minute-model` and `card-design` all read
 * them unconditionally, so making them role-dependent would break the engine. A
 * keeper's are produced by the GK pipeline (so `attack` is a genuine near-zero, not
 * the old percentile-of-all-zeros 100), with the keeper-specific numbers in `gk`.
 */
export interface PlayerRatings {
  attack: number;
  creation: number;
  defense: number;
  physical: number;
  discipline: number;
  overall: number;
  gk?: GkRatings;
}

/** Season-wide ranking pools, built once. Goalkeepers and outfielders never mix. */
export interface SeasonPools {
  outfield: Pools;
  gk: Pools;
}

/** Everything a pure pipeline needs, supplied by the adapter (no I/O in domain). */
export interface RatingContext {
  season: number;
  cohort: Player[];
  standings: Standing[];
  pools: SeasonPools;
  /**
   * Which pipeline this SEASON gets. Detected once from the cohort, never per
   * player: an individual missing one stat must not drop onto a different scale.
   * Kuijt '08 has no recorded pass accuracy and was being scored by the pre-2003
   * pipeline, where `physical` is just minutes played — so he rated PHY 100.
   */
  tier: RatingTier;
  /**
   * Raw statistical `overall`s for the season, grouped by role — the ranking TASK-1821
   * Layer 2 measures its ±6 delta against.
   *
   * Ranking WITHIN a role is what stops the delta re-importing the league-wide
   * defender cap: a centre-back is compared to centre-backs, not to strikers. It is
   * also what PR #99 did before it was reverted — the difference is that the result
   * here is bounded to ±6 by construction, not multiplied by an unbounded per-role
   * spread. Ranking within the SEASON additionally normalises the era, which matters
   * because the pre-2003 sparse pipeline sits several points hot.
   */
  roleOveralls: Record<string, number[]>;
}

export interface RatedResult {
  ratings: PlayerRatings;
  provenance: Provenance;
}

/**
 * Build a rating context, computing the season's pools ONCE.
 *
 * Pools must not be rebuilt per player: the chaos pool rates hundreds of cards
 * across six seasons at build time, and per-player pool construction is quadratic.
 *
 * Splitting keepers from outfielders HERE is what makes the degenerate cohorts
 * structurally impossible — not a check inside each pipeline.
 */
export function makeRatingContext(
  season: number,
  cohort: Player[],
  standings: Standing[],
): RatingContext {
  const keepers = cohort.filter((p) => p.role === "GK");
  const outfielders = cohort.filter((p) => p.role !== "GK");
  const ctx: RatingContext = {
    season,
    cohort,
    standings,
    pools: {
      outfield: buildPools(outfielders.map(outfieldStats), OUTFIELD_KEYS),
      gk: buildPools(keepers.map(gkStats), GK_KEYS),
    },
    tier: seasonTier(cohort),
    roleOveralls: {},
  };
  // Second pass: the raw overalls can only be computed once the pools above exist.
  ctx.roleOveralls = buildRoleOveralls(ctx);
  return ctx;
}

/**
 * Group the season's raw statistical overalls by role.
 *
 * Uses the same `MIN_MINUTES` gate as the stat pools, and for the same reason: a
 * bit-part player is still RATED, they just don't get to define the scale the rest of
 * their role is ranked against.
 */
function buildRoleOveralls(ctx: RatingContext): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const p of ctx.cohort) {
    if (p.role == null || minutesOf(p) < MIN_MINUTES) continue;
    (out[p.role] ??= []).push(rawRatings(p, ctx).overall);
  }
  return out;
}

/*
 * REVERTED — per-position `overall` normalisation (PR #99).
 *
 * It rescaled each player's raw overall against their own role's median→p95 spread.
 * The intent was sound (league-wide dimensions cap defenders as a class), but the
 * implementation divided by that spread with no floor on it, and the spread varies
 * enormously by role and season:
 *
 *   2011 LM  n=8   spread  5.6  →  5.0x amplification
 *   2019 CM  n=55  spread 11.6  →  2.4x
 *   2008 GK  n=25  spread 27.0  →  1.0x
 *
 * A 5x amplifier on a noisy raw score destabilised the whole scale: Barry '11 and
 * Ben White '23 hit 96, Neville '96 90, while Giggs '12 fell to 70, Campbell '04 to
 * 67 and Valencia '12 to 65. Thin cohorts (LM n=8, LW n=9) cannot support a p95
 * estimate at all, and MIN_ROLE_PEERS = 8 was far too permissive.
 *
 * Any retry needs: a floor on the divisor, a much higher peer minimum, role groups
 * pooled across seasons rather than per-season, and validation across EVERY role and
 * era — not the handful of named players that were spot-checked.
 */

/**
 * Does this SEASON carry advanced data? Decided by the cohort, not by one player.
 *
 * The split is sharp in practice — pre-2003 has no pass data at all, 2003+ has it
 * for ~98% of players — so a simple majority is unambiguous, and the handful of
 * players missing the stat inside a rich season stay on the rich scale (their
 * missing inputs are handled by coverage shrinkage in `dimOf`).
 */
function seasonTier(cohort: Player[]): RatingTier {
  if (cohort.length === 0) return "sparse";
  const withAdvanced = cohort.filter((p) => p.metrics.passAccuracy != null).length;
  return withAdvanced * 2 > cohort.length ? "rich" : "sparse";
}
