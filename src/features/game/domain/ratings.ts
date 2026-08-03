import type { Player, Standing } from "@/data/schemas";

/** Which pipeline produced the rating. */
export type RatingTier = "rich" | "sparse";

/** Honest detail about what data backed the rating (owner: 2-tier + basis). */
export interface RatingBasis {
  hasAdvanced: boolean; // advanced core present (passAccuracy != null) → 2003+
  hasXg: boolean; // xG present (xg != null) → 2017+
}

export interface Provenance {
  tier: RatingTier;
  season: number;
  basis: RatingBasis;
}

/** 0–100 sub-ratings the match engine (TASK-1803) consumes. */
export interface PlayerRatings {
  attack: number;
  creation: number;
  defense: number;
  physical: number;
  discipline: number;
  overall: number;
}

/** Everything a pure pipeline needs, supplied by the adapter (no I/O in domain). */
export interface RatingContext {
  season: number;
  cohort: Player[]; // all players that season (for percentile ranking)
  standings: Standing[]; // the full league table that season (team context)
}

export interface RatedResult {
  ratings: PlayerRatings;
  provenance: Provenance;
}
