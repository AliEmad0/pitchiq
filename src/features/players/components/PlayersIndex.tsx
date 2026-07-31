import { getTranslations } from "next-intl/server";

import { DataUnavailable } from "@/components/DataUnavailable";
import { PlayersTable } from "@/features/players/components/PlayersTable";
import { TopPlayersStrip } from "@/features/players/components/TopPlayersStrip";
import { getSeasonPlayers } from "@/features/players/players-index.api";
import { localizeDigits } from "@/utils/format";
import { revealProps } from "@/utils/reveal";
import { formatSeasonLabel } from "@/utils/season";

// TASK-M71b — the season-parameterized players index (see <TeamsIndex>).
export async function PlayersIndex({ season, locale }: { season: number; locale: string }) {
  const rows = await getSeasonPlayers(season);
  const t = await getTranslations("players");
  const tc = await getTranslations("common");

  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <div {...revealProps()}>
        <h1 className="text-3xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {formatSeasonLabel(season, locale)} ·{" "}
          {rows
            ? t("playersCount", {
                count: rows.length,
                countFmt: localizeDigits(rows.length, locale),
              })
            : t("rankedBy")}
        </p>
      </div>
      {rows && rows.length > 0 ? (
        <>
          <TopPlayersStrip rows={rows} season={season} />
          <PlayersTable rows={rows} season={season} />
        </>
      ) : (
        <DataUnavailable
          title={t("noData")}
          message={t("noDataMsg")}
          cta={{ href: "/players", label: tc("viewLatestSeason") }}
        />
      )}
    </main>
  );
}
