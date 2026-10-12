import { useTranslations } from "next-intl";

import { Card } from "@/components/ui/card";
import type { MarketValueSeason } from "@/features/players/market-value";

import { MarketValueStrip } from "./MarketValueStrip";
import styles from "./MarketValueStrip.module.css";

/**
 * The career market-value card, presentational only (TASK-M96 PR B).
 *
 * Split out of the async `PlayerMarketValue` so the archived-player shell can render the SAME
 * block from its prerendered JSON: the server page still computes the strip (it reads the 5 MB
 * history file at prerender) and hands it here, the shell hands it the strip baked into the
 * archive file. No `"use client"` and no server API, so both sides can render it.
 */
export function MarketValueBlock({ seasons }: { seasons: MarketValueSeason[] }) {
  const t = useTranslations("players");
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
