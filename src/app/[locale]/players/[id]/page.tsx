import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { playerOgImagePath } from "@/app/api/og/player-card";
import { findPlayerSeasons, loadClubLogos, loadPlayers } from "@/data/loaders";
import { getEntityNames } from "@/features/i18n/entity-names";
import { getPlayerProfile } from "@/features/players/api";
import { PlayerHero } from "@/features/players/components/PlayerHero";
import { PlayerMarketValue } from "@/features/players/components/PlayerMarketValue";
import { PlayerSeasonSplits } from "@/features/players/components/PlayerSeasonSplits";
import { PlayerSeasonStats } from "@/features/players/components/PlayerSeasonStats";
import { PlayerSeasonView } from "@/features/players/components/PlayerSeasonView";
import { TriviaSection } from "@/features/trivia/components/TriviaSection";
import { canonicalPath } from "@/utils/canonical";
import { currentDataSeason } from "@/utils/season";

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

// Players from older seasons (post-TASK-701) or non-existent ids render on
// demand and fall through to `notFound()` rather than 404'ing at routing.
export const dynamicParams = true;

// The page no longer reads `?season=` (that forced dynamic rendering of every
// view — the Vercel Active-CPU regression). It renders the current season
// server-side; historical seasons load client-side in <PlayerSeasonView>. ISR
// refreshes the cached page daily to match the data cron.
//
// ⚠️ HOSTING COST — `force-static` is load-bearing, do not remove.
//
// A controlled experiment on a Vercel preview (two pages under [locale] with no
// data access, differing only in this line) showed that `revalidate` ALONE lets
// the render fall back to dynamic: it served `private, no-store` with
// x-vercel-cache MISS, so every view ran a function and the prerendered pages
// were never served from the CDN. With force-static the same page returns
// `public` + HIT. See docs/hosting-cost.md.
export const dynamic = "force-static";
export const revalidate = 86400;

// `pnpm build` pre-renders every current-season PL player as an SSG route.
// ~570 players today — bounded enough that SSG pays off; older seasons fall
// through to dynamic rendering under `dynamicParams = true`.
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const players = await loadPlayers(currentDataSeason());
  if (!players) return [];
  return players.map((p) => ({ id: String(p.id) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("players");
  const tNotFound = await getTranslations("notFound");
  const playerId = Number(id);
  if (!Number.isInteger(playerId)) return { title: tNotFound("playerTitle") };

  // Only the current season is indexed (matches the sitemap); the OG route
  // falls back to the player's latest season when they didn't play it.
  const season = currentDataSeason();
  const url = playerOgImagePath(playerId, season);
  const og = {
    openGraph: {
      images: [{ url, width: 1200, height: 630, alt: t("playerOgAlt") }],
    },
    twitter: { card: "summary_large_image" as const, images: [url] },
  };
  // Season-less canonical: all season variants collapse to one indexable URL.
  const alternates = { canonical: canonicalPath(locale, `/players/${playerId}`) };

  const profile = await getPlayerProfile(playerId, season, locale);
  if (profile) {
    // Nested route — the layout's title.template appends "— PitchIQ".
    return {
      title: profile.name,
      description: t("metaDescriptionPlayer", {
        name: profile.name,
        position: profile.position,
        team: profile.team.name,
      }),
      alternates,
      ...og,
    };
  }
  // Historical-only player (not in the current season) — still a real player
  // (TASK-704 stable ids), so title them by name rather than "not found".
  // A known historical player is a real, indexable page (so it gets a canonical);
  // an unknown id is effectively not-found and must not declare one.
  const known = await findPlayerSeasons(playerId);
  return known
    ? { title: (await getEntityNames(locale)).player(playerId, known.name), alternates, ...og }
    : { title: tNotFound("playerTitle"), ...og };
}

export default async function PlayerProfilePage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const playerId = Number(id);
  if (!Number.isInteger(playerId)) notFound();

  const currentSeason = currentDataSeason();
  // `known` powers the page-local season switcher (TASK-M10), scoped to the
  // seasons this player actually appears in. Fetched in parallel with the
  // current-season profile since they're independent.
  const [currentProfile, known, clubLogos] = await Promise.all([
    getPlayerProfile(playerId, currentSeason, locale),
    findPlayerSeasons(playerId),
    loadClubLogos(),
  ]);

  // A genuinely unknown id appears in no season → real notFound().
  if (!known) notFound();

  // Seed the view with the current season when the player played it; otherwise
  // their latest played season (retired players), so the default static page
  // shows real data and the switcher's value is always a season they played.
  const initialSeason = currentProfile ? currentSeason : known.seasons[0];
  const profile = currentProfile ?? (await getPlayerProfile(playerId, initialSeason, locale));
  const displayName = (await getEntityNames(locale)).player(playerId, known.name);

  // The current-season subtree is rendered server-side (RSC) and handed to the
  // client wrapper as `children` — so PlayerHero/Splits stay server-rendered and
  // the page stays statically prerenderable with no hydration cost. The wrapper
  // only swaps to client-fetched content when a different season is picked.
  return (
    <PlayerSeasonView
      playerId={playerId}
      seasons={known.seasons}
      initialSeason={initialSeason}
      clubLogos={clubLogos}
      displayName={displayName}
      hero={profile && <PlayerHero player={profile} season={initialSeason} />}
      careerBlock={<PlayerMarketValue playerId={playerId} plSeasons={known.seasons} />}
    >
      {profile && (
        <>
          <PlayerSeasonStats metrics={profile.metrics} />
          {profile.splits && (
            <PlayerSeasonSplits
              splits={profile.splits}
              season={initialSeason}
              clubLogos={clubLogos}
            />
          )}
          <Suspense fallback={null}>
            <TriviaSection
              scope="player"
              id={playerId}
              season={initialSeason}
              className={profile.splits ? "mt-10!" : undefined}
            />
          </Suspense>
        </>
      )}
    </PlayerSeasonView>
  );
}
