import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { loadMarketValueHistory } from "@/data/loaders";
import { buildMarketValueStrip } from "@/features/players/market-value";

import { MarketValueStrip } from "./MarketValueStrip";
import styles from "./MarketValueStrip.module.css";

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

  const t = await getTranslations("players");

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
        {t("marketValue")}
      </h2>
      <MarketValueStrip seasons={seasons} />
      <p className={`${styles.legend} mt-3`}>
        <span className={styles.legendMark} aria-hidden />
        {t("mvPlLegend")}
      </p>
    </Card>
  );
}
