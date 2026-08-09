import type { Player, PlayerRole } from "@/data/schemas";
import { outfieldStats } from "./player-stats";
import type { PlayerRatings, RatingContext } from "./ratings";
import { DEFENSIVE_ROLES, teamDefense } from "./rating-outfield";
import { OVERALL_SCALE, weightsFor } from "./rating-weights";
import { type DimPart, dimOf, pctile, shrink } from "./stat-pool";

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

// Rate AND volume, matching the rich pipeline so the two eras stay comparable in
// one draft. Pre-2003 has no shots-on-target, so goals and assists carry it.
const ATTACK: DimPart[] = [
  ["goals90", 2],
  ["goals", 2],
];
const CREATION: DimPart[] = [
  ["assists90", 2],
  ["assists", 2],
];

/**
 * How far a PROXY dimension is allowed to travel from neutral, versus a measured one.
 *
 * `defense` here is built ENTIRELY from the team's record (clean-sheet share + goals
 * against) and `physical` ENTIRELY from availability. Neither measures the player. For
 * a centre-back they carry 0.7 + 0.2 = 90% of `overall`, and they saturate together for
 * any ever-present defender at a good defence — so team quality alone carried players
 * into the 90s. Measured across the committed data before this damping:
 *
 *   defensive-role DEF >= 90 : 199 sparse seasons vs 14 rich
 *   defensive-role PHY >= 90 : 214 sparse seasons vs 38 rich
 *   Hyypiä '99 (DEF 98, PHY 99) rated 94 — above Van Dijk '18/19 at 87 on real data
 *
 * The factors are CALIBRATED, not guessed: at 0.85/0.7 the sparse defensive-role
 * distribution lands on the rich one almost exactly (p90 71 vs 70, p99 82 vs 80, max 87
 * vs 87). Damping harder overshoots — at 0.7/0.5 the sparse max falls to 80, below the
 * rich era, which would be a different distortion in the opposite direction.
 *
 * ⚠️ Do NOT extend this to `attack` or `creation`. Goals and assists ARE measurements,
 * and the same sweep puts sparse attackers only ~5 points above rich ones at p99 —
 * a far smaller, different-in-kind effect from a thinner input set, not a proxy.
 */
const TEAM_DEFENCE_CONFIDENCE = 0.85;
const AVAILABILITY_CONFIDENCE = 0.7;

/** Pull a proxy signal toward neutral by how much it actually tells us about a player. */
const proxy = (value: number, confidence: number) => 50 + (value - 50) * confidence;

export function rateSparse(player: Player, ctx: RatingContext): PlayerRatings {
  const bag = outfieldStats(player);
  const pools = ctx.pools.outfield;
  const role = (player.role ?? null) as PlayerRole | null;

  // Shrunk toward neutral by minutes, exactly as the rich pipeline does — a cameo
  // must not out-rate a season's work on a per-90 basis.
  const s = (v: number | null) => shrink(v ?? 0, bag.minutes);

  const attack = s(dimOf(bag, pools, ATTACK));
  const creation = s(dimOf(bag, pools, CREATION));

  // Clean-sheet rate + the team's record, scaled by how defensive the role is — so a
  // forward at a mean defence does not inherit its record (the cleanSheets bug).
  const cleanRate = pctile(bag.cleanSheetRate ?? 0, pools.cleanSheetRate ?? []);
  const context = 100 * (0.5 * cleanRate + 0.5 * teamDefense(player, ctx.standings));
  const w = weightsFor(role);
  const defensiveness = role != null && DEFENSIVE_ROLES.has(role) ? 1 : w.defense + w.physical;
  const defense = proxy(context * defensiveness, TEAM_DEFENCE_CONFIDENCE);

  // Availability is the only physical proxy the era offers — and it is a weak one, so
  // it is damped hardest: being ever-present is not the same as being physical.
  const physical = proxy(100 * pctile(bag.minutes, pools.minutes ?? []), AVAILABILITY_CONFIDENCE);
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
