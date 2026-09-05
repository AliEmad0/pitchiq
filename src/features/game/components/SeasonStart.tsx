"use client";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import type { Formation } from "@/features/game/domain/formation";
import type { SeasonSpec } from "@/features/game/domain/rule-packs";
import { loadRival } from "@/features/game/view/rival-choice";
import { pickOpponents } from "@/features/game/view/season-league";
import { SeasonHub } from "./SeasonHub";
import { clearRun, type SavedRun } from "@/features/game/storage/season-slot";

export interface SeasonStartProps {
  saved?: SavedRun;
  captaincies?: Record<number, number>;
  referees?: readonly string[];
  spec: SeasonSpec;
  coachId: number;
  coachName: string;
  seed: number;
  squad: readonly PoolCard[];
  formation: Formation;
  /** Every club the mode offers, so the league can be drawn from them. */
  clubs: ReadonlyArray<{ id: number; name: string }>;
  season?: number;
  /** Passed straight through to the hub — see `SeasonHubProps.onAbandon`. */
  onAbandon?: () => void;
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
  saved,
  captaincies,
  referees,
  spec,
  coachId,
  coachName,
  seed,
  squad,
  formation,
  clubs,
  season = 2025,
  onAbandon,
}: SeasonStartProps) {
  const t = useTranslations("game");
  const [pools, setPools] = useState<Record<number, PoolCard[]> | null>(null);
  const [failed, setFailed] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [arming, setArming] = useState(false);

  const opponents = useMemo(
    () =>
      saved?.leagueIds?.filter((id) => id !== coachId) ??
      pickOpponents(
        clubs.map((c) => c.id),
        coachId,
        spec.clubs,
        seed,
      ),
    [clubs, coachId, spec.clubs, seed, saved],
  );

  useEffect(() => {
    // The memoized opponents keep ordinary renders from restarting the fetch. Each effect
    // setup owns its controller: Strict Mode cleans up and starts again on mount, so a
    // persistent "started" flag would abort the first fetch and suppress its replacement.
    const ac = new AbortController();
    void (async () => {
      const got: Record<number, PoolCard[]> = {};
      let missing = 0;
      // Sequential on purpose: twenty parallel requests to the same origin is a burst for no
      // gain, and these are static CDN files that resolve fast.
      for (const id of opponents) {
        const rival = await loadRival(id, ac.signal);
        if (ac.signal.aborted) return;
        if (rival == null || rival.cards.length === 0) missing++;
        else got[id] = rival.cards;
      }
      setFailed(missing);
      setPools(got);
    })();
    return () => ac.abort();
  }, [opponents, attempt]);

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
  const leagueIds = saved?.leagueIds ?? [coachId, ...trimmed];
  const clubNames = Object.fromEntries(clubs.map((c) => [c.id, c.name]));
  const allPools: Record<number, PoolCard[]> = { ...pools, [coachId]: [...squad] };

  // A legacy shortened save has no recoverable club order. Never guess its identities.
  if (
    saved != null &&
    (failed > 0 ||
      saved.clubs !== leagueIds.length ||
      (saved.leagueIds == null && saved.clubs !== opponents.length + 1))
  ) {
    return (
      <div className="sh-loading">
        <p role="alert">{t("seasonResumeBlocked")}</p>
        <button
          type="button"
          onClick={() => {
            setPools(null);
            setAttempt((n) => n + 1);
          }}
        >
          {t("seasonRetry")}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!arming) {
              setArming(true);
              return;
            }
            void clearRun().then(() => onAbandon?.());
          }}
        >
          {t(arming ? "seasonAbandonSure" : "seasonAbandon")}
        </button>
      </div>
    );
  }

  return (
    <>
      {failed > 0 ? (
        <p className="sh-shorter" data-testid="season-shorter">
          {t("seasonShorter", { count: failed })}
        </p>
      ) : null}
      <SeasonHub
        captaincies={captaincies}
        referees={referees}
        coachId={coachId}
        coachName={coachName}
        seed={seed}
        pools={allPools}
        clubNames={clubNames}
        leagueIds={leagueIds}
        squad={squad}
        formation={formation}
        season={season}
        onAbandon={onAbandon}
      />
    </>
  );
}
