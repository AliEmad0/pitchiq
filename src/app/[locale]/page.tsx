import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { dashboardOgImagePath } from "@/app/api/og/ticket";
import { SeasonDashboard } from "@/features/dashboard/components/SeasonDashboard";
import { canonicalPath } from "@/utils/canonical";
import { currentDataSeason } from "@/utils/season";

type Props = {
  params: Promise<{ locale: string }>;
};

// ⚠️ HOSTING COST — this route must NEVER read the server `searchParams` prop.
//
// Reading it opts the page into dynamic rendering. `force-static` does NOT
// override that (its documented coercion covers cookies(), headers() and
// useSearchParams() — not `searchParams`), and the route then emits ZERO
// prerendered pages while `next build`'s route table still prints "● (SSG)".
// Vercel then serves every view `private, no-store` with x-vercel-cache MISS,
// so each one costs a function invocation. That is the 2026-07 Active-CPU
// pause. See docs/hosting-cost.md.
//
// Historical seasons live at /seasons/<year> (TASK-M71a); `/?season=YYYY`
// 308-redirects there at the edge via next.config.ts.
export const dynamic = "force-static";
export const revalidate = 86400;

// Next's title.template only wraps *child* segments, so the root dashboard
// spells out its absolute title here. Dynamic OG (matchday-ticket) is pinned to
// the current season — `/` is the current season now, so it no longer varies.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  // generateMetadata runs outside the layout's render, so re-assert the locale
  // for getTranslations (TASK-1603).
  setRequestLocale(locale);
  const url = dashboardOgImagePath(currentDataSeason());
  const t = await getTranslations("dashboard");
  return {
    title: t("metaTitle"),
    // Season-less canonical: `/` is the current season's single URL.
    alternates: { canonical: canonicalPath(locale, "/") },
    openGraph: {
      images: [{ url, width: 1200, height: 630, alt: t("ogAlt") }],
    },
    twitter: { card: "summary_large_image", images: [url] },
  };
}

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SeasonDashboard season={currentDataSeason()} locale={locale} />;
}
