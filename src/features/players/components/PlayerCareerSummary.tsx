import { useLocale, useTranslations } from "next-intl";
import { Award, Globe, Trophy, Wallet } from "lucide-react";

import type { PlayerEnrichment } from "@/types/api";
import { localizeDigits } from "@/utils/format";
import { revealProps } from "@/utils/reveal";

/**
 * TASK-M93 — the career summary that was already on every player row and read by
 * nothing. The mirror of `<ManagerCareerSummary>` (TASK-M81), deliberately: the
 * two pages should answer "who is this" the same way.
 *
 * Like that component it renders **nothing** when there is no enrichment, so an
 * unenriched row shows an unchanged page rather than a row of dashes.
 *
 * ⚠️ `caps` / `internationalGoals` are nullable and null means **unknown**, not
 * zero — a tile shows an em dash rather than inventing a 0. `trophies` is
 * silverware only (participation and runner-up groups are excluded upstream), so
 * a player with honours but no silverware correctly reads 0 trophies.
 */
export function PlayerCareerSummary({ enrichment }: { enrichment: PlayerEnrichment | null }) {
  const t = useTranslations("players");
  const locale = useLocale();
  if (!enrichment) return null;

  const tiles = [
    { key: "trophies", icon: Trophy, label: t("statTrophies"), value: enrichment.trophies },
    { key: "caps", icon: Globe, label: t("statCaps"), value: enrichment.caps },
    { key: "awards", icon: Award, label: t("statAwards"), value: enrichment.awards },
    { key: "fee", icon: Wallet, label: t("statCareerFee"), value: enrichment.careerFee },
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
          tile.value === null || tile.value === undefined
            ? "—"
            : typeof tile.value === "number"
              ? localizeDigits(tile.value, locale)
              : // careerFee is a pre-formatted display string ("€52.60m"); only
                // its digits are localized, never the currency symbol.
                localizeDigits(tile.value, locale);
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

/**
 * The compact inline variant for dense surfaces (the squad card, a compare
 * column) — trophies + caps only, which is what TASK-M93 asked for. Renders
 * nothing when the row is unenriched, and skips a metric whose value is unknown.
 */
export function PlayerHonoursInline({
  enrichment,
  className,
}: {
  enrichment: PlayerEnrichment | null;
  className?: string;
}) {
  const t = useTranslations("players");
  const locale = useLocale();
  if (!enrichment) return null;

  const parts: Array<{ key: string; icon: typeof Trophy; value: number; label: string }> = [];
  if (enrichment.trophies > 0)
    parts.push({
      key: "trophies",
      icon: Trophy,
      value: enrichment.trophies,
      label: t("statTrophies"),
    });
  if (enrichment.caps !== null && enrichment.caps > 0)
    parts.push({ key: "caps", icon: Globe, value: enrichment.caps, label: t("statCaps") });

  // Nothing worth a badge (no silverware, uncapped or unknown) → render nothing
  // rather than a row of zeros on every squad card.
  if (parts.length === 0) return null;

  return (
    <p className={className}>
      {parts.map(({ key, icon: Icon, value, label }) => (
        <span key={key} className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          <Icon className="size-3" aria-hidden />
          <span className="tabular-nums">{localizeDigits(value, locale)}</span>
          <span className="sr-only">{label}</span>
        </span>
      ))}
    </p>
  );
}
