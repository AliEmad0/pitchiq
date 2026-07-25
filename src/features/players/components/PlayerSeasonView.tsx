"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";

import { DataUnavailable } from "@/components/DataUnavailable";
import { Skeleton } from "@/components/ui/skeleton";
import type { ClubLogosFile } from "@/data/schemas";
import type { PlayerProfile } from "@/features/players/api";
import { PlayerHero } from "@/features/players/components/PlayerHero";
import { PlayerSeasonSelect } from "@/features/players/components/PlayerSeasonSelect";
import { PlayerSeasonSplits } from "@/features/players/components/PlayerSeasonSplits";
import { PlayerSeasonStats } from "@/features/players/components/PlayerSeasonStats";
import { playerProfileUrl, playerTriviaUrl } from "@/features/players/season-url";
import { TriviaCard } from "@/features/trivia/components/TriviaCard";
import type { TriviaFact } from "@/features/trivia/types";
import { formatSeasonLabel } from "@/utils/season";

// Client season swap for `/players/[id]`.
//
// The CURRENT season's content is server-rendered and passed in as `children`
// (RSC) — it is NOT re-executed on the client, so the initial render's hydration
// profile is identical to a plain server page (PlayerHero/Splits stay RSC,
// PlayerSeasonStats/TriviaCard stay the same client islands as before). That
// keeps the page statically prerenderable (the Vercel Active-CPU fix) with no
// hydration mismatch.
//
// Only when the user picks a DIFFERENT season (or lands via a `?season=` deep
// link) do we fetch that season and render it client-side, replacing `children`.
// Season syncs to the URL via `window.location` + `history.pushState` — NOT
// `useSearchParams` (that would bail static prerender; see CLAUDE.md).
export function PlayerSeasonView({
  playerId,
  seasons,
  initialSeason,
  displayName,
  clubLogos,
  children,
}: {
  playerId: number;
  seasons: number[];
  initialSeason: number;
  displayName: string;
  clubLogos: ClubLogosFile | null;
  children: ReactNode;
}) {
  const t = useTranslations("players");
  const locale = useLocale();

  const [season, setSeason] = useState(initialSeason);
  const [swapped, setSwapped] = useState<{ profile: PlayerProfile | null; facts: TriviaFact[] } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  // Honour a `?season=` deep link on mount (client-only; runs AFTER hydration so
  // it never causes a mismatch). Any valid season is honoured — an unplayed one
  // 404s below → the DataUnavailable empty-state (TASK-703 / TASK-803).
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("season");
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isInteger(parsed) && parsed !== initialSeason) setSeason(parsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch + swap whenever the season moves away from the initial (server) one.
  useEffect(() => {
    let cancelled = false;
    if (season === initialSeason) {
      setSwapped(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const [pRes, tRes] = await Promise.all([
        fetch(playerProfileUrl(playerId, season, locale)),
        fetch(playerTriviaUrl(playerId, season)),
      ]);
      if (cancelled) return;
      const profile = pRes.ok ? ((await pRes.json()).profile as PlayerProfile) : null;
      const facts = tRes.ok ? ((await tRes.json()).facts as TriviaFact[]) : [];
      if (cancelled) return;
      setSwapped({ profile, facts });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [season, initialSeason, playerId, locale]);

  function changeSeason(next: number) {
    setSeason(next);
    // Shallow URL sync (Next 15 supports history.pushState) — no RSC refetch.
    const path = window.location.pathname;
    window.history.pushState(null, "", next === initialSeason ? path : `${path}?season=${next}`);
  }

  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <PlayerSeasonSelect seasons={seasons} value={season} onChange={changeSeason} />
      {season === initialSeason ? (
        children
      ) : loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : swapped?.profile ? (
        <>
          <PlayerHero player={swapped.profile} season={season} />
          <PlayerSeasonStats metrics={swapped.profile.metrics} />
          {swapped.profile.splits && (
            <PlayerSeasonSplits splits={swapped.profile.splits} season={season} clubLogos={clubLogos} />
          )}
          {swapped.facts.length > 0 && <TriviaCard facts={swapped.facts} className="mt-10!" />}
        </>
      ) : (
        <DataUnavailable
          title={t("noSeasonData", { season: formatSeasonLabel(season, locale), name: displayName })}
          message={t("noSeasonDataMsg", {
            name: displayName,
            season: formatSeasonLabel(season, locale),
            latest: formatSeasonLabel(seasons[0], locale),
          })}
          cta={{
            href: `/players/${playerId}?season=${seasons[0]}`,
            label: t("viewSeasonStats", { season: formatSeasonLabel(seasons[0], locale) }),
          }}
        />
      )}
    </main>
  );
}
