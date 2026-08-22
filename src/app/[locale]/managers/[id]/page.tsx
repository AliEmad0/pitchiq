import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { managerOgImagePath } from "@/app/api/og/manager-card";
import { loadManagers } from "@/data/loaders";
import { ManagerCareerHonours } from "@/features/managers/components/ManagerCareerHonours";
import { ManagerCareerSummary } from "@/features/managers/components/ManagerCareerSummary";
import { ManagerCareerTable } from "@/features/managers/components/ManagerCareerTable";
import { ManagerFullCareer } from "@/features/managers/components/ManagerFullCareer";
import { ManagerHero } from "@/features/managers/components/ManagerHero";
import { ManagerHonours } from "@/features/managers/components/ManagerHonours";
import { ManagerSeasonView } from "@/features/managers/components/ManagerSeasonView";
import { getManagerProfile } from "@/features/managers/manager-profile.api";
import { currentDataSeason } from "@/utils/season";
import { canonicalPath } from "@/utils/canonical";

type Props = { params: Promise<{ locale: string; id: string }> };

// ⚠️ HOSTING COST — force-static is load-bearing (TASK-M71c). This route must
// NEVER read the server `searchParams` prop again: that opts it into dynamic
// rendering, `force-static` does NOT override it, and the route then emits
// ZERO prerendered pages while the build's route table still prints "● (SSG)"
// (the 2026-07 Active-CPU pause). Season switching is client-side in
// <ManagerSeasonView>; `?season=` deep links are honoured on the client. See
// docs/hosting-cost.md.
export const dynamic = "force-static";
export const revalidate = false; // see docs/adr or CLAUDE.md — deploys are the only data change
// New managers in future data refreshes render on demand; unknown ids still
// notFound() below.
export const dynamicParams = true;

// Pre-render every committed manager's profile (SSG).
export async function generateStaticParams() {
  const managers = await loadManagers();
  if (!managers) return [];
  const ids = new Set<string>();
  for (const byTeam of Object.values(managers))
    for (const list of Object.values(byTeam)) for (const m of list) ids.add(m.id);
  return [...ids].map((id) => ({ id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("managers");
  const profile = await getManagerProfile(id);
  if (!profile) return { title: t("profileTitleFallback") };
  const initialSeason = profile.seasons.includes(currentDataSeason())
    ? currentDataSeason()
    : (profile.seasons[0] ?? currentDataSeason());
  // Dynamic OG (accreditation pass, TASK-M53), pinned to the initial season.
  const url = managerOgImagePath(id, initialSeason);
  return {
    title: profile.name,
    // Season-less canonical: one indexable URL per manager (the /players/[id]
    // precedent, PR #59). `?season=` variants are robots-blocked anyway.
    alternates: { canonical: canonicalPath(locale, `/managers/${id}`) },
    description: t("metaDescriptionProfile", { name: profile.name }),
    openGraph: {
      images: [{ url, width: 1200, height: 630, alt: t("profileOgAlt", { name: profile.name }) }],
    },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function ManagerProfilePage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  // Existence first — decided before anything streams, so unknown ids are
  // REAL 404s (TASK-M72). A retired manager renders their latest season at
  // the bare URL.
  const profile = await getManagerProfile(id);
  if (!profile) notFound();
  const initialSeason = profile.seasons.includes(currentDataSeason())
    ? currentDataSeason()
    : (profile.seasons[0] ?? currentDataSeason());
  const initial = (await getManagerProfile(id, initialSeason)) ?? profile;

  // The <main> wrapper + season control live inside <ManagerSeasonView>.
  return (
    <ManagerSeasonView
      managerId={id}
      seasons={profile.seasons}
      initialSeason={initialSeason}
      managerName={profile.name}
    >
      <ManagerHero profile={initial} />
      {/*
        TASK-M81 — the career layer sits between the hero and the league detail.
        Everything below the summary is Premier League data derived from our own
        standings; the summary and the two career sections are the whole career,
        which is how a page like Mourinho's gets from 3 titles to 26 trophies.
        All three self-hide for the 153 managers with no enrichment.
      */}
      <ManagerCareerSummary summary={initial.careerSummary} />
      <ManagerHonours honours={initial.honours} season={initialSeason} />
      <ManagerCareerHonours groups={initial.careerHonours} />
      <ManagerCareerTable
        byClub={initial.byClub}
        season={initialSeason}
        highlightSeason={initial.targetSeason?.season ?? null}
      />
      <ManagerFullCareer spells={initial.careerSpells} />
    </ManagerSeasonView>
  );
}
