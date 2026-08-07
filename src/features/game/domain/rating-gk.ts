import type { Player } from "@/data/schemas";
import { gkStats } from "./player-stats";
import type { GkRatings, PlayerRatings, RatingContext } from "./ratings";
import { teamDefense } from "./rating-outfield";
import { OVERALL_SCALE, weightsFor } from "./rating-weights";
import { type DimPart, dimOf, pctile, shrink } from "./stat-pool";

const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
const clampNullable = (x: number | null) => (x == null ? null : clamp100(x));

/**
 * The goalkeeper pipeline.
 *
 * Keepers are ranked ONLY against keepers (the split happens in `makeRatingContext`),
 * so the degenerate cohorts that produced Van der Sar ATT 100 cannot form: there is
 * no goals pool for a keeper to top by having zero.
 *
 * Inputs degrade by era and a missing one yields null, so the card renders a dash
 * rather than a fabricated number. `saves` exists only from 2008; pre-2003 leaves
 * clean-sheet rate as the only signal.
 */

const REFLEXES: DimPart[] = [
  ["savePct", 2],
  ["saves90", 1],
];
const HANDLING: DimPart[] = [
  ["gcPrevented90", 2],
  ["cleanSheetRate", 1],
];
const KICKING: DimPart[] = [
  ["passAccuracy", 2],
  ["longPasses90", 1],
];
const POSITIONING: DimPart[] = [
  ["gcOutsideBoxPrevented90", 2],
  ["penaltyGcPrevented90", 1],
];
const COMMAND: DimPart[] = [
  ["duelsWon90", 2],
  ["clearances90", 1],
];

const TEAM_DEF_SHARE = 0.15;
const FULL_SEASON_MINUTES = 2700;

/** Mean of the present goalkeeper dims; null when none are. */
function meanOf(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

export function rateGk(player: Player, ctx: RatingContext): PlayerRatings {
  const bag = gkStats(player);
  const pools = ctx.pools.gk;

  // Shrunk toward neutral by minutes: a backup keeper with a handful of starts and
  // a flattering save% rated 94 — the highest card in the game — without this.
  // Null stays null; a missing input must not become a middling number.
  const dim = (parts: DimPart[]) => {
    const raw = dimOf(bag, pools, parts);
    return raw == null ? null : clampNullable(shrink(raw, bag.minutes));
  };

  const gk: GkRatings = {
    reflexes: dim(REFLEXES),
    handling: dim(HANDLING),
    kicking: dim(KICKING),
    positioning: dim(POSITIONING),
    command: dim(COMMAND),
  };

  // Shot-stopping drives the engine-facing `defense`, so powerOf() finally sees a
  // real goalkeeper-quality signal (ROLE_WEIGHTS.GK already weights defense 0.75).
  const stopping = meanOf([gk.reflexes, gk.handling, gk.positioning]) ?? 50;
  const share = TEAM_DEF_SHARE * Math.min(1, bag.minutes / FULL_SEASON_MINUTES);
  const defense = (1 - share) * stopping + share * 100 * teamDefense(player, ctx.standings);

  const discipline = shrink(
    100 * (1 - pctile(bag.cardScore ?? 0, pools.cardScore ?? [])),
    bag.minutes,
  );
  // A keeper's outfield dims are honestly near-zero rather than a percentile of a
  // cohort where everyone scored zero. Distribution and area command are the two
  // that genuinely map onto the shared axes.
  const attack = 0;
  const creation = gk.kicking ?? 0;
  const physical = gk.command ?? 0;

  const w = weightsFor("GK");
  const blended =
    w.attack * attack + w.creation * creation + w.defense * defense + w.physical * physical;

  return {
    attack,
    creation: clamp100(creation),
    defense: clamp100(defense),
    physical: clamp100(physical),
    discipline: clamp100(discipline),
    overall: clamp100(blended * OVERALL_SCALE),
    gk,
  };
}
