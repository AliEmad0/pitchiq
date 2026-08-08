import type { Player, Standing } from "@/data/schemas";
import { GK_KEYS, OUTFIELD_KEYS, gkStats, outfieldStats } from "./player-stats";
import { rateGk } from "./rating-gk";
import { rateOutfield } from "./rating-outfield";
import { rateSparse } from "./rating-sparse";
import { MIN_MINUTES, type Pools, buildPools, minutesOf, quantileOf } from "./stat-pool";

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
   * Per-position normalisation data (TASK-1820). Absent while the context is being
   * built — the pipelines that produce the raw overalls must run first.
   */
  norm?: OverallNorm;
}

/**
 * The raw `overall` distribution, league-wide and per role.
 *
 * The four dimensions are league-wide percentiles, so a centre-back scores
 * structurally low on attack, creation and physical no matter how good they are —
 * capping the whole position. Ferdinand '08/09 rated 63 against a 24-goal defence.
 * Mapping a player's standing WITHIN their position onto the league distribution
 * lets each position's best rate like the league's best, without singling anyone out.
 */
export interface RoleAnchors {
  median: number; // raw overall at the role's 50th percentile
  top: number; // raw overall at the role's 95th percentile
  count: number;
}

export interface OverallNorm {
  byRole: Record<string, RoleAnchors>;
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
  const base: RatingContext = {
    season,
    cohort,
    standings,
    pools: {
      outfield: buildPools(outfielders.map(outfieldStats), OUTFIELD_KEYS),
      gk: buildPools(keepers.map(gkStats), GK_KEYS),
    },
    tier: seasonTier(cohort),
  };
  // Second pass: the pipelines need `base` to produce raw overalls, and the
  // normalisation needs those overalls — so it cannot be built in one go.
  return { ...base, norm: buildOverallNorm(base) };
}

/** Roles thinner than this keep their raw overall — too few peers to rank against. */
const MIN_ROLE_PEERS = 8;

export const UNKNOWN_ROLE = "UNK";

/**
 * Where each position's median and elite player should land on the shared scale.
 *
 * Anchoring rather than percentile-mapping is deliberate: mapping a role's standing
 * onto the LEAGUE distribution flattens the elite, because that distribution is
 * dominated by average players (it dropped Salah from 85 to 77). Anchors give every
 * position the same headroom while preserving the spread inside it.
 */
const TARGET_MEDIAN = 62;
const TARGET_TOP = 90;

function buildOverallNorm(base: RatingContext): OverallNorm {
  const raws: Record<string, number[]> = {};
  for (const p of base.cohort) {
    // Only players who actually played define the scale, matching the stat pools.
    if (minutesOf(p) < MIN_MINUTES) continue;
    (raws[p.role ?? UNKNOWN_ROLE] ??= []).push(rawOverall(p, base));
  }
  const byRole: Record<string, RoleAnchors> = {};
  for (const [role, values] of Object.entries(raws)) {
    values.sort((a, b) => a - b);
    byRole[role] = {
      median: quantileOf(values, 0.5) ?? 0,
      top: quantileOf(values, 0.95) ?? 0,
      count: values.length,
    };
  }
  return { byRole };
}

/** The pre-normalisation overall. Kept private — `rate()` is the public entry point. */
function rawOverall(player: Player, base: RatingContext): number {
  if (player.role === "GK") return rateGk(player, base).overall;
  return base.tier === "rich"
    ? rateOutfield(player, base).overall
    : rateSparse(player, base).overall;
}

/**
 * Rescale a raw overall against its own position's anchors.
 *
 * A linear map, so it never reorders players within a position — it only moves
 * where that position sits on the shared scale. A player above their role's 95th
 * percentile extrapolates past TARGET_TOP, which is intended: the genuinely
 * exceptional should clear the elite line rather than pile up on it.
 */
export function normalizeOverall(raw: number, role: string | null, ctx: RatingContext): number {
  const anchors = ctx.norm?.byRole[role ?? UNKNOWN_ROLE];
  if (anchors == null || anchors.count < MIN_ROLE_PEERS) return raw;
  const spread = anchors.top - anchors.median;
  if (spread <= 0) return raw; // degenerate role — leave it alone
  const scaled = TARGET_MEDIAN + ((raw - anchors.median) * (TARGET_TOP - TARGET_MEDIAN)) / spread;
  return Math.max(0, Math.min(CEILING, Math.round(softCap(scaled))));
}

/**
 * Compress everything above the elite anchor.
 *
 * A player far beyond their role's 95th percentile would otherwise extrapolate
 * straight to 100, and a board where four cards share a perfect score says nothing.
 * Above TARGET_TOP the scale tightens so the exceptional separate from the elite
 * without saturating.
 */
const ABOVE_TOP_COMPRESSION = 0.35;
const CEILING = 99;

function softCap(value: number): number {
  return value <= TARGET_TOP ? value : TARGET_TOP + (value - TARGET_TOP) * ABOVE_TOP_COMPRESSION;
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
