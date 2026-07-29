import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { managerOgImagePath } from "@/app/api/og/manager-card";
import { EntitySeasonSwitcher } from "@/components/layout/EntitySeasonSwitcher";
import { findManagerSeasons, loadManagers } from "@/data/loaders";
import { ManagerCareerTable } from "@/features/managers/components/ManagerCareerTable";
import { ManagerHero } from "@/features/managers/components/ManagerHero";
import { ManagerHonours } from "@/features/managers/components/ManagerHonours";
import { getManagerProfile } from "@/features/managers/manager-profile.api";
import { currentDataSeason, parseSeason } from "@/utils/season";
import { canonicalPath } from "@/utils/canonical";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ season?: string | string[] }>;
};

export const dynamicParams = true;

// ISR: refresh cached renders daily, matching the data cron.
//
// ⚠️ HOSTING COST — this route is NOT prerendered, and adding
// `dynamic = "force-static"` will NOT fix that. Do not add it. Same cause as
// /teams/[id]: reading the server `searchParams` prop (`?season=`) opts the
// page into dynamic rendering, and force-static does not coerce that prop.
// This route emits ZERO prerendered pages despite generateStaticParams and
// despite the build's route table printing "● (SSG)". See docs/hosting-cost.md.
export const revalidate = 86400;

// Pre-render every committed manager's profile (SSG). New managers in future
// data refreshes render on demand (dynamicParams).
export async function generateStaticParams() {
  const managers = await loadManagers();
  if (!managers) return [];
  const ids = new Set<string>();
  for (const byTeam of Object.values(managers))
    for (const list of Object.values(byTeam)) for (const m of list) ids.add(m.id);
  return [...ids].map((id) => ({ id }));
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ locale, id }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const t = await getTranslations("managers");
  const profile = await getManagerProfile(id);
  if (!profile) return { title: t("profileTitleFallback") };
  // Dynamic OG (accreditation pass, TASK-M53): season-pinned so each era link
  // previews in its era's theme. Relative url resolves against metadataBase.
  const season = parseSeason(sp.season, currentDataSeason());
  const url = managerOgImagePath(id, season);
  return {
    title: profile.name,
    alternates: { canonical: canonicalPath(locale, `/managers/${id}`, season) },
    description: t("metaDescriptionProfile", { name: profile.name }),
    openGraph: {
      images: [{ url, width: 1200, height: 630, alt: t("profileOgAlt", { name: profile.name }) }],
    },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function ManagerProfilePage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const season = parseSeason(sp.season, currentDataSeason());
  const [profile, seasons] = await Promise.all([
    getManagerProfile(id, season),
    findManagerSeasons(id),
  ]);
  if (!profile) notFound();

  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <ManagerHero profile={profile} />
      {seasons.length > 0 && <EntitySeasonSwitcher seasons={seasons} />}
      <ManagerHonours honours={profile.honours} season={season} />
      <ManagerCareerTable
        byClub={profile.byClub}
        season={season}
        highlightSeason={profile.targetSeason?.season ?? null}
      />
    </main>
  );
}
