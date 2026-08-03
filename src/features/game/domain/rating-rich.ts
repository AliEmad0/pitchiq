import type { ComparisonMetrics, Player } from "@/data/schemas";
import { percentileRank, poolOf } from "./percentile";
import type { PlayerRatings, RatingContext } from "./ratings";
import { weightsFor } from "./rating-weights";

const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

/** Weighted average (0–1) of the percentile of each present metric; 0 if none present. */
function dim(
  player: Player,
  ctx: RatingContext,
  parts: { pick: (m: ComparisonMetrics) => number | null; w: number }[],
): number {
  let sum = 0;
  let wsum = 0;
  for (const { pick, w } of parts) {
    const v = pick(player.metrics);
    if (v == null) continue;
    sum += w * percentileRank(v, poolOf(ctx.cohort, player.role ?? null, pick));
    wsum += w;
  }
  return wsum === 0 ? 0 : (sum / wsum) * 100;
}

export function rateRich(player: Player, ctx: RatingContext): PlayerRatings {
  const attack = dim(player, ctx, [
    { pick: (m) => m.goals, w: 2 },
    { pick: (m) => m.shotsOnTarget, w: 1 },
    { pick: (m) => m.xg ?? null, w: 1 },
  ]);
  const creation = dim(player, ctx, [
    { pick: (m) => m.assists, w: 2 },
    { pick: (m) => m.keyPasses, w: 1 },
    { pick: (m) => m.passAccuracy, w: 1 },
  ]);
  const defense = dim(player, ctx, [
    { pick: (m) => m.tackles, w: 1 },
    { pick: (m) => m.interceptions, w: 1 },
    { pick: (m) => m.duelsWon, w: 1 },
    { pick: (m) => m.cleanSheets ?? null, w: 1 },
  ]);
  const physical = dim(player, ctx, [
    { pick: (m) => m.duelsWon, w: 1 },
    { pick: (m) => m.dribblesCompleted, w: 1 },
  ]);
  // Discipline: fewer cards → higher. Percentile of a card-score, inverted.
  const cardScore = (m: ComparisonMetrics) =>
    (m.yellowCards ?? 0) + 2 * (m.redCards ?? 0);
  const discipline =
    100 *
    (1 - percentileRank(cardScore(player.metrics), poolOf(ctx.cohort, player.role ?? null, cardScore)));
  const w = weightsFor(player.role ?? null);
  const overall =
    w.attack * attack + w.creation * creation + w.defense * defense + w.physical * physical;

  return {
    attack: clamp100(attack),
    creation: clamp100(creation),
    defense: clamp100(defense),
    physical: clamp100(physical),
    discipline: clamp100(discipline),
    overall: clamp100(overall),
  };
}
