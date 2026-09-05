import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClassicSeason } from "@/features/game/components/ClassicSeason";
import { EARLIEST_SEASON, currentDataSeason } from "@/utils/season";
export const dynamic = "force-static";
export const revalidate = false;
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("modeClassicName"), description: t("modeClassicDesc") };
}
export default async function ClassicPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const seasons = Array.from(
    { length: currentDataSeason() - EARLIEST_SEASON + 1 },
    (_, i) => currentDataSeason() - i,
  );
  return <ClassicSeason seasons={seasons} />;
}
