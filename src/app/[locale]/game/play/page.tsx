import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadChaosPool } from "@/features/game/adapter/chaos-pool";
import { GamePlay } from "@/features/game/components/GamePlay";

// force-static, exactly like /game, /game/chaos and /game/draft. The M71 arc exists to
// keep every route CDN-served; a dynamic render here would put game weight back on a
// lambda. The match itself runs entirely in the browser, so nothing about the live loop
// needs a server.
export const dynamic = "force-static";
export const revalidate = 86400;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("draftTitle"), description: t("draftSubtitle") };
}

export default async function PlayPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const pool = await loadChaosPool();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      {/* The same container /game/draft mounts — this is simply the canonical entry. */}
      <GamePlay pool={pool} initialPhase="setup" />
    </main>
  );
}
