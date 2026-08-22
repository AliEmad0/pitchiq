import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadChaosPool } from "@/features/game/adapter/chaos-pool";
import { DailyChallenge } from "@/features/game/components/DailyChallenge";

// force-static, exactly like the other /game routes. The M71 arc exists to keep every
// route CDN-served; a dynamic render here would put game weight back on a lambda.
//
// ⚠️ The prerendered HTML therefore carries NO day-specific content — the day resolves
// after mount inside the container, or a CDN copy would assert a stale challenge.
export const dynamic = "force-static";
export const revalidate = false; // see docs/adr or CLAUDE.md — deploys are the only data change

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("modeDailyName"), description: t("modeDailyDesc") };
}

export default async function DailyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const pool = await loadChaosPool();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      {/* TASK-1817 — one deterministic challenge per day, seeded from the UTC date. */}
      <DailyChallenge pool={pool} />
    </main>
  );
}
