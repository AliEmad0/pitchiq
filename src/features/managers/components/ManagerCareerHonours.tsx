import { useLocale, useTranslations } from "next-intl";
import { Medal, Trophy } from "lucide-react";

import type { ManagerHonourGroup } from "@/data/schemas";
import { localizeDigits } from "@/utils/format";
import { revealProps } from "@/utils/reveal";

/**
 * TASK-M81 — every trophy of a manager's career, not just the ones won here.
 *
 * The section above it shows league titles derived from our own standings, which
 * by definition stops at this competition's edge; this is the full cabinet —
 * European cups and foreign leagues included. Mourinho reads 3 titles there and
 * 26 trophies here.
 *
 * Silverware gets the gold trophy card of the existing honours section (the
 * design language chosen for this page in TASK-1510); individual awards sit
 * below as quieter pills so they can never be mistaken for a trophy count.
 * `orderHonourGroups` has already dropped participation and runner-up entries.
 */
export function ManagerCareerHonours({ groups }: { groups: ManagerHonourGroup[] }) {
  const t = useTranslations("managers");
  const locale = useLocale();
  if (groups.length === 0) return null;

  const trophies = groups.filter((g) => g.kind === "trophy");
  const awards = groups.filter((g) => g.kind === "award");

  // Transfermarkt season labels are source-form ("25/26", "2019") — shown
  // verbatim, digits localized, never re-parsed into our own season model.
  const seasonsOf = (g: ManagerHonourGroup) =>
    g.entries
      .map((e) => e.season)
      .filter(Boolean)
      .map((s) => localizeDigits(s, locale))
      .join(" · ");

  return (
    <section aria-label={t("careerHonours")} className="space-y-3" {...revealProps()}>
      <h2 className="text-sm font-semibold tracking-tight">{t("careerHonours")}</h2>

      {trophies.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {trophies.map((g, i) => (
            <li key={g.title} {...revealProps(i)}>
              <div className="bg-card flex h-full flex-col items-center gap-1 rounded-xl border border-t-[3px] border-t-amber-400 p-4 text-center">
                <Trophy className="size-7 text-amber-500" aria-hidden />
                <p className="mt-1 text-lg font-bold tabular-nums">
                  {localizeDigits(g.count, locale)}
                  <span className="text-muted-foreground ms-0.5 text-sm font-semibold">×</span>
                </p>
                <p className="text-sm leading-tight font-semibold text-balance">{g.title}</p>
                {g.entries.length > 0 && (
                  <p className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
                    {seasonsOf(g)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {awards.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
            {t("individualAwards")}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {awards.map((g) => (
              <li
                key={g.title}
                className="bg-card text-muted-foreground flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
              >
                <Medal className="size-3.5 shrink-0 text-slate-400" aria-hidden />
                <span className="text-foreground font-semibold tabular-nums">
                  {localizeDigits(g.count, locale)}×
                </span>
                <span>{g.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
