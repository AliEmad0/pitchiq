import "server-only";

import { CalendarClock, Flame, Goal, Sparkles, Square, Trophy } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { Link } from "@/i18n/navigation";

import { StatCardSkeleton } from "@/components/skeletons/StatCardSkeleton";
import { getStandings } from "@/features/leagues/api";
import { getClassicMatches } from "@/features/leagues/classic-matches.api";
import { FixtureList } from "@/features/leagues/components/FixtureList";
import { FixturesRail } from "@/features/leagues/components/FixturesRail";
import { StandingsTable } from "@/features/leagues/components/StandingsTable";
import {
  getNextFixtures,
  getRecentResults,
  getSeasonStateForSeason,
} from "@/features/leagues/fixtures.api";
import { StatLeaderboard } from "@/features/players/components/StatLeaderboard";
import {
  toAssistsEntry,
  toGoalsEntry,
  toRedCardsEntry,
  toYellowCardsEntry,
} from "@/features/players/leaderboard-adapter";
import {
  getTopAssists,
  getTopRedCards,
  getTopScorers,
  getTopYellowCards,
} from "@/features/players/leaderboards.api";
import { TriviaSection } from "@/features/trivia/components/TriviaSection";
import { isRtl, localizeDigits } from "@/utils/format";
import { revealProps } from "@/utils/reveal";
import { currentDataSeason } from "@/utils/season";
import { navHrefForSeason } from "@/utils/season-path";

/**
 * Phase 15 redesign (TASK-1504) — the "Bento" dashboard. A standings hero tile
 * (2 cols) with Top Scorers stacked over Top Assists in the right column, then a
 * row of Yellow / Red / Fixtures tiles, and a brand-coloured "Did you know?"
 * block. Standings is awaited at the top so the heading shows the effective
 * season; the leaderboards + fixtures stream in their own <Suspense>.
 *
 * TASK-M71a — extracted from `app/[locale]/page.tsx` so the season is an
 * explicit prop. Rendered by `/` (current season) and `/seasons/[year]`.
 *
 * ⚠️ HOSTING COST — neither caller may read the server `searchParams` prop.
 * Doing so opts the route into dynamic rendering, which `force-static` does NOT
 * override, and the route then prerenders NOTHING while the build's route table
 * still prints "● (SSG)". See docs/hosting-cost.md.
 */
export async function SeasonDashboard({ season, locale }: { season: number; locale: string }) {
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const standings = await getStandings({ season });
  // The loader may resolve a different season than requested (e.g. a season with
  // no committed standings falls back), so the heading follows what was loaded.
  const effectiveSeason = standings?.league.season ?? season;
  // English abbreviates the second year (2025–26); Arabic (owner request) shows
  // it in full with spaces around the dash (٢٠٢٥ - ٢٠٢٦).
  const isAr = isRtl(locale);
  const endYear = isAr ? String(effectiveSeason + 1) : String(effectiveSeason + 1).slice(-2);
  const rows = standings?.league.standings[0] ?? [];

  // Upcoming Fixtures shows only while the season is in progress (TASK-M13).
  const upcoming = await getNextFixtures({ season: effectiveSeason });
  // Completed season → "Classic Matches" (top fixtures by notability, TASK-M14);
  // an in-progress season keeps "Recent Results". Both render under the
  // "Fixtures" heading (TASK-M21). Reuses the deduped loadFixtures read.
  const showClassicMatches = (await getSeasonStateForSeason(effectiveSeason)) === "ended";
  // TASK-M71b — the section indexes live in the season path. On `/seasons/<year>`
  // these link to `/seasons/<year>/<section>`; on the current-season dashboard
  // they stay bare. (Entity links elsewhere keep `withSeason` — the accepted
  // index→detail `?season=` crossing.)
  const seasonForLinks = effectiveSeason === currentDataSeason() ? null : effectiveSeason;
  const leaderboardsHref = navHrefForSeason("/leaderboards", seasonForLinks, currentDataSeason());

  return (
    <div className="container-page py-6 lg:py-10">
      {/* Header design 9 — "oversized year": a small kicker over a large season
          number (the magenta dash is era-aware). "Premier League" stays inside
          the <h1> so the accessible name is still "Premier League {season}". */}
      <header className="mb-6 lg:mb-8" {...revealProps()}>
        <h1 className="flex flex-col">
          <span className="text-muted-foreground text-xs font-medium tracking-[0.08em] uppercase">
            {t("premierLeague")}
          </span>
          {/* Eastern-Arabic digits; flows RTL so an Arabic reader reads it
              year-first (2025 then 2026). The split keeps the dash its accent
              colour; Arabic gets full years + a space either side of the dash. */}
          <span className="text-4xl leading-none font-bold tracking-tight lg:text-5xl">
            {localizeDigits(effectiveSeason, locale)}
            {isAr && " "}
            <span className="text-primary">–</span>
            {isAr && " "}
            {localizeDigits(endYear, locale)}
          </span>
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">{t("subtitle")}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Standings hero tile (2 cols). The id="standings" anchor is a legacy
            jump-link target. */}
        {/* min-w-0 lets the wide table's own overflow-x-auto contain the scroll
            so the PAGE never scrolls horizontally on mobile (TASK-1504). The tile
            is a flex column so the qualification key pins to the bottom and the
            tile fills its (grid-stretched) height to match the right column. */}
        <section id="standings" className="scroll-mt-20 min-w-0 lg:col-span-2" {...revealProps()}>
          <div className="bg-card text-card-foreground flex h-full flex-col rounded-xl border shadow-sm">
            <div className="flex items-center justify-between gap-2 px-4 py-4 sm:px-5">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Trophy className="text-muted-foreground size-5" aria-hidden />
                {t("standings")}
              </h2>
              <span className="text-muted-foreground text-xs tabular-nums">
                {localizeDigits(effectiveSeason, locale)}
                {isAr ? " – " : "–"}
                {localizeDigits(endYear, locale)}
              </span>
            </div>
            <div className="flex flex-1 flex-col px-2 pb-4 sm:px-4">
              {standings === null ? (
                <EmptyState message={t("standingsUnavailable")} />
              ) : rows.length === 0 ? (
                <EmptyState message={t("standingsEmpty")} />
              ) : (
                <StandingsTable rows={rows} season={effectiveSeason} />
              )}
            </div>
          </div>
        </section>

        {/* Right column — Top Scorers stacked directly over Top Assists. */}
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-1">
          <Suspense fallback={<StatCardSkeleton rows={5} />}>
            <TopScorersSection season={effectiveSeason} seeAllHref={leaderboardsHref} />
          </Suspense>
          <Suspense fallback={<StatCardSkeleton rows={5} />}>
            <TopAssistsSection season={effectiveSeason} seeAllHref={leaderboardsHref} />
          </Suspense>
        </div>

        {/* Upcoming Fixtures — only on an in-progress season (TASK-M13). Kept as
            the full-width horizontal rail (its negative-margin bleed wants the
            page gutter, not a padded tile). */}
        {upcoming && upcoming.length > 0 && (
          <section className="lg:col-span-3" {...revealProps()}>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <CalendarClock className="text-muted-foreground size-5" aria-hidden />
              {t("upcomingFixtures")}
            </h2>
            <FixturesRail mode="next" fixtures={upcoming} season={effectiveSeason} />
          </section>
        )}

        {/* Yellow / Red / Fixtures row. */}
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-3">
          <Suspense fallback={<StatCardSkeleton rows={5} />}>
            <TopYellowCardsSection season={effectiveSeason} seeAllHref={leaderboardsHref} />
          </Suspense>
          <Suspense fallback={<StatCardSkeleton rows={5} />}>
            <TopRedCardsSection season={effectiveSeason} seeAllHref={leaderboardsHref} />
          </Suspense>
          <div
            className="bg-card text-card-foreground min-w-0 rounded-xl border shadow-sm"
            {...revealProps()}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-4 sm:px-5">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Flame className="text-muted-foreground size-5" aria-hidden />
                {t("fixtures")}
              </h2>
              {/* text-xs to match the Top Scorers / Yellow / Red leaderboard
                  "See all →" links (TASK-1504 — keep every tile's link uniform). */}
              <Link
                href={navHrefForSeason("/fixtures", seasonForLinks, currentDataSeason())}
                className="text-muted-foreground hover:text-foreground shrink-0 text-xs font-medium transition-colors"
              >
                {tc("seeAll")}
              </Link>
            </div>
            <div className="px-4 pb-4 sm:px-5">
              <Suspense fallback={<FixtureListSkeleton />}>
                {showClassicMatches ? (
                  <ClassicMatchesSection season={effectiveSeason} />
                ) : (
                  <RecentResultsSection season={effectiveSeason} />
                )}
              </Suspense>
            </div>
          </div>
        </div>

        {/* Delightful, not headline — trivia sits below the primary content,
            filled with the brand colour (era-aware). */}
        <section className="lg:col-span-3">
          <Suspense fallback={null}>
            <TriviaSection scope="league" season={effectiveSeason} tone="solid" />
          </Suspense>
        </section>
      </div>
    </div>
  );
}

async function TopScorersSection({ season, seeAllHref }: { season: number; seeAllHref: string }) {
  const entries = await getTopScorers({ season });
  const adapted = entries ? entries.map(toGoalsEntry) : [];
  const t = await getTranslations("dashboard");
  return (
    <StatLeaderboard
      title={t("topScorers")}
      valueLabel={t("topScorersValue")}
      entries={adapted}
      accent="amber"
      season={season}
      seeAllHref={seeAllHref}
      icon={Goal}
      limit={7}
    />
  );
}

async function TopAssistsSection({ season, seeAllHref }: { season: number; seeAllHref: string }) {
  const entries = await getTopAssists({ season });
  const adapted = entries ? entries.map(toAssistsEntry) : [];
  const t = await getTranslations("dashboard");
  return (
    <StatLeaderboard
      title={t("topAssists")}
      valueLabel={t("topAssistsValue")}
      entries={adapted}
      accent="blue"
      season={season}
      seeAllHref={seeAllHref}
      icon={Sparkles}
      limit={6}
    />
  );
}

async function TopYellowCardsSection({
  season,
  seeAllHref,
}: {
  season: number;
  seeAllHref: string;
}) {
  const entries = await getTopYellowCards({ season });
  const adapted = entries ? entries.map(toYellowCardsEntry) : [];
  const t = await getTranslations("dashboard");
  return (
    <StatLeaderboard
      title={t("yellowCards")}
      valueLabel={t("yellowCardsValue")}
      entries={adapted}
      accent="yellow"
      season={season}
      seeAllHref={seeAllHref}
      icon={Square}
      iconClassName="text-yellow-500 fill-yellow-500"
      limit={8}
    />
  );
}

async function TopRedCardsSection({ season, seeAllHref }: { season: number; seeAllHref: string }) {
  const entries = await getTopRedCards({ season });
  const adapted = entries ? entries.map(toRedCardsEntry) : [];
  const t = await getTranslations("dashboard");
  return (
    <StatLeaderboard
      title={t("redCards")}
      valueLabel={t("redCardsValue")}
      entries={adapted}
      accent="red"
      season={season}
      seeAllHref={seeAllHref}
      icon={Square}
      iconClassName="text-red-500 fill-red-500"
      limit={8}
    />
  );
}

// 7 fixtures (not the default 6) so the Fixtures tile fills to the same height
// as the Yellow / Red leaderboard tiles beside it — without overflowing past
// them (TASK-1504).
async function ClassicMatchesSection({ season }: { season: number }) {
  const matches = await getClassicMatches(season, 7);
  const t = await getTranslations("dashboard");
  // Resolve each catalyst badge descriptor (key + params) → a localized label
  // (TASK-1604); the pure `classicMatches` helper can't translate itself. The
  // goalThriller badge embeds a count → pass a localized-digit display arg so it
  // reads Arabic-Indic on /ar (the ICU `#`/bare-count args stay Latin otherwise).
  const tf = await getTranslations("fixtures");
  const locale = await getLocale();
  const items = (matches ?? []).map((m) => ({
    fixture: m.fixture,
    badge: tf(
      m.badge.key,
      m.badge.total !== undefined
        ? { total: m.badge.total, totalFmt: localizeDigits(m.badge.total, locale) }
        : {},
    ),
  }));
  return (
    <FixtureList
      items={items}
      season={season}
      ariaLabel={t("classicMatches")}
      emptyMessage={t("classicMatchesEmpty")}
    />
  );
}

async function RecentResultsSection({ season }: { season: number }) {
  const fixtures = await getRecentResults({ season, count: 7 });
  const t = await getTranslations("dashboard");
  return (
    <FixtureList
      items={(fixtures ?? []).map((fixture) => ({ fixture }))}
      season={season}
      ariaLabel={t("recentResults")}
      emptyMessage={t("recentResultsEmpty")}
    />
  );
}

// Sized rows mimicking the FixtureList footprint so the tile doesn't shift when
// the fixtures stream in.
function FixtureListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="bg-accent h-8 animate-pulse rounded-md" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground bg-card p-6 text-sm" role="status">
      {message}
    </div>
  );
}
