import type { Player, PlayerRole } from "@/data/schemas";
import { outfieldStats } from "./player-stats";
import type { PlayerRatings, RatingContext } from "./ratings";
import { DEFENSIVE_ROLES, teamDefense } from "./rating-outfield";
import { OVERALL_SCALE, weightsFor } from "./rating-weights";
import { type DimPart, dimOf, pctile } from "./stat-pool";

const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

/**
 * The pre-2003 pipeline.
 *
 * Those seasons carry ONLY appearances, goals, assists, cards and clean sheets —
 * verified across 1996/2000/2002. There are no tackles, duels or passing stats
 * whatsoever, so there is nothing individual to measure defending with.
 *
 * DEF is therefore deliberately ROLE-INFORMED: position plus the team's defensive
 * record is the only honest signal available. `provenance.tier === "sparse"` flags
 * this on the card so it is never mistaken for a measured number.
 */

const ATTACK: DimPart[] = [
  ["goals90", 2],
  ["sot90", 1],
];
const CREATION: DimPart[] = [["assists90", 2]];

export function rateSparse(player: Player, ctx: RatingContext): PlayerRatings {
  const bag = outfieldStats(player);
  const pools = ctx.pools.outfield;
  const role = (player.role ?? null) as PlayerRole | null;

  const attack = dimOf(bag, pools, ATTACK) ?? 0;
  const creation = dimOf(bag, pools, CREATION) ?? 0;

  // Clean-sheet rate + the team's record, scaled by how defensive the role is — so a
  // forward at a mean defence does not inherit its record (the cleanSheets bug).
  const cleanRate = pctile(bag.cleanSheetRate ?? 0, pools.cleanSheetRate ?? []);
  const context = 100 * (0.5 * cleanRate + 0.5 * teamDefense(player, ctx.standings));
  const w = weightsFor(role);
  const defensiveness = role != null && DEFENSIVE_ROLES.has(role) ? 1 : w.defense + w.physical;
  const defense = context * defensiveness;

  // Availability is the only physical proxy the era offers.
  const physical = 100 * pctile(bag.minutes, pools.minutes ?? []);
  const discipline = 100 * (1 - pctile(bag.cardScore ?? 0, pools.cardScore ?? []));

  const blended =
    w.attack * attack + w.creation * creation + w.defense * defense + w.physical * physical;

  return {
    attack: clamp100(attack),
    creation: clamp100(creation),
    defense: clamp100(defense),
    physical: clamp100(physical),
    discipline: clamp100(discipline),
    overall: clamp100(blended * OVERALL_SCALE),
  };
}
