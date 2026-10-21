import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadChaosPool } from "@/features/game/adapter/chaos-pool";
import { MysteryMarket } from "@/features/game/components/MysteryMarket";

// force-static like every /game route (the TASK-M71 rule). The run itself lives in this browser's
// IndexedDB and resolves after mount; the page carries only the pool.
export const dynamic = "force-static";
export const revalidate = false; // see CLAUDE.md — deploys are the only data change

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("modeMysteryName"), description: t("modeMysteryDesc") };
}

export default async function MarketPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const pool = await loadChaosPool();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      {/* TASK-1818 — the Mystery Market: a roguelike run, three lives, a pack after every win. */}
      <MysteryMarket pool={pool} />
    </main>
  );
}
