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
import { usePathname, useRouter } from "@/i18n/navigation";
import { currentDataSeason, formatSeasonLabel } from "@/utils/season";
import { seasonFromPathname, seasonNavTarget } from "@/utils/season-path";

// Shadcn Select bound to the active season. Since TASK-M71b every season-bearing
// route lives in the PATH: the dashboard (`/` ↔ `/seasons/<year>`), the seasons
// directory, and the five section indexes (`/teams` ↔ `/seasons/<year>/teams`).
// Picking a season navigates via `seasonNavTarget` (staying in the current
// section, or the season dashboard elsewhere); the displayed value derives from
// the pathname. The old `?season=` query branch is gone — no route reads the
// server `searchParams` prop anymore (except `/compare`, where this switcher is
// hidden). `usePathname`/`useRouter` are next-intl's locale-aware versions: the
// pathname is locale-stripped and `router.push` re-adds the locale.
//
// `seasons` is supplied by the server `<SeasonSwitcherLoader>` from
// `getAvailableSeasons()` (TASK-702) — newest-first — so the dropdown only
// offers seasons that actually have committed data.
export function SeasonSwitcher({ seasons }: { seasons: number[] }) {
  const t = useTranslations("controls");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const current = currentDataSeason();

  const value = seasonFromPathname(pathname) ?? current;

  return (
    <Select
      value={String(value)}
      onValueChange={(picked) => {
        const next = Number(picked);
        if (!Number.isInteger(next)) return;
        router.push(seasonNavTarget(pathname, next, current));
      }}
    >
      {/* Phase 15 redesign: a filled "season chip" — a magenta calendar glyph +
          the season label. Sits far-right in the header after the theme toggle. */}
      <SelectTrigger
        aria-label={t("season")}
        className="ix-glow h-9 gap-1.5 rounded-lg border-transparent bg-secondary px-2.5 text-xs font-medium tabular-nums hover:bg-accent"
      >
        <CalendarDays className="size-4 text-primary" aria-hidden />
        {/* TASK-M80 — below `sm` the chip is the calendar glyph alone. The
            label is 80px of a phone header that is already ~89px over budget
            at 320px, and the chip is the one control here that still reads
            from its icon alone.

            `sr-only`, NOT `hidden`: `display: none` would drop the value out
            of the accessibility tree and the control would announce "Season"
            with no indication of which season it holds. `sr-only` keeps it
            readable to a screen reader while costing no layout width.

            ⚠️ The classes go on a WRAPPER, not on `<SelectValue>` — Radix's
            `Select.Value` renders its own span and silently ignores
            `className`, so styling it directly is a no-op that looks correct
            in review. That also puts it out of reach of the trigger's
            `*:data-[slot=select-value]` rules (line-clamp/flex/gap), which
            only ever mattered for multi-part values; this one is a year. */}
        <span className="sr-only items-center sm:not-sr-only sm:flex">
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {seasons.map((s) => (
          <SelectItem key={s} value={String(s)} className="text-xs tabular-nums">
            {formatSeasonLabel(s, locale)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
