import type { Player } from "@/data/schemas";
import { SCALE_CEILING, achievementBoost, amplifyUnanchored } from "./rating-achievement";
import { anchorOf, applyAnchor, seasonDelta } from "./rating-anchor";
import { rateGk } from "./rating-gk";
import { rateOutfield } from "./rating-outfield";
import { rateSparse } from "./rating-sparse";
import type { PlayerRatings, RatedResult, RatingContext } from "./ratings";
import { minutesOf, pctile } from "./stat-pool";

/**
 * The single era-aware rating entry point (pure).
 *
 * Two routing decisions, both taken from the data rather than year constants:
 *  - goalkeeper vs outfielder, so the two cohorts never mix
 *  - the SEASON's tier (`ctx.tier`) picks rich vs sparse
 *
 * The tier is deliberately a property of the season, not the player. Routing on the
 * individual's `passAccuracy` dropped anyone missing that one stat onto the pre-2003
 * scale — Kuijt '08 landed there and rated PHY 100, because sparse `physical` is
 * just minutes played. A player missing an input inside a rich season stays on the
 * rich scale and is handled by coverage shrinkage in `dimOf`.
 *
 * `basis` still reports the PLAYER's own data, so a card stays honest about itself.
 */
/**
 * The purely statistical rating, before any heritage anchoring.
 *
 * Exported because `makeRatingContext` needs every player's raw `overall` to build the
 * role-season ranking that Layer 2's delta is measured against — and it must call THIS
 * rather than `rate`, which would need the ranking that is still being built.
 */
export function rawRatings(player: Player, ctx: RatingContext): PlayerRatings {
  if (player.role === "GK") return rateGk(player, ctx);
  return ctx.tier === "rich" ? rateOutfield(player, ctx) : rateSparse(player, ctx);
}

/**
 * Where this season sits among the same ROLE in the same SEASON, 0–1.
 *
 * Neutral (0.5) when there is no cohort to rank against, so a missing role or an empty
 * pool leaves the player sitting exactly on their anchor instead of being read as the
 * worst in the league — `pctile` returns 0 for an empty pool, which would silently
 * mean −6.
 */
/** Where the player's club finished that season, or null with no standings. */
function rankOf(player: Player, ctx: RatingContext): number | null {
  return ctx.standings.find((s) => s.teamId === player.teamId)?.rank ?? null;
}

function cohortPercentile(overall: number, player: Player, ctx: RatingContext): number {
  const pool = player.role == null ? [] : (ctx.roleOveralls[player.role] ?? []);
  return pool.length === 0 ? 0.5 : pctile(overall, pool);
}

export function rate(player: Player, ctx: RatingContext): RatedResult {
  const hasAdvanced = player.metrics.passAccuracy != null;
  const hasXg = player.metrics.xg != null;
  const hasSaves = player.metrics.saves != null;

  const raw = rawRatings(player, ctx);

  // TASK-1821 Layers 2 + 3. The four dimensions are never touched — only `overall` —
  // so the card face keeps describing what the player actually did.
  //
  //   anchored    → heritage anchor + a season delta bounded to ±6      (Layer 2)
  //   un-anchored → statistical model + the clamped role amplifier      (Layer 3)
  //   both        → + team achievement, then the hard scale ceiling     (Layer 3)
  const minutes = minutesOf(player);
  const anchor = anchorOf(player.id, ctx.season);
  const base =
    anchor == null
      ? amplifyUnanchored(raw.overall, player.role ?? null)
      : anchor + seasonDelta(cohortPercentile(raw.overall, player, ctx), minutes);

  const boost = achievementBoost(rankOf(player, ctx), minutes);
  const ratings = {
    ...raw,
    overall: Math.min(SCALE_CEILING, applyAnchor(base, boost)),
  };

  return {
    ratings,
    provenance: {
      tier: ctx.tier,
      season: ctx.season,
      basis: { hasAdvanced, hasXg, hasSaves },
    },
  };
}
