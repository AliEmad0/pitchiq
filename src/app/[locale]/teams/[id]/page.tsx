import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { teamOgImagePath } from "@/app/api/og/team-card";
import { EntitySeasonSwitcher } from "@/components/layout/EntitySeasonSwitcher";
import { findTeamSeasons } from "@/data/loaders";
import { getStandings } from "@/features/leagues/api";
import { ManagerSectionLoader } from "@/features/teams/components/ManagerSectionLoader";
import { RecentFormSection } from "@/features/teams/components/RecentFormSection";
import { RecentFormStripSkeleton } from "@/features/teams/components/RecentFormStrip";
import { SquadGridSkeleton } from "@/features/teams/components/SquadGrid";
import { SquadSection } from "@/features/teams/components/SquadSection";
import { TeamHero } from "@/features/teams/components/TeamHero";
import { TeamStatsSection } from "@/features/teams/components/TeamStatsSection";
import { TeamStatsTilesSkeleton } from "@/features/teams/components/TeamStatsTiles";
import { getPLTeams, getTeam } from "@/features/teams/api";
import { TriviaSection } from "@/features/trivia/components/TriviaSection";
import { currentDataSeason, parseSeason } from "@/utils/season";
import { canonicalPath } from "@/utils/canonical";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ season?: string | string[] }>;
};

// Non-PL ids (or PL teams from older seasons) render on-demand rather than
// 404'ing at the routing layer — the page itself returns notFound() when
// `getTeam` resolves to null, so misses still hit `not-found.tsx`.
export const dynamicParams = true;

// ISR: refresh cached renders daily, matching the data cron.
//
// ⚠️ HOSTING COST — this route is NOT prerendered, and adding
// `dynamic = "force-static"` will NOT fix that. Do not add it.
//
// This page reads the server `searchParams` prop (`?season=`, below), which
// opts it into dynamic rendering because it needs an incoming request.
// `force-static` does not override that: its documented coercion covers
// `cookies()`, `headers()` and `useSearchParams()` — NOT the `searchParams`
// prop. Measured on this build: /players and /fixtures emit 537 and 380
// prerendered pages per locale; this route and /managers emit ZERO, while the
// build's route table still prints "● (SSG)" for all four. So every /teams/*
// view costs a function invocation.
//
// The real fix is the one /players/[id] already had: stop reading `?season=`
// server-side and move season switching client-side (<PlayerSeasonView>).
// That is a feature-sized change — tracked separately. See docs/hosting-cost.md.
export const revalidate = 86400;

// `pnpm build` calls this once and pre-renders every returned id as an
// SSG route. The 20 current-season PL teams are bounded enough that SSG
// pays off; older seasons fall through to dynamic rendering under the
// `dynamicParams = true` opt-in above.
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const teams = await getPLTeams(currentDataSeason());
  if (!teams) return [];
  return teams.map((entry) => ({ id: String(entry.team.id) }));
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ locale, id }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const teamId = Number(id);
  const tNotFound = await getTranslations("notFound");
  if (!Number.isInteger(teamId)) return { title: tNotFound("teamTitle") };
  const season = parseSeason(sp.season, currentDataSeason());
  const detail = await getTeam(teamId, season);
  if (!detail) return { title: tNotFound("teamTitle") };
  // Dynamic OG (TASK-M53): season-pinned neon (modern/golden) or dossier
  // (retro) card. Relative url resolves against the layout's metadataBase.
  const url = teamOgImagePath(teamId, season);
  const t = await getTranslations("teams");
  return {
    title: detail.team.name,
    alternates: { canonical: canonicalPath(locale, `/teams/${teamId}`, season) },
    openGraph: {
      images: [{ url, width: 1200, height: 630, alt: t("teamOgAlt", { name: detail.team.name }) }],
    },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function TeamProfilePage({ params, searchParams }: Props) {
  const [{ locale, id }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const teamId = Number(id);
  if (!Number.isInteger(teamId)) notFound();

  // URL `?season=` drives every per-season fetch — rank in standings, season
  // stats, recent fixtures, AND (since TASK-701) the team detail + squad, so
  // historical-only clubs resolve when browsing past seasons.
  const season = parseSeason(sp.season, currentDataSeason());

  // Parallel because all three calls are independent — saves round-trips on
  // cold-cache. `getStandings` failing (null) is recoverable: the hero just
  // renders without a rank badge. `teamSeasons` scopes the page-local season
  // switcher (TASK-M10) to only the seasons the club existed.
  const [detail, standings, teamSeasons] = await Promise.all([
    getTeam(teamId, season),
    getStandings({ season }),
    findTeamSeasons(teamId),
  ]);
  if (!detail) notFound();

  const rank = standings?.league.standings[0]?.find((row) => row.team.id === teamId)?.rank ?? null;

  // Each secondary section streams under its own Suspense boundary so
  // the hero doesn't block on any of them.
  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <EntitySeasonSwitcher seasons={teamSeasons} />
      <TeamHero team={detail.team} venue={detail.venue} rank={rank} />
      <Suspense fallback={null}>
        <ManagerSectionLoader teamId={teamId} season={season} />
      </Suspense>
      <Suspense fallback={<TeamStatsTilesSkeleton />}>
        <TeamStatsSection teamId={teamId} season={season} />
      </Suspense>
      <Suspense fallback={<RecentFormStripSkeleton />}>
        <RecentFormSection teamId={teamId} season={season} />
      </Suspense>
      <Suspense fallback={<SquadGridSkeleton />}>
        <SquadSection teamId={teamId} season={season} />
      </Suspense>
      <Suspense fallback={null}>
        <TriviaSection scope="team" id={teamId} season={season} />
      </Suspense>
    </main>
  );
}
