"use client";

import { useLocale, useTranslations } from "next-intl";
import { parseAsInteger, useQueryState } from "nuqs";
import { useEffect, useRef, useState } from "react";

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

// Client season swap for `/players/[id]`. The server renders the current
// season (SSG/cached); picking a historical season fetches it here and swaps
// the subtree — no full RSC navigation, so the page stays statically cached.
// The URL syncs shallowly (`shallow:true`) so a shared `?season=` deep link
// loads the static shell, then this reads the param and fetches on mount.
export function PlayerSeasonView({
  playerId,
  seasons,
  initialSeason,
  initialProfile,
  initialFacts,
  clubLogos,
  displayName,
}: {
  playerId: number;
  seasons: number[];
  initialSeason: number;
  initialProfile: PlayerProfile | null;
  initialFacts: TriviaFact[];
  clubLogos: ClubLogosFile | null;
  displayName: string;
}) {
  const t = useTranslations("players");
  const locale = useLocale();

  const [season, setSeason] = useQueryState(
    "season",
    parseAsInteger.withDefault(initialSeason).withOptions({
      shallow: true,
      history: "push",
      clearOnDefault: true,
    }),
  );

  const [profile, setProfile] = useState<PlayerProfile | null>(initialProfile);
  const [facts, setFacts] = useState<TriviaFact[]>(initialFacts);
  const [loading, setLoading] = useState(false);
  // Cache initial-season data so returning to it never refetches.
  const initialRef = useRef({ profile: initialProfile, facts: initialFacts });

  useEffect(() => {
    let cancelled = false;
    if (season === initialSeason) {
      setProfile(initialRef.current.profile);
      setFacts(initialRef.current.facts);
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
      const nextProfile = pRes.ok ? ((await pRes.json()).profile as PlayerProfile) : null;
      const nextFacts = tRes.ok ? ((await tRes.json()).facts as TriviaFact[]) : [];
      if (cancelled) return;
      setProfile(nextProfile);
      setFacts(nextFacts);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [season, initialSeason, playerId, locale]);

  const name = profile?.name ?? displayName;

  return (
    <main className="container-page space-y-6 py-6 lg:py-10">
      <PlayerSeasonSelect seasons={seasons} value={season} onChange={(s) => void setSeason(s)} />
      {loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : profile ? (
        <>
          <PlayerHero player={profile} season={season} />
          <PlayerSeasonStats metrics={profile.metrics} />
          {profile.splits && (
            <PlayerSeasonSplits splits={profile.splits} season={season} clubLogos={clubLogos} />
          )}
          {facts.length > 0 && <TriviaCard facts={facts} className="mt-10!" />}
        </>
      ) : (
        <DataUnavailable
          title={t("noSeasonData", { season: formatSeasonLabel(season, locale) })}
          message={t("noSeasonDataMsg", {
            name,
            season: formatSeasonLabel(season, locale),
            latest: formatSeasonLabel(seasons[0], locale),
          })}
        />
      )}
    </main>
  );
}
