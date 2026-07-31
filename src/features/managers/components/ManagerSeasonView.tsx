"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";

import { DataUnavailable } from "@/components/DataUnavailable";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerSeasonSelect } from "@/features/players/components/PlayerSeasonSelect";
import { ManagerCareerTable } from "@/features/managers/components/ManagerCareerTable";
import { ManagerHero } from "@/features/managers/components/ManagerHero";
import { ManagerHonours } from "@/features/managers/components/ManagerHonours";
import type { ManagerProfile } from "@/features/managers/manager-profile.api";
import { managerProfileUrl } from "@/features/managers/season-url";
import { formatSeasonLabel } from "@/utils/season";

// Client season swap for /managers/[id] (TASK-M71c) — the PlayerSeasonView
// pattern; see TeamSeasonView for the port notes. The manager's whole season
// subtree (hero, honours, career table) comes from one ManagerProfile payload,
// so the swap is a single fetch + re-render. Season syncs to the URL via
// window.location + history.pushState — NEVER useSearchParams.
export function ManagerSeasonView({
  managerId,
  seasons,
  initialSeason,
  managerName,
  children,
}: {
  managerId: string;
  /** PL seasons the manager actually managed — newest-first. */
  seasons: number[];
  initialSeason: number;
  managerName: string;
  /** The server-rendered season subtree for the initial season. */
  children: ReactNode;
}) {
  const t = useTranslations("managers");
  const locale = useLocale();

  const [season, setSeason] = useState(initialSeason);
  const [swapped, setSwapped] = useState<ManagerProfile | null>(null);
  const [loading, setLoading] = useState(false);

  // Honour a `?season=` deep link on mount (client-only, post-hydration).
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("season");
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isInteger(parsed) && parsed !== initialSeason) setSeason(parsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (season === initialSeason) {
      setSwapped(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const res = await fetch(managerProfileUrl(managerId, season, locale));
      if (cancelled) return;
      const profile = res.ok ? ((await res.json()).profile as ManagerProfile) : null;
      if (cancelled) return;
      setSwapped(profile);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [season, initialSeason, managerId, locale]);

  function changeSeason(next: number) {
    setSeason(next);
    const path = window.location.pathname;
    window.history.pushState(null, "", next === initialSeason ? path : `${path}?season=${next}`);
  }

  const swapping = season !== initialSeason;

  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <PlayerSeasonSelect seasons={seasons} value={season} onChange={changeSeason} />

      {!swapping ? (
        children
      ) : loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : swapped ? (
        <>
          <ManagerHero profile={swapped} />
          <ManagerHonours honours={swapped.honours} season={season} />
          <ManagerCareerTable
            byClub={swapped.byClub}
            season={season}
            highlightSeason={swapped.targetSeason?.season ?? null}
          />
        </>
      ) : (
        <DataUnavailable
          title={t("noSeasonData", {
            season: formatSeasonLabel(season, locale),
            name: managerName,
          })}
          message={t("noSeasonDataMsg", {
            name: managerName,
            season: formatSeasonLabel(season, locale),
            latest: formatSeasonLabel(seasons[0], locale),
          })}
        />
      )}
    </main>
  );
}
