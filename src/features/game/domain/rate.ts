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
export function rate(player: Player, ctx: RatingContext): RatedResult {
  const hasAdvanced = player.metrics.passAccuracy != null;
  const hasXg = player.metrics.xg != null;
  const hasSaves = player.metrics.saves != null;
  const isKeeper = player.role === "GK";

  const ratings = isKeeper
    ? rateGk(player, ctx)
    : ctx.tier === "rich"
      ? rateOutfield(player, ctx)
      : rateSparse(player, ctx);

  return {
    ratings,
    provenance: {
      tier: ctx.tier,
      season: ctx.season,
      basis: { hasAdvanced, hasXg, hasSaves },
    },
  };
}
