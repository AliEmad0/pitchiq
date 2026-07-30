import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { GEO_REFERENCE } from "@/data/geo-reference";
import { getAvailableSeasons, loadClubLogos, loadStandings, loadTeamColors } from "@/data/loaders";
import { getEntityNames } from "@/features/i18n/entity-names";
import type { MarkerClub } from "@/features/map/components/ClubMarker";
import { MapExplorer } from "@/features/map/components/MapExplorer";
import { buildMapData } from "@/features/map/map-data";
import { championsByRegion } from "@/features/map/region-data";
import { canonicalPath } from "@/utils/canonical";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("map");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: canonicalPath(locale, "/map") },
  };
}

// Server component: reads the geo reference + every season's standings (the
// per-season active-club sets) + kit colours, and hands them to the client
// <MapExplorer>. The page itself is season-agnostic — the slider drives the
// season client-side from data already in props.
export default async function MapPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("map");
  const seasonsDesc = await getAvailableSeasons(); // newest-first
  const perSeason = await Promise.all(
    seasonsDesc.map(async (season) => ({ season, standings: await loadStandings(season) })),
  );
  const { activeBySeason, nameById } = buildMapData(perSeason);
  const [colors, clubLogos, names] = await Promise.all([
    loadTeamColors(),
    loadClubLogos(),
    getEntityNames(),
  ]);

  // TASK-1606 follow-up: localize the marker + region-modal club names on `/ar`
  // (the map collected Latin `teamName` from standings). `/en` → identity.
  const clubs: MarkerClub[] = GEO_REFERENCE.map((g) => ({
    ...g,
    name: names.team(g.teamId, nameById[g.teamId] ?? `Club ${g.teamId}`),
    crest: `/logos/${g.teamId}.png`,
    color: colors?.[String(g.teamId)]?.home ?? "#888888",
    logoVariants: clubLogos?.[String(g.teamId)],
  }));
  const seasonsAsc = [...seasonsDesc].sort((a, b) => a - b);
  const { titlesByClub } = championsByRegion(perSeason, clubs);

  return (
    // Full-width main so the sticky letterbox lines can bleed edge-to-edge
    // (TASK-1515, concept #30); the map + attribution re-contain themselves.
    <main className="space-y-6 py-6 lg:py-10">
      {/* The page title is the sticky letterbox caption inside <MapExplorer>. */}
      {/* <MapExplorer> reads the URL via nuqs (useSearchParams), which needs a
          Suspense ancestor to keep this page statically prerenderable — it can
          no longer lean on a global loading.tsx boundary (TASK-M72). */}
      <Suspense>
        <MapExplorer
          clubs={clubs}
          activeBySeason={activeBySeason}
          seasons={seasonsAsc}
          titlesByClub={titlesByClub}
        />
      </Suspense>
      <p className="container-page text-muted-foreground text-xs">
        {t.rich("attribution", {
          link: (chunks) => (
            <a
              href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
              className="hover:text-foreground underline"
              target="_blank"
              rel="noreferrer"
            >
              {chunks}
            </a>
          ),
        })}
      </p>
    </main>
  );
}
