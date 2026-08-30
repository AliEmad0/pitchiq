import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { fixtureOgImagePath } from "@/app/api/og/fixture-card";
import { getAvailableSeasons, loadFixtures } from "@/data/loaders";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventsUnavailable } from "@/features/leagues/components/EventsUnavailable";
import { EventTimeline } from "@/features/leagues/components/EventTimeline";
import { FixtureHeader } from "@/features/leagues/components/FixtureHeader";
import { LineupUnavailable } from "@/features/leagues/components/LineupUnavailable";
import { PitchLineup } from "@/features/leagues/components/PitchLineup";
import { StatComparison } from "@/features/leagues/components/StatComparison";
import { getFixtureDetail } from "@/features/leagues/fixture-detail.api";
import { revealProps } from "@/utils/reveal";
import { currentDataSeason, seasonFromFixtureId } from "@/utils/season";
import { canonicalPath } from "@/utils/canonical";

type Props = { params: Promise<{ locale: string; id: string }> };

// ⛔ FALSE, and load-bearing (TASK-1843, measured 2026-08-30).
//
// The comment that stood here said the historical fixture paths were "pages nobody links to".
// That was true when it was written and TASK-M71b (PR #74) silently made it FALSE:
// `/seasons/<year>/fixtures` renders a <FixtureBrowser> for all 34 seasons, and every row of
// it links to `/fixtures/<id>`. So ~12,786 historical fixtures per locale became reachable
// while still unbuilt, and with `dynamicParams = true` each first request bought a Node render
// AND an ISR cache write. A scraper walked the archive season by season on 29-30 Aug — the
// firewall's own denial log caught it on /fixtures/1992-08-25-LEE-TOT through
// /fixtures/2021-04-18-MUN-BUR — and wrote 145,000 of the 200,000 monthly units in two days.
export const dynamicParams = false;
// ⚠️ HOSTING COST — `force-static` is load-bearing; see docs/hosting-cost.md.
// `revalidate` alone lets the render fall back to dynamic (`private, no-store`
// + x-vercel-cache MISS), which made every page view cost a function.
export const dynamic = "force-static";
export const revalidate = false; // see docs/adr or CLAUDE.md — deploys are the only data change

// ⭐ Every fixture of every season — the whole archive, ~13,166 of them. This is the single
// biggest block of pages in the build (~26,000 across both locales), so it is also the first
// thing to trim if the build ever approaches the Hobby ceiling. Trim it by SEASON RANGE, never
// by flipping `dynamicParams` back on: an unbuilt path that something links to is exactly the
// shape that caused the incident this replaced.
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const ids: Array<{ id: string }> = [];
  for (const season of await getAvailableSeasons()) {
    for (const f of (await loadFixtures(season)) ?? []) ids.push({ id: f.id });
  }
  return ids;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("fixtures");
  const detail = await getFixtureDetail(id);
  if (!detail) return { title: t("fixtureNotFound") };

  const { home, away } = detail.fixture.teams;
  const { home: gh, away: ga } = detail.fixture.goals;
  const scoreOrVs = gh !== null && ga !== null ? `${gh}–${ga}` : t("vs");
  // Dynamic OG (matchday ticket, TASK-M53): the route derives the season from
  // the fixture id, so the path only needs the id.
  const url = fixtureOgImagePath(id);
  return {
    title: `${home.name} ${scoreOrVs} ${away.name}`,
    alternates: { canonical: canonicalPath(locale, `/fixtures/${id}`) },
    openGraph: {
      images: [
        {
          url,
          width: 1200,
          height: 630,
          alt: t("matchOgAlt", { home: home.name, away: away.name }),
        },
      ],
    },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function FixtureDetailPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("fixtures");

  const detail = await getFixtureDetail(id);
  if (!detail) notFound();

  // M21: the fixture's own season, carried onto player/manager links.
  const season = seasonFromFixtureId(id) ?? currentDataSeason();
  const hasLineups = detail.lineups.length > 0;
  const hasEvents = detail.events.length > 0;
  // Lineups is the default tab when we have them; otherwise fall back to Stats
  // (the only tab guaranteed to have content for uncovered fixtures).
  const defaultTab = hasLineups ? "lineups" : "stats";

  return (
    <div className="container-page py-6 lg:py-10">
      <FixtureHeader fixture={detail.fixture} />

      <Tabs defaultValue={defaultTab} className="mt-6">
        {/* TASK-1512 — pill tabs: rounded, the active one filled in the era accent. */}
        <TabsList className="h-auto gap-2 bg-transparent p-0">
          {(
            [
              ["lineups", t("tabLineups")],
              ["events", t("tabEvents")],
              ["stats", t("tabStatistics")],
            ] as const
          ).map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="ix-tab ix-glow ix-press border-border rounded-full border px-4 py-1.5 data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* Each panel carries a reveal (TASK-1704): Radix mounts a tab's content
            on activation, so a tab switch soft-rises the incoming panel too. */}
        <TabsContent value="lineups" className="mt-4" {...revealProps()}>
          {hasLineups ? <PitchLineup detail={detail} season={season} /> : <LineupUnavailable />}
        </TabsContent>
        <TabsContent value="events" className="mt-4" {...revealProps()}>
          {hasEvents ? (
            <EventTimeline
              events={detail.events}
              homeId={detail.fixture.teams.home.id}
              season={season}
            />
          ) : (
            <EventsUnavailable />
          )}
        </TabsContent>
        <TabsContent value="stats" className="mt-4" {...revealProps()}>
          <StatComparison statistics={detail.statistics} fixtureTeams={detail.fixture.teams} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
