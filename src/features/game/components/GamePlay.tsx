"use client";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationKey, type Formation } from "@/features/game/domain/formation";
import { hashEvents } from "@/features/game/domain/hash";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import type {
  MatchEvent,
  MatchResult,
  RefereeStyle,
  Weather,
} from "@/features/game/domain/match-types";
import type { GameTeam } from "@/features/game/domain/team";
import { clearMatch, loadMatch, saveMatch } from "@/features/game/storage/match-slot";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";
import { replayMatch, type RestoredMatch } from "@/features/game/view/match-replay";
import { buildSession, type MatchSession } from "@/features/game/view/match-session";
import type { StreamStep } from "@/features/game/view/match-stream";
import { createPlayState, playReducer, type PlayPhase } from "@/features/game/view/play-machine";
import { scoreAt } from "@/features/game/view/score";
import { randomSeed } from "@/features/game/view/seed";
import { DecisionPrompt } from "./DecisionPrompt";
import { DraftHub } from "./DraftHub";
import { MatchSummary } from "./MatchSummary";
import { MatchupPreview } from "./MatchupPreview";
import { MatchView } from "./MatchView";
import { ResumeDialog } from "./ResumeDialog";

/** Seconds a decision waits before answering itself. Extendable per WCAG 2.2.1. */
const DECISION_LIMIT = 20;

interface Match {
  home: GameTeam;
  away: GameTeam;
  seed: number;
}

/**
 * The match session: draft → preview → live → summary, in one container.
 *
 * It owns the generator, which is the whole point. `MatchView` renders a match; this
 * DRIVES one, feeding the view a model that grows segment by segment and pausing the
 * clock wherever the coach has a decision to make.
 *
 * ⚠️ Only the coach's decisions surface. `createStream` answers the opponent's with
 * `defaultAnswer` — every decision the engine raises must be answered or the generator
 * hangs, and the away side behaving exactly as it does in a batch match is deliberate.
 */
export function GamePlay({ pool, initialPhase }: { pool: PoolCard[]; initialPhase?: PlayPhase }) {
  const t = useTranslations("game");
  const [state, dispatch] = useReducer(playReducer, createPlayState(initialPhase));

  const streamRef = useRef<MatchSession["stream"] | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [pending, setPending] = useState<MatchDecision | null>(null);
  const [answers, setAnswers] = useState<DecisionAnswer[]>([]);
  const [result, setResult] = useState<MatchResult | null>(null);
  /** What the coach drafted, kept so the live match can be written to storage. */
  const [squad, setSquad] = useState<{ cardIds: PlayerSeasonId[]; formationKey: string } | null>(
    null,
  );
  /** An unfinished match found in storage, replayed and verified, awaiting the coach. */
  const [offer, setOffer] = useState<RestoredMatch | null>(null);

  /** Fold one step of the stream into view state. */
  const consume = useCallback((step: StreamStep) => {
    setEvents((prior) => [...prior, ...step.events]);
    if (step.kind === "done") {
      setResult(step.result);
      setPending(null);
    } else {
      setPending(step.decision);
    }
  }, []);

  /**
   * Build the match and run to the first decision.
   *
   * The first segment is what carries the referee and the weather — they are the first
   * two draws inside `runMatch`, so reading them here is the only way to show the coach
   * the official who is actually taking charge.
   */
  const confirmSquad = (players: PoolCard[], formation: Formation) => {
    const seed = randomSeed();
    const session = buildSession(pool, players, formation, seed, {
      home: t("yourXi"),
      away: t("rivals"),
    });
    streamRef.current = session.stream;
    setSquad({
      cardIds: players.map((p) => p.cardId),
      formationKey: formationKey(formation),
    });

    setMatch({ home: session.home, away: session.away, seed });
    setEvents([]);
    setAnswers([]);
    setResult(null);
    consume(session.stream.advance());
    dispatch({ type: "confirmSquad", seed });
  };

  const answer = (a: DecisionAnswer) => {
    const stream = streamRef.current;
    if (stream == null) return;
    setAnswers((prior) => [...prior, a]);
    setPending(null);
    consume(stream.answer(a));
  };

  /**
   * Look for an unfinished match, once, after mount.
   *
   * ⚠️ After mount, never during render. All four `/game/*` routes are `force-static`
   * and the prerender has no IndexedDB — reading during render would fail the build or
   * bake one visitor's match into the CDN copy.
   */
  useEffect(() => {
    let live = true;
    void (async () => {
      const record = await loadMatch();
      if (!live || record == null) return;
      const restored = replayMatch(pool, record, { home: t("yourXi"), away: t("rivals") });
      if (!live) return;
      if (restored == null) {
        // Diverged, or the pool moved under it. A stale save is not the coach's problem.
        void clearMatch();
        return;
      }
      setOffer(restored);
    })();
    return () => {
      live = false;
    };
    // Mount only: `pool` is a build-time constant and `t` is stable for the locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Persist the live match — on kick-off and after every answer, roughly six writes.
   *
   * Gated on `live` because the slot holds a live match ONLY (owner decision): saving at
   * the preview would offer a resume into a match that had not started.
   */
  useEffect(() => {
    if (state.phase !== "live" || match == null || squad == null || result != null) return;
    void saveMatch({
      cardIds: squad.cardIds,
      formationKey: squad.formationKey,
      seed: match.seed,
      answers,
      fingerprint: hashEvents(events),
      eventCount: events.length,
    });
  }, [state.phase, match, squad, answers, events, result]);

  const resume = () => {
    if (offer == null) return;
    streamRef.current = offer.session.stream;
    setMatch({ home: offer.session.home, away: offer.session.away, seed: offer.session.seed });
    setEvents(offer.events);
    setAnswers(offer.answers);
    setResult(offer.result);
    setPending(offer.pending);
    // ⚠️ Taken from the RECORD, never reconstructed from the session: a resumed match must
    // keep saving under the same identity, and `GameTeam` holds cards rather than the
    // formation key. Rebuilding either would be a second source of truth.
    setSquad({ cardIds: offer.record.cardIds, formationKey: offer.record.formationKey });
    setOffer(null);
    dispatch({ type: "resume", seed: offer.session.seed });
  };

  const startOver = () => {
    setOffer(null);
    void clearMatch();
  };

  // The model is rebuilt from the events we have so far, so the view always renders a
  // complete-looking match that simply has not finished arriving yet.
  const model = useMemo(() => {
    if (match == null || events.length === 0) return null;
    return buildMatchViewModel(match.home, match.away, {
      score: { home: 0, away: 0 },
      events,
      seed: match.seed,
    });
  }, [match, events]);

  const referee = useMemo(
    () => (events.find((e) => e.kind === "referee")?.refStyle ?? null) as RefereeStyle | null,
    [events],
  );
  const weather = useMemo(
    () => (events.find((e) => e.kind === "weather")?.weather ?? null) as Weather | null,
    [events],
  );

  // Where the match was left. Passed to `scoreAt` so a goal still under VAR review shows
  // as it stood at that moment rather than as the verdict later made it.
  const restoredMinute = offer?.events[offer.events.length - 1]?.minute ?? 0;

  if (state.phase === "setup" || match == null) {
    return (
      <>
        <DraftHub pool={pool} onConfirm={confirmSquad} />
        {offer != null ? (
          <ResumeDialog
            homeName={offer.session.home.name}
            awayName={offer.session.away.name}
            score={scoreAt(offer.events, restoredMinute)}
            minute={restoredMinute}
            onResume={resume}
            onStartOver={startOver}
          />
        ) : null}
      </>
    );
  }

  if (state.phase === "preview") {
    return (
      <MatchupPreview
        homeName={match.home.name}
        awayName={match.away.name}
        referee={referee}
        weather={weather}
        onKickOff={() => dispatch({ type: "kickOff" })}
        onBack={() => {
          // ⚠️ Cleared in the handler, never in an effect. An effect gated on "phase is
          // not live" would race the restore effect on mount and wipe the record before
          // it could be read.
          void clearMatch();
          dispatch({ type: "backToSetup" });
        }}
      />
    );
  }

  if (state.phase === "summary" && result != null) {
    return (
      <MatchSummary
        homeName={match.home.name}
        awayName={match.away.name}
        score={result.score}
        decisions={answers}
        seed={match.seed}
        onNewMatch={() => {
          void clearMatch();
          dispatch({ type: "newMatch" });
        }}
      />
    );
  }

  return (
    <div>
      {model != null ? (
        <MatchView model={model} holdAt={pending?.minute ?? (result == null ? 0 : undefined)} />
      ) : null}
      {pending != null ? (
        <DecisionPrompt decision={pending} limit={DECISION_LIMIT} onAnswer={answer} />
      ) : null}
      {result != null ? (
        <button
          type="button"
          onClick={() => {
            void clearMatch();
            dispatch({ type: "fullTime" });
          }}
          className="bg-primary text-primary-foreground mt-4 rounded-md px-5 py-2 text-sm font-bold"
        >
          {t("playFullTime")}
        </button>
      ) : null}
    </div>
  );
}
