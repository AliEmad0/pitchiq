import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadChaosPool } from "@/features/game/adapter/chaos-pool";
import { GamePlay } from "@/features/game/components/GamePlay";

// force-static, exactly like /game and /game/chaos. The M71 arc exists to keep every
// route CDN-served; a dynamic render here would put game weight back on a lambda.
export const dynamic = "force-static";
export const revalidate = 86400;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("draftTitle"), description: t("draftSubtitle") };
}

export default async function DraftPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const pool = await loadChaosPool();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      {/* The same container /game/play mounts — this route is its setup entry point, so
          draft → match is a state change rather than a page load. */}
      <GamePlay pool={pool} initialPhase="setup" />
    </main>
  );
}
