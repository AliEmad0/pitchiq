// Placeholder rating/provenance seams — TASK-1802 replaces the bodies with the
// real era-aware rating model. 1801 only reserves the shape on GamePlayer.

/** How trustworthy a card's ratings are, mirroring M56's RoleSource idea. */
export type RatingTier = "rich" | "sparse";

export interface Provenance {
  /** First-class so the UI can honestly badge a sparse-era card. */
  tier: RatingTier;
}

/** Filled by TASK-1802's rate(). Open-ended on purpose for now. */
export type PlayerRatings = Record<string, number>;
