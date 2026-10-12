import { loadMarketValueHistory } from "@/data/loaders";
import { buildMarketValueStrip } from "@/features/players/market-value";

import { MarketValueBlock } from "./MarketValueBlock";

/**
 * TASK-M68 — the career market-value block on `/players/[id]`.
 *
 * Career-scoped and season-invariant, so the page renders it OUTSIDE
 * `<PlayerSeasonView>`'s swappable subtree: it survives a season swap, and —
 * critically — the 5 MB history file is only ever parsed during the ISR'd
 * render, never on the dynamic season-swap route (spec §3, §8).
 *
 * Null-graceful: a player with no valuations gets no block at all — no empty
 * strip, no "—" — matching how the M70 role block behaves when `role` is null.
 */
export async function PlayerMarketValue({
  playerId,
  plSeasons,
}: {
  playerId: number;
  /** The seasons the app holds a row for — these get the PL underline. */
  plSeasons: number[];
}) {
  const history = await loadMarketValueHistory();
  const points = history?.[String(playerId)];
  if (!points || points.length === 0) return null;

  const seasons = buildMarketValueStrip(points, plSeasons);
  if (seasons.length === 0) return null;

  return <MarketValueBlock seasons={seasons} />;
}
