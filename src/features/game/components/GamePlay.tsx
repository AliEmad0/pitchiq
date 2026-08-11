"use client";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import type { Formation } from "@/features/game/domain/formation";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import type {
  MatchEvent,
  MatchResult,
  RefereeStyle,
  Weather,
} from "@/features/game/domain/match-types";
import type { GameTeam } from "@/features/game/domain/team";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";
import { buildSession } from "@/features/game/view/match-session";
import type { StreamStep } from "@/features/game/view/match-stream";
import { createPlayState, playReducer, type PlayPhase } from "@/features/game/view/play-machine";
import { randomSeed } from "@/features/game/view/seed";
import { DecisionPrompt } from "./DecisionPrompt";
import { DraftHub } from "./DraftHub";
import { MatchSummary } from "./MatchSummary";
import { MatchupPreview } from "./MatchupPreview";
import { MatchView } from "./MatchView";

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

  const streamRef = useRef<ReturnType<typeof createStream> | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [pending, setPending] = useState<MatchDecision | null>(null);
  const [answers, setAnswers] = useState<DecisionAnswer[]>([]);
  const [result, setResult] = useState<MatchResult | null>(null);

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

  if (state.phase === "setup" || match == null) {
    return <DraftHub pool={pool} onConfirm={confirmSquad} />;
  }

  if (state.phase === "preview") {
    return (
      <MatchupPreview
        homeName={match.home.name}
        awayName={match.away.name}
        referee={referee}
        weather={weather}
        onKickOff={() => dispatch({ type: "kickOff" })}
        onBack={() => dispatch({ type: "backToSetup" })}
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
        onNewMatch={() => dispatch({ type: "newMatch" })}
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
          onClick={() => dispatch({ type: "fullTime" })}
          className="bg-primary text-primary-foreground mt-4 rounded-md px-5 py-2 text-sm font-bold"
        >
          {t("playFullTime")}
        </button>
      ) : null}
    </div>
  );
}
