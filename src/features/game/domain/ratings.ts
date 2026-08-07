import type { Player, Standing } from "@/data/schemas";
import { GK_KEYS, OUTFIELD_KEYS, gkStats, outfieldStats } from "./player-stats";
import { type Pools, buildPools } from "./stat-pool";

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
  return {
    season,
    cohort,
    standings,
    pools: {
      outfield: buildPools(outfielders.map(outfieldStats), OUTFIELD_KEYS),
      gk: buildPools(keepers.map(gkStats), GK_KEYS),
    },
    tier: seasonTier(cohort),
  };
}

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
