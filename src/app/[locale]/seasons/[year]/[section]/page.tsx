import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { getAvailableSeasons } from "@/data/loaders";
import { SECTION_REGISTRY } from "@/features/seasons/section-registry";
import { SECTION_SLUGS, isSectionSlug } from "@/features/seasons/section-slugs";
import { canonicalPath } from "@/utils/canonical";
import { currentDataSeason, formatSeasonLabel } from "@/utils/season";
import { parseSeasonSegment } from "@/utils/season-path";

type Props = { params: Promise<{ locale: string; year: string; section: string }> };

// ⚠️ HOSTING COST — force-static (TASK-M71b); the season is in `params`, never
// searchParams. All five section indexes for the 33 historical seasons are
// prerendered here.
export const dynamic = "force-static";
export const revalidate = false; // see docs/adr or CLAUDE.md — deploys are the only data change
// Every valid (year, section) is prerendered; anything else is a real 404.
export const dynamicParams = false;

// The 33 NON-current committed seasons × 5 sections. The current season's
// nested form 308-redirects to the bare `/<section>` at the edge (next.config),
// so it is excluded here — no wasted prerender.
export async function generateStaticParams(): Promise<Array<{ year: string; section: string }>> {
  const seasons = (await getAvailableSeasons()).filter((s) => s !== currentDataSeason());
  return seasons.flatMap((season) =>
    SECTION_SLUGS.map((section) => ({ year: String(season), section })),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, year, section } = await params;
  setRequestLocale(locale);
  const season = parseSeasonSegment(year);
  if (season === null || !isSectionSlug(section)) return {};
  const reg = SECTION_REGISTRY[section];
  const t = await getTranslations(reg.ns);
  const url = reg.og(season);
  return {
    title: reg.titleNeedsSeason
      ? t(reg.titleKey, { season: formatSeasonLabel(season) })
      : t(reg.titleKey),
    description: reg.descKey ? t(reg.descKey) : undefined,
    // Self-canonical: this season-section is its own indexable URL.
    alternates: { canonical: canonicalPath(locale, `/seasons/${season}/${section}`) },
    openGraph: { images: [{ url, width: 1200, height: 630, alt: t(reg.ogAltKey) }] },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function SeasonSectionPage({ params }: Props) {
  const { locale, year, section } = await params;
  setRequestLocale(locale);
  const season = parseSeasonSegment(year);
  if (season === null || !isSectionSlug(section)) notFound();
  const { Index } = SECTION_REGISTRY[section];
  return <Index season={season} locale={locale} />;
}
