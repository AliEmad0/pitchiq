import { useLocale, useTranslations } from "next-intl";
import { Briefcase, Sigma, Trophy, TrendingUp } from "lucide-react";

import type { ManagerEnrichmentSummary } from "@/data/schemas";
import { localizeDigits } from "@/utils/format";
import { revealProps } from "@/utils/reveal";

/**
 * TASK-M81 — the whole career in four numbers, above the league-specific detail.
 *
 * Deliberately the FULL career, not the Premier League slice: the sections below
 * already answer "what did he do here", and this answers "who is he". Renders
 * nothing for a manager with no enrichment (153 of 293), so the page is
 * unchanged for them rather than showing a row of dashes.
 */
export function ManagerCareerSummary({ summary }: { summary: ManagerEnrichmentSummary | null }) {
  const t = useTranslations("managers");
  const locale = useLocale();
  if (!summary) return null;

  const tiles = [
    { key: "trophies", icon: Trophy, label: t("statTrophies"), value: summary.trophies },
    { key: "clubs", icon: Briefcase, label: t("statClubs"), value: summary.clubsManaged },
    { key: "matches", icon: Sigma, label: t("statMatches"), value: summary.careerMatches },
    {
      key: "ppm",
      icon: TrendingUp,
      label: t("statPpm"),
      // null when there is no record anywhere — an em dash, never a fabricated 0.
      value: summary.careerPpm,
      format: (v: number) => v.toFixed(2),
    },
  ] as const;

  return (
    <section
      aria-label={t("careerSummary")}
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      {...revealProps()}
    >
      {tiles.map((tile, i) => {
        const Icon = tile.icon;
        const shown =
          tile.value === null
            ? "—"
            : localizeDigits(
                "format" in tile && tile.format ? tile.format(tile.value) : tile.value,
                locale,
              );
        return (
          <div key={tile.key} className="bg-card rounded-lg border p-3 sm:p-4" {...revealProps(i)}>
            <div className="text-muted-foreground flex items-center gap-1.5">
              <Icon className="size-3.5" aria-hidden />
              <p className="text-[11px] font-semibold tracking-wide uppercase">{tile.label}</p>
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">{shown}</p>
          </div>
        );
      })}
    </section>
  );
}
