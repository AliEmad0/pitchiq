import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { teamsOgImagePath } from "@/app/api/og/teams-card";
import { TeamsIndex } from "@/features/teams/components/TeamsIndex";
import { currentDataSeason } from "@/utils/season";
import { canonicalPath } from "@/utils/canonical";

type Props = { params: Promise<{ locale: string }> };

// ⚠️ HOSTING COST — force-static is load-bearing (TASK-M71b). NEVER read the
// server `searchParams` prop here again: it opts the route into dynamic
// rendering, `force-static` can't override it, and the route then emits ZERO
// prerendered pages (the 2026-07 Active-CPU pause). Historical seasons live at
// /seasons/<year>/teams; `/teams?season=YYYY` 308-redirects there in
// next.config.ts. See docs/hosting-cost.md.
export const dynamic = "force-static";
export const revalidate = 86400;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const url = teamsOgImagePath(currentDataSeason());
  const t = await getTranslations("teams");
  return {
    title: t("clubs"),
    // Season-less canonical: the bare URL is the current season's single URL.
    alternates: { canonical: canonicalPath(locale, "/teams") },
    description: t("metaDescription"),
    openGraph: { images: [{ url, width: 1200, height: 630, alt: t("ogAlt") }] },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function TeamsIndexPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TeamsIndex season={currentDataSeason()} locale={locale} />;
}
