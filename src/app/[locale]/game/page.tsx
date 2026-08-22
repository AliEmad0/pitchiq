import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ModeGate } from "@/features/game/components/ModeGate";

// force-static like every /game/* route. The gate loads NO data — it renders from
// domain/modes.ts alone — so there is nothing here that could pull it onto a lambda.
export const dynamic = "force-static";
export const revalidate = false; // see docs/adr or CLAUDE.md — deploys are the only data change

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("hubTitle"), description: t("hubSubtitle") };
}

/**
 * TASK-1832 — the mode gate, and the game's only front door.
 *
 * This URL used to be the Arsenal v Man Utd broadcast demo, which is now at `/game/demo`.
 * `/game` is the one game route in the header nav and the sitemap; the mode sub-routes are
 * app surfaces, not content, and stay out of both.
 */
export default async function GameHubPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <ModeGate />
    </main>
  );
}
