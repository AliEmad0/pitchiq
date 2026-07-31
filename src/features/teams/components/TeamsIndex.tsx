import { Shield } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { loadTeamColors } from "@/data/loaders";
import { TeamFilter } from "@/features/teams/components/TeamFilter";
import { getPLTeams } from "@/features/teams/api";
import { revealProps } from "@/utils/reveal";
import { formatSeasonLabel } from "@/utils/season";

// TASK-M71b — the season-parameterized teams index, shared by the bare
// /teams page (current season, force-static) and /seasons/<year>/teams. The
// season is a prop, NOT read from searchParams — reading searchParams would
// opt the route into dynamic rendering (the 2026-07 Active-CPU regression).
export async function TeamsIndex({ season, locale }: { season: number; locale: string }) {
  const t = await getTranslations("teams");
  const [teams, teamColors] = await Promise.all([getPLTeams(season), loadTeamColors()]);

  if (!teams || teams.length === 0) {
    return (
      <main className="container-page py-6 lg:py-10">
        <h1 className="text-3xl font-semibold tracking-tight">{t("clubs")}</h1>
        <p className="text-muted-foreground mt-4 text-sm">{t("listUnavailable")}</p>
      </main>
    );
  }

  const colors: Record<number, string> = {};
  if (teamColors) {
    for (const [id, c] of Object.entries(teamColors)) colors[Number(id)] = c.home;
  }

  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <header {...revealProps()}>
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <Shield className="text-primary size-7" aria-hidden />
          {t("clubs")}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("everyClub", { season: formatSeasonLabel(season, locale) })}
        </p>
      </header>
      <TeamFilter teams={teams} season={season} colors={colors} />
    </main>
  );
}
