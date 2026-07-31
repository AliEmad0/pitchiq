import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { teamOgImagePath } from "@/app/api/og/team-card";
import { findTeamSeasons, getAvailableSeasons, loadTeams } from "@/data/loaders";
import { getStandings } from "@/features/leagues/api";
import { ManagerSectionLoader } from "@/features/teams/components/ManagerSectionLoader";
import { RecentFormSection } from "@/features/teams/components/RecentFormSection";
import { RecentFormStripSkeleton } from "@/features/teams/components/RecentFormStrip";
import { SquadGridSkeleton } from "@/features/teams/components/SquadGrid";
import { SquadSection } from "@/features/teams/components/SquadSection";
import { TeamHero } from "@/features/teams/components/TeamHero";
import { TeamSeasonView } from "@/features/teams/components/TeamSeasonView";
import { TeamStatsSection } from "@/features/teams/components/TeamStatsSection";
import { TeamStatsTilesSkeleton } from "@/features/teams/components/TeamStatsTiles";
import { getTeam } from "@/features/teams/api";
import { TriviaSection } from "@/features/trivia/components/TriviaSection";
import { currentDataSeason } from "@/utils/season";
import { canonicalPath } from "@/utils/canonical";

type Props = { params: Promise<{ locale: string; id: string }> };

// ⚠️ HOSTING COST — force-static is load-bearing (TASK-M71c). This route must
// NEVER read the server `searchParams` prop again: that opts it into dynamic
// rendering, `force-static` does NOT override it, and the route then emits
// ZERO prerendered pages while the build's route table still prints "● (SSG)"
// (the 2026-07 Active-CPU pause). Season switching is client-side in
// <TeamSeasonView>; `?season=` deep links are honoured on the client. See
// docs/hosting-cost.md.
export const dynamic = "force-static";
export const revalidate = 86400;
// Ids outside the prerendered set (e.g. a future data refresh adds a club)
// render on demand; the page still notFound()s ids in no committed season.
export const dynamicParams = true;

// Every club that ever appeared in a committed season gets a prerendered page
// (the union across all 34 seasons — historical clubs included), not just the
// current 20. Bounded (~50 clubs × 2 locales) and read from local JSON.
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const seasons = await getAvailableSeasons();
  const ids = new Set<number>();
  for (const season of seasons) {
    for (const t of (await loadTeams(season)) ?? []) ids.add(t.id);
  }
  return [...ids].map((id) => ({ id: String(id) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const teamId = Number(id);
  const tNotFound = await getTranslations("notFound");
  if (!Number.isInteger(teamId)) return { title: tNotFound("teamTitle") };

  const teamSeasons = await findTeamSeasons(teamId);
  if (teamSeasons.length === 0) return { title: tNotFound("teamTitle") };
  const initialSeason = teamSeasons.includes(currentDataSeason())
    ? currentDataSeason()
    : teamSeasons[0];
  const detail = await getTeam(teamId, initialSeason);
  if (!detail) return { title: tNotFound("teamTitle") };

  // Dynamic OG (TASK-M53), pinned to the initial (server-rendered) season.
  const url = teamOgImagePath(teamId, initialSeason);
  const t = await getTranslations("teams");
  return {
    title: detail.team.name,
    // Season-less canonical: one indexable URL per club (the /players/[id]
    // precedent, PR #59). `?season=` variants are robots-blocked anyway.
    alternates: { canonical: canonicalPath(locale, `/teams/${teamId}`) },
    openGraph: {
      images: [{ url, width: 1200, height: 630, alt: t("teamOgAlt", { name: detail.team.name }) }],
    },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function TeamProfilePage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const teamId = Number(id);
  if (!Number.isInteger(teamId)) notFound();

  // Existence first (bounded standings scan) — decided before anything
  // streams, so unknown ids are REAL 404s (TASK-M72). A historical-only club
  // renders its latest played season at its bare URL instead of 404ing.
  const teamSeasons = await findTeamSeasons(teamId);
  if (teamSeasons.length === 0) notFound();
  const initialSeason = teamSeasons.includes(currentDataSeason())
    ? currentDataSeason()
    : teamSeasons[0];

  // `getStandings` failing (null) is recoverable: the hero renders without a
  // rank badge.
  const [detail, standings] = await Promise.all([
    getTeam(teamId, initialSeason),
    getStandings({ season: initialSeason }),
  ]);
  if (!detail) notFound();

  const rank = standings?.league.standings[0]?.find((row) => row.team.id === teamId)?.rank ?? null;

  // The <main> wrapper + season control live inside <TeamSeasonView>; each
  // secondary section still streams under its own Suspense boundary for the
  // server-rendered initial season.
  return (
    <TeamSeasonView
      teamId={teamId}
      seasons={teamSeasons}
      initialSeason={initialSeason}
      teamName={detail.team.name}
      hero={<TeamHero team={detail.team} venue={detail.venue} rank={rank} />}
    >
      <Suspense fallback={null}>
        <ManagerSectionLoader teamId={teamId} season={initialSeason} />
      </Suspense>
      <Suspense fallback={<TeamStatsTilesSkeleton />}>
        <TeamStatsSection teamId={teamId} season={initialSeason} />
      </Suspense>
      <Suspense fallback={<RecentFormStripSkeleton />}>
        <RecentFormSection teamId={teamId} season={initialSeason} />
      </Suspense>
      <Suspense fallback={<SquadGridSkeleton />}>
        <SquadSection teamId={teamId} season={initialSeason} />
      </Suspense>
      <Suspense fallback={null}>
        <TriviaSection scope="team" id={teamId} season={initialSeason} />
      </Suspense>
    </TeamSeasonView>
  );
}
