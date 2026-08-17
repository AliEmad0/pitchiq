import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPool } from "@/features/game/adapter/pool";
import { ModePlay } from "@/features/game/components/ModePlay";
import { packFor, routedPacks } from "@/features/game/domain/rule-packs";

// force-static like every other /game route. The whole TASK-M71 arc exists to keep routes
// CDN-served, and a route with only `revalidate` falls back to a dynamic render.
export const dynamic = "force-static";
export const revalidate = 86400;

type Props = { params: Promise<{ locale: string; mode: string }> };

/**
 * One page file, one prerendered page per live rule pack.
 *
 * ⚠️ This is what makes unlocking a mode a DATA change: add a pack with a chooser and its
 * page appears here. `/game/draft`, `/game/chaos` and `/game/daily` are unaffected — Next
 * resolves static segments before dynamic ones.
 */
export async function generateStaticParams(): Promise<Array<{ mode: string }>> {
  return routedPacks().map((p) => ({ mode: p.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, mode } = await params;
  setRequestLocale(locale);
  if (packFor(mode) == null) return {};
  const t = await getTranslations("game");
  return { title: t("legacyTitle"), description: t("legacyPick") };
}

export default async function ModePage({ params }: Props) {
  const { locale, mode } = await params;
  setRequestLocale(locale);

  // ⛔ An unknown segment 404s. There must be NO loading.tsx above this route: TASK-M72
  // proved any such file commits a 200 before the page runs, which is exactly the soft-404
  // class that ticket existed to remove.
  const pack = packFor(mode);
  if (pack == null) notFound();

  const pool = await buildPool(pack.pool);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <ModePlay pool={pool} chooser={pack.chooser} draft={pack.draft} />
    </main>
  );
}
