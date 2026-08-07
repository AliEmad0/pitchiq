import type { Player } from "@/data/schemas";
import { rateGk } from "./rating-gk";
import { rateOutfield } from "./rating-outfield";
import { rateSparse } from "./rating-sparse";
import type { RatedResult, RatingContext } from "./ratings";

/**
 * The single era-aware rating entry point (pure).
 *
 * Two routing decisions, both taken from the data rather than year constants:
 *  - goalkeeper vs outfielder, so the two cohorts never mix
 *  - advanced core present (passAccuracy) → the rich pipeline, else sparse
 */
export function rate(player: Player, ctx: RatingContext): RatedResult {
  const hasAdvanced = player.metrics.passAccuracy != null;
  const hasXg = player.metrics.xg != null;
  const hasSaves = player.metrics.saves != null;
  const isKeeper = player.role === "GK";

  const ratings = isKeeper
    ? rateGk(player, ctx)
    : hasAdvanced
      ? rateOutfield(player, ctx)
      : rateSparse(player, ctx);

  return {
    ratings,
    provenance: {
      tier: hasAdvanced ? "rich" : "sparse",
      season: ctx.season,
      basis: { hasAdvanced, hasXg, hasSaves },
    },
  };
}
