import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ArchivePlayer } from "@/features/players/components/ArchivePlayer";

/**
 * TASK-M96 PR B — the ONE page that serves every archived player.
 *
 * The middleware rewrites `/players/<archived id>` here; the visitor's URL (including any
 * `?season=`) is unchanged and the client loads that player's prerendered JSON. One static page
 * instead of ~4,578 prerendered ones takes ~1 GB off every deployment.
 *
 * ⛔ `force-static`: never a per-request render. `noindex` because this URL is an
 * implementation detail — an archived player's address is still `/players/<id>`.
 */
export const dynamic = "force-static";
export const revalidate = false; // see CLAUDE.md — deploys are the only data change

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("players");
  return { title: t("archiveTitle"), robots: { index: false, follow: true } };
}

export default async function ArchivePlayerPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ArchivePlayer />;
}
