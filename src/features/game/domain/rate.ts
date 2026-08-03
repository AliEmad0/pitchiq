import type { Player } from "@/data/schemas";
import { rateRich } from "./rating-rich";
import { rateSparse } from "./rating-sparse";
import type { RatedResult, RatingContext } from "./ratings";

/**
 * The single era-aware rating entry point (pure).
 * Era is detected from the data: advanced core present → rich pipeline, else sparse.
 */
export function rate(player: Player, ctx: RatingContext): RatedResult {
  const hasAdvanced = player.metrics.passAccuracy != null;
  const hasXg = player.metrics.xg != null;
  const ratings = hasAdvanced ? rateRich(player, ctx) : rateSparse(player, ctx);
  return {
    ratings,
    provenance: {
      tier: hasAdvanced ? "rich" : "sparse",
      season: ctx.season,
      basis: { hasAdvanced, hasXg },
    },
  };
}
