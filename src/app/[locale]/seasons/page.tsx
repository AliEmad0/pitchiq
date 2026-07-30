import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { loadClubLogos, loadTeamColors } from "@/data/loaders";
import { SeasonCard } from "@/features/seasons/components/SeasonCard";
import styles from "@/features/seasons/components/SeasonCard.module.css";
import { getSeasonChampions } from "@/features/seasons/season-champions";
import { canonicalPath } from "@/utils/canonical";
import { clubLogoFromMap } from "@/utils/club-logo";
import { revealProps } from "@/utils/reveal";

type Props = { params: Promise<{ locale: string }> };

// ⚠️ HOSTING COST — force-static is load-bearing; no `searchParams` here.
export const dynamic = "force-static";
export const revalidate = 86400;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("seasons");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: canonicalPath(locale, "/seasons") },
  };
}

export default async function SeasonsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("seasons");
  const [champions, colors, logos] = await Promise.all([
    getSeasonChampions(),
    loadTeamColors(),
    loadClubLogos(),
  ]);

  return (
    <main className="container-page py-6 lg:py-10">
      <h1 className="mb-6 text-3xl font-bold tracking-tight lg:text-4xl" {...revealProps()}>
        {t("title")}
      </h1>
      <div className={styles.grid}>
        {champions.map((entry, i) => (
          <SeasonCard
            key={entry.season}
            season={entry.season}
            champion={entry.champion}
            // Season-accurate crest (TASK-M54): Blackburn 1994-95 gets its
            // 90s badge, not today's.
            crest={
              entry.champion ? clubLogoFromMap(entry.champion.id, entry.season, logos) : null
            }
            clubColor={
              entry.champion ? (colors?.[String(entry.champion.id)]?.home ?? null) : null
            }
            index={i}
          />
        ))}
      </div>
    </main>
  );
}
