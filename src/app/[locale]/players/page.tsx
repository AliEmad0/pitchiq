import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { playersOgImagePath } from "@/app/api/og/players-card";
import { PlayersIndex } from "@/features/players/components/PlayersIndex";
import { currentDataSeason } from "@/utils/season";
import { canonicalPath } from "@/utils/canonical";

type Props = { params: Promise<{ locale: string }> };

// ⚠️ HOSTING COST — force-static; NEVER read searchParams (see /teams, TASK-M71b).
export const dynamic = "force-static";
export const revalidate = false; // see docs/adr or CLAUDE.md — deploys are the only data change

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const url = playersOgImagePath(currentDataSeason());
  const t = await getTranslations("players");
  return {
    title: t("pageTitle"),
    alternates: { canonical: canonicalPath(locale, "/players") },
    description: t("metaDescription"),
    openGraph: { images: [{ url, width: 1200, height: 630, alt: t("ogAlt") }] },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function PlayersIndexPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PlayersIndex season={currentDataSeason()} locale={locale} />;
}
