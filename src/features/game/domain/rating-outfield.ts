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
 * Defensive roles ONLY — the OUTCOME block, and the heaviest thing in a defender's
 * DEF by design.
 *
 * Event counts measure how much defending a player was FORCED into, which is a
 * property of their team, not their quality: an elite positional centre-back at a
 * dominant side prevents chances rather than reacting to them, so Ferdinand '08/09
 * (PFA Team of the Year, 24 goals conceded) rated 63 on volume-led inputs. What a
 * defender is actually for is goals not being conceded while they play — and both
 * inputs here are PER-PLAYER (`goalsConceded` is on-pitch; clean sheets are games
 * the player appeared in), not team totals.
 *
 * Restricted to defensive roles: on a forward these are pure team inheritance.
 * Applied league-wide, `gcPrevented90` alone lifted Salah '18/19 from DEF 6 to 26,
 * recreating the `cleanSheets` pollution this ticket exists to remove.
 */
const DEFENSE_STRUCTURAL: DimPart[] = [
  ["gcPrevented90", 4],
  ["cleanSheetRate", 2],
];

/**
 * Duel volume AND duel success, equally weighted.
 *
 * Volume alone measured how often a player is DRAGGED into contests, not how
 * physical they are — it is a function of role and team style. Centre-backs sit at
 * the 46th percentile on duel volume league-wide because midfielders dominate it,
 * so Anton Ferdinand '08 rated PHY 13 despite the 98th-percentile ground-duel
 * success rate, and with PHY at 20% of a centre-back's overall that cost ~7 points.
 */
const PHYSICAL: DimPart[] = [
  ["duelPct", 3],
  ["duelsWon90", 2],
  ["foulsWon90", 1],
];
// `foulsConceded90` was removed: committing fewer fouls is a VIRTUE for a positional
// defender, so counting it as physicality penalised exactly the profile we want to
// reward, and discipline already accounts for cards.

/**
 * How much of a defender's DEF is the team's defensive record. Raised from 0.15:
 * for a positional centre-back the team conceding little IS the evidence of the job
 * being done, and no event count in this dataset captures it.
 */
const TEAM_DEF_SHARE = 0.25;
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
