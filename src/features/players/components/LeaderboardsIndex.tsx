import { getTranslations } from "next-intl/server";

import { DataUnavailable } from "@/components/DataUnavailable";
import { loadPlayers } from "@/data/loaders";
import { StatLeaderboard } from "@/features/players/components/StatLeaderboard";
import { buildBoards } from "@/features/players/leaderboards-index";
import { revealProps } from "@/utils/reveal";
import { formatSeasonLabel } from "@/utils/season";

// TASK-M71b — the season-parameterized leaderboards index (see <TeamsIndex>).
export async function LeaderboardsIndex({ season, locale }: { season: number; locale: string }) {
  const players = await loadPlayers(season);
  const boards = players ? buildBoards(players) : [];
  const t = await getTranslations("leaderboard");
  const tc = await getTranslations("common");
  const tp = await getTranslations("players");

  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <div {...revealProps()}>
        <h1 className="text-3xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{formatSeasonLabel(season, locale)}</p>
      </div>
      {boards.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map(({ cat, rows }) => (
            <StatLeaderboard
              key={cat.key}
              title={t(cat.titleKey)}
              valueLabel={t(cat.valueLabelKey)}
              entries={rows}
              accent={cat.accent}
              season={season}
              limit={10}
              variant="badge"
            />
          ))}
        </div>
      ) : (
        <DataUnavailable
          title={t("noData2")}
          message={tp("noDataMsg")}
          cta={{ href: "/leaderboards", label: tc("viewLatestSeason") }}
        />
      )}
    </main>
  );
}
