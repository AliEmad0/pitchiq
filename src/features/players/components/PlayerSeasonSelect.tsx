"use client";

import { useLocale, useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatSeasonLabel } from "@/utils/season";

// Controlled season dropdown for the player detail page. Unlike the global
// <SeasonSwitcher> (which binds the URL via `useSeason` with `shallow:false`,
// triggering an RSC refetch), this reports changes to its parent
// <PlayerSeasonView>, which swaps the data client-side. A single-season player
// renders a static label instead of a pointless one-item dropdown.
export function PlayerSeasonSelect({
  seasons,
  value,
  onChange,
}: {
  seasons: number[];
  value: number;
  onChange: (season: number) => void;
}) {
  const t = useTranslations("controls");
  const locale = useLocale();

  if (seasons.length === 0) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-muted-foreground text-xs font-medium">{t("season")}</span>
      {seasons.length === 1 ? (
        <span className="text-sm font-medium tabular-nums">
          {formatSeasonLabel(seasons[0], locale)}
        </span>
      ) : (
        <Select
          value={String(value)}
          onValueChange={(v) => {
            const next = Number(v);
            if (Number.isInteger(next)) onChange(next);
          }}
        >
          <SelectTrigger
            aria-label={t("season")}
            className="ix-glow h-9 gap-1.5 rounded-lg border-transparent bg-secondary px-2.5 text-xs font-medium tabular-nums hover:bg-accent"
          >
            <CalendarDays className="size-4 text-primary" aria-hidden />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {seasons.map((s) => (
              <SelectItem key={s} value={String(s)} className="text-xs tabular-nums">
                {formatSeasonLabel(s, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
