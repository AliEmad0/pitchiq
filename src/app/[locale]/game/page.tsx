import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { assembleGameTeam } from "@/features/game/adapter/lineup";
import { loadSeasonGoalRate } from "@/features/game/adapter/match";
import { MatchView } from "@/features/game/components/MatchView";
import { simulate } from "@/features/game/domain/simulate";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";

export const dynamic = "force-static";
export const revalidate = 86400;

const HOME_ID = 42; // Arsenal
const AWAY_ID = 33; // Manchester United
const SEASON = 2020;
const SEED = 20040515;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("title"), description: t("subtitle") };
}

export default async function GamePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");

  const [home, away, rate] = await Promise.all([
    assembleGameTeam(HOME_ID, SEASON),
    assembleGameTeam(AWAY_ID, SEASON),
    loadSeasonGoalRate(SEASON),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground mb-8 mt-1 text-sm">{t("subtitle")}</p>
      {home && away ? (
        <MatchView
          model={buildMatchViewModel(
            home,
            away,
            simulate({ home, away, seed: SEED, targetGoalsPerMatch: rate }),
          )}
        />
      ) : null}
    </main>
  );
}
