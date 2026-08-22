import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { dashboardOgImagePath } from "@/app/api/og/ticket";
import { getAvailableSeasons } from "@/data/loaders";
import { SeasonDashboard } from "@/features/dashboard/components/SeasonDashboard";
import { canonicalPath } from "@/utils/canonical";
import { formatSeasonLabel } from "@/utils/season";
import { parseSeasonSegment, seasonPath } from "@/utils/season-path";

type Props = { params: Promise<{ locale: string; year: string }> };

// ⚠️ HOSTING COST — force-static is load-bearing. Never add `searchParams` to
// this route: the season comes from `params`, which is static. Reading
// `searchParams` would opt the route into dynamic rendering, which
// `force-static` does NOT override, and it would then prerender nothing at all.
// See docs/hosting-cost.md.
export const dynamic = "force-static";
export const revalidate = false; // see docs/adr or CLAUDE.md — deploys are the only data change
// Every committed season is prerendered, so an unknown year is a real 404
// rather than an on-demand render of a page that cannot have data.
export const dynamicParams = false;

export async function generateStaticParams(): Promise<Array<{ year: string }>> {
  const seasons = await getAvailableSeasons();
  return seasons.map((season) => ({ year: String(season) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, year } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("seasons");
  const season = parseSeasonSegment(year);
  if (season === null) return { title: t("notFoundTitle") };

  const label = formatSeasonLabel(season, locale);
  const url = dashboardOgImagePath(season);
  return {
    title: t("seasonMetaTitle", { season: label }),
    description: t("seasonMetaDescription", { season: label }),
    // Self-canonical: this is the season's single indexable URL.
    alternates: { canonical: canonicalPath(locale, seasonPath(season)) },
    openGraph: {
      images: [{ url, width: 1200, height: 630, alt: t("seasonOgAlt", { season: label }) }],
    },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function SeasonPage({ params }: Props) {
  const { locale, year } = await params;
  setRequestLocale(locale);
  const season = parseSeasonSegment(year);
  if (season === null) notFound();
  return <SeasonDashboard season={season} locale={locale} />;
}
