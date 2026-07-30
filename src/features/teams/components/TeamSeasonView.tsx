"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";

import { DataUnavailable } from "@/components/DataUnavailable";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerSeasonSelect } from "@/features/players/components/PlayerSeasonSelect";
import type { Fixture, SquadPlayer, TeamDetail, TeamStats } from "@/types/api";
import type { ManagerProfile } from "@/features/teams/managers.api";
import { ManagerSection } from "@/features/teams/components/ManagerSection";
import { RecentFormStrip } from "@/features/teams/components/RecentFormStrip";
import { SquadGrid } from "@/features/teams/components/SquadGrid";
import { TeamHero } from "@/features/teams/components/TeamHero";
import { TeamStatsTiles } from "@/features/teams/components/TeamStatsTiles";
import { teamSeasonViewUrl, teamTriviaUrl } from "@/features/teams/season-url";
import { TriviaCard } from "@/features/trivia/components/TriviaCard";
import type { TriviaFact } from "@/features/trivia/types";
import { formatSeasonLabel } from "@/utils/season";

// Client season swap for /teams/[id] (TASK-M71c) — the PlayerSeasonView
// pattern; read that file's comments, they all apply here.
//
// The INITIAL season's content is server-rendered and passed in as `hero` +
// `children` (RSC slots, not re-executed on the client), which keeps the page
// statically prerenderable — the Vercel Active-CPU fix. Only when the user
// picks a DIFFERENT season (or lands on a `?season=` deep link) do we fetch
// that season from /api/teams/[id]/season-view (+ /api/trivia) and swap.
// Season syncs to the URL via window.location + history.pushState — NEVER
// useSearchParams (that would bail static prerender; see CLAUDE.md).
type SwapPayload = {
  detail: TeamDetail;
  rank: number | null;
  managers: ManagerProfile[];
  stats: TeamStats | null;
  fixtures: Fixture[];
  squad: SquadPlayer[] | null;
};

export function TeamSeasonView({
  teamId,
  seasons,
  initialSeason,
  teamName,
  hero,
  children,
}: {
  teamId: number;
  /** Seasons the club actually appeared in — newest-first (findTeamSeasons). */
  seasons: number[];
  initialSeason: number;
  teamName: string;
  /** The server-rendered <TeamHero> for the initial season. */
  hero: ReactNode;
  /** The server-rendered season sections for the initial season. */
  children: ReactNode;
}) {
  const t = useTranslations("teams");
  const locale = useLocale();

  const [season, setSeason] = useState(initialSeason);
  const [swapped, setSwapped] = useState<{ view: SwapPayload | null; facts: TriviaFact[] } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  // Honour a `?season=` deep link on mount (client-only; runs AFTER hydration
  // so it never causes a mismatch).
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
      const [vRes, tRes] = await Promise.all([
        fetch(teamSeasonViewUrl(teamId, season, locale)),
        fetch(teamTriviaUrl(teamId, season)),
      ]);
      if (cancelled) return;
      const view = vRes.ok ? ((await vRes.json()) as SwapPayload) : null;
      const facts = tRes.ok ? ((await tRes.json()).facts as TriviaFact[]) : [];
      if (cancelled) return;
      setSwapped({ view, facts });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [season, initialSeason, teamId, locale]);

  function changeSeason(next: number) {
    setSeason(next);
    // Shallow URL sync (Next 15 supports history.pushState) — no RSC refetch.
    const path = window.location.pathname;
    window.history.pushState(null, "", next === initialSeason ? path : `${path}?season=${next}`);
  }

  const swapping = season !== initialSeason;
  const view = swapped?.view ?? null;

  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <PlayerSeasonSelect seasons={seasons} value={season} onChange={changeSeason} />

      {!swapping ? (
        <>
          {hero}
          {children}
        </>
      ) : loading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : view ? (
        <>
          <TeamHero team={view.detail.team} venue={view.detail.venue} rank={view.rank} />
          <ManagerSection managers={view.managers} season={season} />
          {view.stats ? (
            <TeamStatsTiles stats={view.stats} />
          ) : (
            <p className="text-muted-foreground text-sm">{t("statsUnavailable")}</p>
          )}
          <RecentFormStrip fixtures={view.fixtures} teamId={teamId} />
          {view.squad && view.squad.length > 0 ? (
            <SquadGrid players={view.squad} season={season} />
          ) : (
            <DataUnavailable
              title={t("squadUnavailable")}
              message={t("squadUnavailableMsg", { season: formatSeasonLabel(season, locale) })}
            />
          )}
          {swapped && swapped.facts.length > 0 && <TriviaCard facts={swapped.facts} />}
        </>
      ) : (
        <DataUnavailable
          title={t("noSeasonData", { season: formatSeasonLabel(season, locale), name: teamName })}
          message={t("noSeasonDataMsg", {
            name: teamName,
            season: formatSeasonLabel(season, locale),
            latest: formatSeasonLabel(seasons[0], locale),
          })}
          cta={{
            href: `/teams/${teamId}?season=${seasons[0]}`,
            label: t("viewSeasonStats", { season: formatSeasonLabel(seasons[0], locale) }),
          }}
        />
      )}
    </main>
  );
}
