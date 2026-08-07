import type { Player, PlayerRole, Standing } from "@/data/schemas";
import { outfieldStats } from "./player-stats";
import type { PlayerRatings, RatingContext } from "./ratings";
import { OVERALL_SCALE, weightsFor } from "./rating-weights";
import { type DimPart, dimOf, pctile, shrink } from "./stat-pool";

const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

/** Roles whose DEF earns the structural on-pitch goals-conceded signal. */
export const DEFENSIVE_ROLES: ReadonlySet<string> = new Set(["GK", "CB", "RB", "LB", "CDM"]);

/**
 * Rate AND volume, equally weighted on the headline stat.
 *
 * Rate alone crowns the efficient rotation striker (Gabriel Jesus '19 rated 90 while
 * Salah rated 74); volume alone rewards availability. Requiring both means the top
 * attacker is efficient *and* prolific.
 */
const ATTACK: DimPart[] = [
  ["goals90", 2],
  ["goals", 2],
  ["xg90", 1],
  ["sot90", 1],
  ["sot", 1],
];

const CREATION: DimPart[] = [
  ["assists90", 2],
  ["assists", 2],
  ["keyPasses90", 1],
  ["keyPasses", 1],
  ["passAccuracy", 1],
];

/**
 * 8/11 success rate, 2/11 proactive volume, 1/11 reactive volume.
 *
 * Clearances and blocks are HALF weight deliberately: a big clearance count means
 * the team is under siege, not that the defender is good — a pure-volume DEF ranked
 * journeymen at leaky clubs above Van Dijk. Interceptions and tackle volume keep
 * full weight because a defender chooses those.
 */
const DEFENSE: DimPart[] = [
  ["duelPct", 3],
  ["groundPct", 3],
  ["tacklePct", 2],
  ["interceptions90", 1],
  ["tackles90", 1],
  ["clearances90", 0.5],
  ["blocks90", 0.5],
];

/**
 * Defensive roles ONLY. `extended.goalsConceded` is per-player (conceded while on
 * the pitch), so for a defender it measures real structural impact — but on a
 * forward it is pure team inheritance. Applied league-wide it lifted Salah '18/19
 * from DEF 6 to 26, recreating the exact `cleanSheets` pollution this ticket removes.
 */
const DEFENSE_STRUCTURAL: DimPart[] = [["gcPrevented90", 3]];

/** Duel VOLUME here; DEF takes duel RATE. Deliberately not the same input twice. */
const PHYSICAL: DimPart[] = [
  ["duelsWon90", 2],
  ["foulsWon90", 1],
  ["foulsConceded90", 1],
];

const TEAM_DEF_SHARE = 0.15;
const FULL_SEASON_MINUTES = 2700;

/** 0–1: how good the player's team was defensively that season. 0.5 with no standings. */
export function teamDefense(player: Player, standings: Standing[]): number {
  if (standings.length === 0) return 0.5;
  const row = standings.find((s) => s.teamId === player.teamId);
  if (row == null) return 0.5;
  return (
    1 -
    pctile(
      row.goalsAgainst,
      standings.map((s) => s.goalsAgainst),
    )
  );
}

export function rateOutfield(player: Player, ctx: RatingContext): PlayerRatings {
  const bag = outfieldStats(player);
  const pools = ctx.pools.outfield;
  const role = (player.role ?? null) as PlayerRole | null;
  const isDefensive = role != null && DEFENSIVE_ROLES.has(role);

  // Every dimension is shrunk toward neutral by minutes played. Without this a
  // 400-minute cameo posts a huge per-90 rate and out-ranks the whole league — it
  // put a backup keeper top of the card pool at 94.
  const s = (v: number | null) => shrink(v ?? 0, bag.minutes);

  const attack = s(dimOf(bag, pools, ATTACK));
  const creation = s(dimOf(bag, pools, CREATION));
  const physical = s(dimOf(bag, pools, PHYSICAL));

  const defenseParts = isDefensive ? [...DEFENSE, ...DEFENSE_STRUCTURAL] : DEFENSE;
  const rawDefense = s(dimOf(bag, pools, defenseParts));
  // Team credit scaled by how much of the season the player actually anchored, so a
  // rotation defender doesn't inherit a full season's back-line record.
  const share = isDefensive ? TEAM_DEF_SHARE * Math.min(1, bag.minutes / FULL_SEASON_MINUTES) : 0;
  const defense = (1 - share) * rawDefense + share * 100 * teamDefense(player, ctx.standings);

  // Fewer cards → higher. Percentile of the card score, inverted. Shrunk too: a
  // player with 200 clean minutes has not earned a 100.
  const discipline = s(100 * (1 - pctile(bag.cardScore ?? 0, pools.cardScore ?? [])));

  const w = weightsFor(role);
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
