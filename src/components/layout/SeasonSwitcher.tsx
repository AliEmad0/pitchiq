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
import { useSeason } from "@/hooks/useSeason";
import { usePathname, useRouter } from "@/i18n/navigation";
import { currentDataSeason, formatSeasonLabel } from "@/utils/season";
import { parseSeasonSegment, seasonPath } from "@/utils/season-path";

// Shadcn Select bound to the active season. On the dashboard routes (`/` and
// `/seasons/*`, TASK-M71a) the season lives in the PATH: picking an option
// navigates to `/seasons/<year>` (or `/` for the current season, its only
// URL), and the displayed value derives from the pathname. Everywhere else
// the season is still the `?season=YYYY` query param via `useSeason` —
// picking soft-navigates with `shallow: false`, so every Server Component
// downstream re-fetches against the new season, and picking the current
// season drops the param (clean canonical links). Section indexes move to
// the path form in TASK-M71b; DELETE the query branch when they do.
//
// `seasons` is supplied by the server `<SeasonSwitcherLoader>` from
// `getAvailableSeasons()` (TASK-702) — newest-first — so the dropdown only
// offers seasons that actually have committed data, preventing 404/empty
// states from picking an unsupported year.
export function SeasonSwitcher({ seasons }: { seasons: number[] }) {
  const t = useTranslations("controls");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [season, setSeason] = useSeason();

  const seasonIsInPath = pathname === "/" || pathname.startsWith("/seasons");
  const pathSeason = pathname.startsWith("/seasons/")
    ? parseSeasonSegment(pathname.split("/")[2] ?? "")
    : null;
  const value = seasonIsInPath ? (pathSeason ?? currentDataSeason()) : season;

  return (
    <Select
      value={String(value)}
      onValueChange={(picked) => {
        const next = Number(picked);
        if (!Number.isInteger(next)) return;
        if (seasonIsInPath) {
          router.push(next === currentDataSeason() ? "/" : seasonPath(next));
          return;
        }
        void setSeason(next);
      }}
    >
      {/* Phase 15 redesign: a filled "season chip" — a magenta calendar glyph +
          the season label. Sits far-right in the header after the theme toggle. */}
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
  );
}
