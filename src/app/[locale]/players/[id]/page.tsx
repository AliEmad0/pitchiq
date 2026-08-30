import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { playerOgImagePath } from "@/app/api/og/player-card";
import { findPlayerSeasons, getAvailableSeasons, loadClubLogos, loadPlayers } from "@/data/loaders";
import { getEntityNames } from "@/features/i18n/entity-names";
import { getPlayerProfile } from "@/features/players/api";
import { PlayerCareerRecord } from "@/features/players/components/PlayerCareerRecord";
import { getPlayerCareerRecord } from "@/features/players/career-record.api";
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

// ⛔ HOSTING COST — FALSE, and load-bearing (TASK-1843, measured 2026-08-30). See
// `generateStaticParams` below: every player in every season is prerendered now, so an id
// outside that set is not a player at all and 404s at ROUTING — from the CDN, with no function
// invocation and no ISR write. Flipping this back to `true` re-opens the hole that let one
// scraper burn 145,000 of the 200,000 monthly ISR write units in two days.
export const dynamicParams = false;

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
export const revalidate = false; // see docs/adr or CLAUDE.md — deploys are the only data change

// ⭐ EVERY player of EVERY season, not just the current one (TASK-1843, measured 2026-08-30).
//
// This used to prerender `currentDataSeason()` alone — ~537 of 5,362 players — and leave the
// other 4,825 to on-demand ISR. That was affordable only while nothing linked to them, and
// TASK-M71b ended that: `/seasons/<year>/players` renders a <PlayersTable> whose every row
// links to `/players/<id>` for that season. So ~4,825 ids per locale became reachable but
// unbuilt, and each first request paid a Node render AND an ISR cache write. A scraper walked
// that surface on 29-30 Aug and wrote 145,000 of the 200,000 monthly write units in two days.
//
// A prerendered page costs nothing to serve, and build-time prerendering is NOT metered as an
// ISR write (measured: 1-28 Aug carried dozens of deploys at a near-zero write count). The
// only budget this spends is build time — see the guard test for the ceiling.
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const ids = new Set<string>();
  for (const season of await getAvailableSeasons()) {
    for (const p of (await loadPlayers(season)) ?? []) ids.add(String(p.id));
  }
  return [...ids].map((id) => ({ id }));
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
  const [currentProfile, known, clubLogos, careerRecord] = await Promise.all([
    getPlayerProfile(playerId, currentSeason, locale),
    findPlayerSeasons(playerId),
    loadClubLogos(),
    // TASK-M92 — prerender-only read of the three large detail files. Safe here because
    // this route is `force-static`; see the warning in career-record.api.ts.
    getPlayerCareerRecord(playerId),
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
      careerBlock={
        <>
          <PlayerMarketValue playerId={playerId} plSeasons={known.seasons} />
          {/*
            TASK-M92 — honours / transfers / international. Season-INVARIANT, so it goes
            in `careerBlock` beside the market-value block (the TASK-M68 slot), never in
            `children`: the wrapper replaces `children` wholesale on a `?season=` swap,
            and the swap is driven by `/api/players/[id]/profile`, which must NOT read
            these ~5 MB / ~8 MB files. Rendered once, in the prerender only.
          */}
          <PlayerCareerRecord record={careerRecord} />
        </>
      }
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
