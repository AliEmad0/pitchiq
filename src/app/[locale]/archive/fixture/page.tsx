import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ArchiveFixture } from "@/features/leagues/components/ArchiveFixture";

/**
 * TASK-M96 — the ONE page that serves every archived match.
 *
 * The middleware rewrites `/fixtures/<archived id>` here; the visitor's URL is unchanged and
 * the client loads that match's prerendered JSON. One static page instead of ~12,800
 * prerendered ones is what took ~2.5 GB off every deployment.
 *
 * ⛔ `force-static` like every other page: this must never become a per-request render.
 * `noindex` because this URL is an implementation detail — the canonical address of an
 * archived match is still `/fixtures/<id>`, which was never in the sitemap.
 */
export const dynamic = "force-static";
export const revalidate = false; // see CLAUDE.md — deploys are the only data change

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("fixtures");
  return { title: t("archiveTitle"), robots: { index: false, follow: true } };
}

export default async function ArchiveFixturePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ArchiveFixture />;
}
