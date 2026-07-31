import { getTranslations } from "next-intl/server";

import { DataUnavailable } from "@/components/DataUnavailable";
import { ManagerStatHighlights } from "@/features/managers/components/ManagerStatHighlights";
import { ManagersTable } from "@/features/managers/components/ManagersTable";
import { getSeasonManagers } from "@/features/managers/managers-index.api";
import { revealProps } from "@/utils/reveal";
import { formatSeasonLabel } from "@/utils/season";

// TASK-M71b — the season-parameterized managers index (see <TeamsIndex>).
export async function ManagersIndex({ season, locale }: { season: number; locale: string }) {
  const rows = await getSeasonManagers(season);
  const t = await getTranslations("managers");
  const tc = await getTranslations("common");

  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <div {...revealProps()}>
        <h1 className="text-3xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {formatSeasonLabel(season, locale)} · {t("rankedByPoints")}
        </p>
      </div>
      {rows && rows.length > 0 ? (
        <>
          <ManagerStatHighlights rows={rows} />
          <ManagersTable rows={rows} season={season} />
        </>
      ) : (
        <DataUnavailable
          title={t("noData")}
          message={t("noDataMsg")}
          cta={{ href: "/managers", label: tc("viewLatestSeason") }}
        />
      )}
    </main>
  );
}
