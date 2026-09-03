"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import type { SeasonSpec } from "@/features/game/domain/rule-packs";
import { loadRival } from "@/features/game/view/rival-choice";
import { pickOpponents } from "@/features/game/view/season-league";
import { SeasonHub } from "./SeasonHub";

export interface SeasonStartProps {
  spec: SeasonSpec;
  coachId: number;
  coachName: string;
  seed: number;
  squad: readonly PoolCard[];
  formationKey: string;
  /** Every club the mode offers, so the league can be drawn from them. */
  clubs: ReadonlyArray<{ id: number; name: string }>;
  season?: number;
}

/**
 * TASK-1811 PR 2 — everything a season needs before its hub can exist.
 *
 * ⛔ The 19 opponents are FETCHED, not prerendered into the page. Each club's squad is already
 * one static CDN file at `/api/game/rivals/[club]` (~24–31 KB), so a league costs ~530 KB once,
 * at run creation. Baking twenty squads into every club's page instead would have multiplied
 * the biggest payload in the app by twenty, on 51 prerendered pages.
 */
export function SeasonStart({
  spec,
  coachId,
  coachName,
  seed,
  squad,
  formationKey,
  clubs,
  season = 2025,
}: SeasonStartProps) {
  const t = useTranslations("game");
  const [pools, setPools] = useState<Record<number, PoolCard[]> | null>(null);
  const [failed, setFailed] = useState(0);
  const started = useRef(false);

  const opponents = useMemo(
    () =>
      pickOpponents(
        clubs.map((c) => c.id),
        coachId,
        spec.clubs,
        seed,
      ),
    [clubs, coachId, spec.clubs, seed],
  );

  useEffect(() => {
    // ⚠️ Once. The league is part of the run's identity — re-fetching on a re-render could
    // hand the hub a different set of clubs mid-season.
    if (started.current) return;
    started.current = true;
    const ac = new AbortController();
    void (async () => {
      const got: Record<number, PoolCard[]> = {};
      let missing = 0;
      // Sequential on purpose: twenty parallel requests to the same origin is a burst for no
      // gain, and these are static CDN files that resolve fast.
      for (const id of opponents) {
        const rival = await loadRival(id, ac.signal);
        if (ac.signal.aborted) return;
        if (rival == null) missing++;
        else got[id] = rival.cards;
      }
      setFailed(missing);
      setPools(got);
    })();
    return () => ac.abort();
  }, [opponents]);

  if (pools == null) {
    return (
      <p className="sh-loading" data-testid="season-loading">
        {t("seasonBuilding")}
      </p>
    );
  }

  /**
   * ⚠️ The coach is ALWAYS index 0 and his own XI is the one he drafted — it is never rebuilt
   * from a rival pool, because a season is "draft once and live with it".
   *
   * ⚠️ The league is trimmed to an EVEN count. `seasonFixtures` needs one, and a club whose
   * squad failed to load is simply absent rather than faked, so a flaky fetch shortens the
   * league instead of breaking the run.
   */
  const usable = opponents.filter((id) => pools[id] != null);
  const trimmed = usable.length % 2 === 0 ? usable.slice(0, usable.length - 1) : usable;
  const leagueIds = [coachId, ...trimmed];
  const clubNames = Object.fromEntries(clubs.map((c) => [c.id, c.name]));
  const allPools: Record<number, PoolCard[]> = { ...pools, [coachId]: [...squad] };

  return (
    <>
      {failed > 0 ? (
        <p className="sh-shorter" data-testid="season-shorter">
          {t("seasonShorter", { count: failed })}
        </p>
      ) : null}
      <SeasonHub
        coachId={coachId}
        coachName={coachName}
        seed={seed}
        pools={allPools}
        clubNames={clubNames}
        leagueIds={leagueIds}
        squad={squad}
        formationKey={formationKey}
        season={season}
      />
    </>
  );
}
