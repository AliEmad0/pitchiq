import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { leaderboardsOgImagePath } from "@/app/api/og/leaderboards-card";
import { LeaderboardsIndex } from "@/features/players/components/LeaderboardsIndex";
import { currentDataSeason } from "@/utils/season";
import { canonicalPath } from "@/utils/canonical";

type Props = { params: Promise<{ locale: string }> };

// ⚠️ HOSTING COST — force-static; NEVER read searchParams (see /teams, TASK-M71b).
export const dynamic = "force-static";
export const revalidate = 86400;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const url = leaderboardsOgImagePath(currentDataSeason());
  const t = await getTranslations("leaderboard");
  return {
    title: t("metaTitle"),
    alternates: { canonical: canonicalPath(locale, "/leaderboards") },
    description: t("metaDescription"),
    openGraph: { images: [{ url, width: 1200, height: 630, alt: t("ogAlt") }] },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function LeaderboardsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LeaderboardsIndex season={currentDataSeason()} locale={locale} />;
}
