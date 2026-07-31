import { getTranslations } from "next-intl/server";

import { loadTeamColors } from "@/data/loaders";
import { FixtureBrowser } from "@/features/leagues/components/FixtureBrowser";
import { groupFixturesByDay } from "@/features/leagues/fixtures-by-day";
import { getSeasonFixtures } from "@/features/leagues/fixtures.api";
import { pickClubAccent } from "@/features/players/players-index.api";
import { localizeDigits } from "@/utils/format";
import { revealProps } from "@/utils/reveal";
import { formatSeasonLabel } from "@/utils/season";

// TASK-M71b — the season-parameterized fixtures index (see <TeamsIndex>).
export async function FixturesIndex({ season, locale }: { season: number; locale: string }) {
  const [fixtures, teamColors, t] = await Promise.all([
    getSeasonFixtures({ season }),
    loadTeamColors(),
    getTranslations("fixtures"),
  ]);
  // Newest matchday first (TASK-M36) — most relevant for browsing a season.
  const groups = fixtures ? groupFixturesByDay(fixtures, { order: "desc", locale }) : [];

  // Per-home-club accent (TASK-1507's picker) for each card's top edge.
  const accentByTeam: Record<number, string | null> = {};
  if (fixtures) {
    for (const fx of fixtures) {
      const id = fx.teams.home.id;
      if (id in accentByTeam) continue;
      const kit = teamColors?.[String(id)];
      accentByTeam[id] = pickClubAccent(kit?.home, kit?.away);
    }
  }

  return (
    <div className="container-page py-6 lg:py-10">
      <header className="mb-6 lg:mb-8" {...revealProps()}>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          {t("pageHeading")} · {formatSeasonLabel(season, locale)}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {fixtures && fixtures.length > 0
            ? t("allMatchesNewest", { count: localizeDigits(fixtures.length, locale) })
            : t("seasonSubtitle")}
        </p>
      </header>

      {groups.length === 0 ? (
        <div className="text-muted-foreground bg-card rounded-md border p-6 text-sm" role="status">
          {t("noFixtures")}
        </div>
      ) : (
        <FixtureBrowser
          groups={groups}
          season={season}
          accentByTeam={accentByTeam}
          totalCount={fixtures?.length ?? 0}
        />
      )}
    </div>
  );
}
