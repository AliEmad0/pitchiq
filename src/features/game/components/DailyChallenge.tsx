"use client";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { dayFormation, dayKey, dayNumber, daySeeds } from "@/features/game/domain/daily";
import { matchStrip, shareText } from "@/features/game/domain/daily-share";
import { computeStats } from "@/features/game/domain/daily-stats";
import { formationKey } from "@/features/game/domain/formation";
import { hashEvents } from "@/features/game/domain/hash";
import type { RefereeStyle, Weather } from "@/features/game/domain/match-types";
import {
  allDaily,
  loadDaily,
  markStarted,
  saveDaily,
  wasStarted,
  type DailyRecord,
} from "@/features/game/storage/daily-slot";
import { replayMatch } from "@/features/game/view/match-replay";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";
import { createPlayState, playReducer } from "@/features/game/view/play-machine";
import { useMatchDriver } from "@/features/game/view/use-match-driver";
import { localizeDigits } from "@/utils/format";
import { DailyHub } from "./DailyHub";
import { DailyPreview } from "./DailyPreview";
import { DecisionPrompt } from "./DecisionPrompt";
import { MatchView } from "./MatchView";

/** Seconds a decision waits before answering itself. Mirrors GamePlay. */
const DECISION_LIMIT = 20;

/**
 * TASK-1817 — one deterministic challenge per day.
 *
 * The same formation, the same eleven hands and the same opponent for everyone, all
 * derived from the UTC date. Skill shows up in who you pick and how you coach.
 *
 * ⚠️ The day resolves AFTER MOUNT, never during render. `/game/daily` is `force-static`,
 * so a day read during render would bake one visitor's challenge into the CDN copy and
 * serve it to everyone until the next revalidation.
 *
 * ⚠️ This container owns the day and the record; `useMatchDriver` owns the match and
 * `playReducer` owns the phase. Three owners, no overlap.
 */
export function DailyChallenge({ pool }: { pool: PoolCard[] }) {
  const t = useTranslations("game");
  const locale = useLocale();
  const [state, dispatch] = useReducer(playReducer, createPlayState("setup"));
  const driver = useMatchDriver();

  /** Null until mount resolves it — also the "is the shell still cold" flag. */
  const [today, setToday] = useState<string | null>(null);
  const [record, setRecord] = useState<DailyRecord | null>(null);
  const [history, setHistory] = useState<DailyRecord[]>([]);
  const [spent, setSpent] = useState(false);
  const [copied, setCopied] = useState(false);

  /**
   * ⚠️ ANCHORED AT KICKOFF, immutable for the rest of the session.
   *
   * A match can straddle midnight. Kicking off at 23:58 and finishing at 00:03 must record
   * under the day it BEGAN, so nothing inside a live session may call `dayKey(new Date())`
   * again — this is the only day that session knows.
   */
  const [kickoffDayKey, setKickoffDayKey] = useState<string | null>(null);
  const [squad, setSquad] = useState<{ cardIds: PlayerSeasonId[] } | null>(null);

  const hydrate = useCallback(async (key: string) => {
    const [mine, all] = await Promise.all([loadDaily(key), allDaily()]);
    setToday(key);
    setRecord(mine);
    setHistory(all);
    // The tamper speed bump: no record but a marker for THIS day means storage was
    // cleared mid-challenge. See `markStarted` for why this is a bump, not a lock.
    setSpent((mine?.done ?? false) || (mine == null && wasStarted(key)));
  }, []);

  useEffect(() => {
    void hydrate(dayKey(new Date()));
  }, [hydrate]);

  /**
   * Re-hydrate when the date moves under a tab left open overnight.
   *
   * ⚠️ Never mid-match. A live session runs to full time under its anchored key; the hub
   * catches up when the coach returns, which is the first moment it costs nothing.
   */
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "hidden") return;
      const now = dayKey(new Date());
      if (now === today || state.phase === "live") return;
      void hydrate(now);
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [today, state.phase, hydrate]);

  /**
   * Resume an unfinished attempt.
   *
   * ⚠️ CURRENT DAY ONLY. An earlier day's unfinished record is never offered — resuming it
   * would put two challenges on one screen, and `computeStats` already reads it as "not
   * won". The seed and formation come from the day, never from the record.
   */
  useEffect(() => {
    if (today == null || record == null || record.done || record.day !== today) return;
    if (state.phase !== "setup") return;
    const restored = replayMatch(
      pool,
      {
        cardIds: record.cardIds,
        formationKey: formationKey(dayFormation(today)),
        seed: daySeeds(today).match,
        answers: record.answers,
        fingerprint: record.fingerprint,
        eventCount: record.eventCount,
      },
      { home: t("yourXi"), away: t("rivals") },
    );
    // Null means the pool or the engine moved under it. A stale save is not the coach's
    // problem — the day simply reopens at the draft room.
    if (restored == null) return;
    setKickoffDayKey(record.day);
    setSquad({ cardIds: record.cardIds });
    driver.adopt(restored);
    dispatch({ type: "resume", seed: restored.session.seed });
    // Mount-driven, like GamePlay's restore effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, record]);

  /** Persist on kickoff and after every answer, always under the ANCHORED key. */
  useEffect(() => {
    if (state.phase !== "live" || kickoffDayKey == null || squad == null) return;
    const next: DailyRecord = {
      day: kickoffDayKey,
      cardIds: squad.cardIds,
      answers: driver.answers,
      fingerprint: hashEvents(driver.events),
      eventCount: driver.events.length,
      done: driver.result != null,
      score: driver.result?.score,
    };
    void (async () => {
      await saveDaily(next);
      // Full time: re-read the history so the streak shown in the share includes today.
      if (next.done) {
        setRecord(next);
        setHistory(await allDaily());
        setSpent(true);
      }
    })();
  }, [state.phase, kickoffDayKey, squad, driver.answers, driver.events, driver.result]);

  const model = useMemo(() => {
    if (driver.match == null || driver.events.length === 0) return null;
    return buildMatchViewModel(driver.match.home, driver.match.away, {
      score: { home: 0, away: 0 },
      events: driver.events,
      seed: driver.match.seed,
    });
  }, [driver.match, driver.events]);

  // ⚠️ The cold shell. No day, no number, nothing a CDN copy could staleley assert.
  if (today == null) {
    return <div data-testid="daily-loading" className="min-h-40" aria-busy="true" />;
  }

  const stats = computeStats(history, today);
  const formation = dayFormation(today);
  const seeds = daySeeds(today);
  const n = (v: number) => localizeDigits(v, locale);

  const streakLine = (
    <p className="mt-4 font-mono text-lg" data-testid="daily-stats">
      {t("dailyStreak", { streak: n(stats.currentStreak), best: n(stats.bestStreak) })}
    </p>
  );

  if (spent && state.phase === "setup") {
    return (
      <div data-testid="daily-spent" className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-extrabold tracking-tight">
          {t("dailyTitle", { n: n(dayNumber(today)) })}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {record?.done === true ? t("dailySpentDone") : t("dailySpentCleared")}
        </p>
        {record?.done === true && record.score != null ? (
          <p className="mt-3 font-mono text-3xl font-extrabold" data-testid="daily-score">
            {n(record.score.home)}–{n(record.score.away)}
          </p>
        ) : null}
        {streakLine}
      </div>
    );
  }

  if (state.phase === "setup") {
    // TASK-1836 — the owner's "Arcade Cabinet" hub replaces the plain header + room.
    return (
      <DailyHub
        pool={pool}
        today={today}
        dayNumber={dayNumber(today)}
        formation={formation}
        seed={seeds.deal}
        stats={stats}
        history={history}
        onComplete={(cardIds) => {
          const byId = new Map(pool.map((c) => [c.cardId, c]));
          const players = cardIds.map((id) => byId.get(id)).filter((c): c is PoolCard => c != null);
          setSquad({ cardIds });
          driver.start(pool, players, formation, seeds.match, {
            home: t("yourXi"),
            away: t("rivals"),
          });
          dispatch({ type: "confirmSquad", seed: seeds.match });
        }}
      />
    );
  }

  if (state.phase === "preview" && driver.match != null) {
    return (
      <DailyPreview
        home={driver.match.home}
        // ⛔ The REAL opponent, straight out of the session the coach is about to play.
        away={driver.match.away}
        referee={
          (driver.events.find((e) => e.kind === "referee")?.refStyle ?? null) as RefereeStyle | null
        }
        weather={
          (driver.events.find((e) => e.kind === "weather")?.weather ?? null) as Weather | null
        }
        onKickOff={() => {
          // ⚠️ THE COMMIT POINT. The day is spent here and its key frozen for the session.
          const anchor = dayKey(new Date());
          setKickoffDayKey(anchor);
          markStarted(anchor);
          dispatch({ type: "kickOff" });
        }}
      />
    );
  }

  const text =
    driver.result == null
      ? null
      : shareText({
          // ⚠️ The ANCHORED day, so a match played across midnight shares as the day it
          // began rather than the day it happened to finish.
          dayNumber: dayNumber(kickoffDayKey ?? today),
          formationName: formation.name,
          score: driver.result.score,
          strip: matchStrip(driver.events, "home"),
          currentStreak: stats.currentStreak,
          bestStreak: stats.bestStreak,
          url: typeof window === "undefined" ? "" : `${window.location.origin}/game/daily`,
          locale,
          labels: { title: t("dailyShareTitle"), win: "✅", draw: "🤝", loss: "❌" },
        });

  return (
    <div>
      {model != null ? (
        <MatchView
          model={model}
          holdAt={driver.pending?.minute ?? (driver.result == null ? 0 : undefined)}
        />
      ) : null}
      {driver.pending != null ? (
        <DecisionPrompt decision={driver.pending} limit={DECISION_LIMIT} onAnswer={driver.answer} />
      ) : null}
      {text != null ? (
        <div data-testid="daily-result" className="mt-4">
          <pre className="border-border bg-muted rounded-md border p-4 font-mono text-sm whitespace-pre-wrap">
            {text}
          </pre>
          <button
            type="button"
            data-testid="daily-copy"
            onClick={() => {
              void navigator.clipboard?.writeText(text).then(() => setCopied(true));
            }}
            className="bg-primary text-primary-foreground mt-3 rounded-md px-5 py-2 text-sm font-bold"
          >
            {copied ? t("dailyShareCopied") : t("dailyShareCopy")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
