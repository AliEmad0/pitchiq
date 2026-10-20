import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TrophyRoom } from "@/features/game/components/TrophyRoom";

// force-static, like every /game route (the TASK-M71 rule). Everything shown lives in the
// visitor's IndexedDB; the set lists are prerendered JSON fetched on the client.
export const dynamic = "force-static";
export const revalidate = false; // see CLAUDE.md — deploys are the only data change

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("gameTrophies");
  return { title: t("title"), description: t("intro") };
}

export default async function TrophiesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      {/* TASK-1813/1819 — the Album and the Hall of Fame. */}
      <TrophyRoom />
    </main>
  );
}
