import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { fixturesOgImagePath } from "@/app/api/og/fixtures-card";
import { FixturesIndex } from "@/features/leagues/components/FixturesIndex";
import { currentDataSeason, formatSeasonLabel } from "@/utils/season";
import { canonicalPath } from "@/utils/canonical";

type Props = { params: Promise<{ locale: string }> };

// ⚠️ HOSTING COST — force-static; NEVER read searchParams (see /teams, TASK-M71b).
export const dynamic = "force-static";
export const revalidate = false; // see docs/adr or CLAUDE.md — deploys are the only data change

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const season = currentDataSeason();
  const url = fixturesOgImagePath(season);
  const t = await getTranslations("fixtures");
  return {
    title: t("metaTitle", { season: formatSeasonLabel(season) }),
    alternates: { canonical: canonicalPath(locale, "/fixtures") },
    openGraph: { images: [{ url, width: 1200, height: 630, alt: t("ogAlt") }] },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function FixturesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <FixturesIndex season={currentDataSeason()} locale={locale} />;
}
