import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { fixtureOgImagePath } from "@/app/api/og/fixture-card";
import { isArchivedSeason } from "@/data/archive";
import { getAvailableSeasons, loadFixtures } from "@/data/loaders";
import { FixtureDetailView } from "@/features/leagues/components/FixtureDetailView";
import { getFixtureDetail } from "@/features/leagues/fixture-detail.api";
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

// ⭐ Every NON-archived season's fixtures — today the current season's ~380 (TASK-M96).
//
// Older seasons are NOT left unbuilt: `isArchivedSeason` is the one predicate that splits the
// archive, and `/api/archive/fixtures/[id]` prerenders a JSON file for every match on the other
// side of it. The middleware rewrites those URLs to the shared `/archive/fixture` shell, so no
// reachable path is unbuilt and `dynamicParams` stays false (TASK-1843). Prerendering all
// ~13,166 matches here cost ~2.5 GB per deployment — half of a ~4.9 GB build against Vercel
// Hobby's 10 GB Deployment Storage, of which at least three builds are always kept.
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const ids: Array<{ id: string }> = [];
  for (const season of await getAvailableSeasons()) {
    if (isArchivedSeason(season)) continue;
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

  return (
    <FixtureDetailView
      detail={detail}
      labels={{ lineups: t("tabLineups"), events: t("tabEvents"), stats: t("tabStatistics") }}
    />
  );
}
