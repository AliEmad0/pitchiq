import type { ComparisonMetrics, Player, Standing } from "@/data/schemas";
import { percentileRank, poolOf } from "./percentile";
import type { PlayerRatings, RatingContext } from "./ratings";
import { weightsFor } from "./rating-weights";

const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

function teamContext(player: Player, standings: Standing[]) {
  const row = standings.find((s) => s.teamId === player.teamId) ?? null;
  if (row == null || standings.length === 0) {
    return { attack: 0.5, defense: 0.5, quality: 0.5 };
  }
  const attack = percentileRank(row.goalsFor, standings.map((s) => s.goalsFor));
  const defense = 1 - percentileRank(row.goalsAgainst, standings.map((s) => s.goalsAgainst));
  const quality = percentileRank(row.points, standings.map((s) => s.points));
  return { attack, defense, quality };
}

/** Percentile of one basic metric within the role cohort (0–1). */
function pct(
  player: Player,
  ctx: RatingContext,
  pick: (m: ComparisonMetrics) => number | null,
): number {
  const v = pick(player.metrics);
  if (v == null) return 0;
  return percentileRank(v, poolOf(ctx.cohort, player.role, pick));
}

export function rateSparse(player: Player, ctx: RatingContext): PlayerRatings {
  const team = teamContext(player, ctx.standings);
  const goalsP = pct(player, ctx, (m) => m.goals);
  const assistsP = pct(player, ctx, (m) => m.assists);
  const cleanP = pct(player, ctx, (m) => m.cleanSheets ?? null);
  const appsP = pct(player, ctx, (m) => m.appearances);

  const attack = 100 * (0.8 * ((2 * goalsP + assistsP) / 3) + 0.2 * team.attack);
  const creation = 100 * assistsP;
  const defense = 100 * (0.6 * cleanP + 0.4 * team.defense);
  const physical = 100 * appsP;
  const cardScore = (m: ComparisonMetrics) => (m.yellowCards ?? 0) + 2 * (m.redCards ?? 0);
  const discipline =
    100 *
    (1 - percentileRank(cardScore(player.metrics), poolOf(ctx.cohort, player.role, cardScore)));

  const w = weightsFor(player.role);
  const base =
    w.attack * attack + w.creation * creation + w.defense * defense + w.physical * physical;
  const overall = 0.9 * base + 0.1 * (100 * team.quality); // less individual signal → lean on team

  return {
    attack: clamp100(attack),
    creation: clamp100(creation),
    defense: clamp100(defense),
    physical: clamp100(physical),
    discipline: clamp100(discipline),
    overall: clamp100(overall),
  };
}
