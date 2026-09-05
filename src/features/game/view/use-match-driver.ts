"use client";
import { useCallback, useRef, useState } from "react";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import type { Formation } from "@/features/game/domain/formation";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import type { MatchEvent, MatchResult } from "@/features/game/domain/match-types";
import type { GameTeam } from "@/features/game/domain/team";
import {
  buildSession,
  type MatchSession,
  type RivalSetup,
  type SessionNames,
} from "./match-session";
import type { StreamStep } from "./match-stream";

export interface DrivenMatch {
  home: GameTeam;
  away: GameTeam;
  seed: number;
}

/** What an already-replayed match hands over. Matches `RestoredMatch`/`ReplayedMatch`. */
export interface AdoptableMatch {
  session: MatchSession;
  events: MatchEvent[];
  answers: DecisionAnswer[];
  pending: MatchDecision | null;
  result: MatchResult | null;
}

export interface MatchDriver {
  match: DrivenMatch | null;
  events: MatchEvent[];
  answers: DecisionAnswer[];
  pending: MatchDecision | null;
  result: MatchResult | null;
  start: (
    pool: PoolCard[],
    players: PoolCard[],
    formation: Formation,
    seed: number,
    names: SessionNames,
    /** Who he is playing, and how that side drafts. See `buildSession`. */
    rival?: RivalSetup,
  ) => void;
  /** Start an exact prepared session without drafting either side again. */
  startSession: (session: MatchSession) => void;
  answer: (a: DecisionAnswer) => void;
  adopt: (replayed: AdoptableMatch) => void;
}

/**
 * The glue that DRIVES a match: the generator, and the state folded out of it.
 *
 * Extracted from `GamePlay` for TASK-1817 so a second container — the daily challenge —
 * can run the same engine without either duplicating this (resume and share drifting
 * apart is precisely the bug TASK-1812 collapsed into one path) or teaching `GamePlay`
 * about game modes, which the locked "modes are rule packs, not code paths" rule forbids.
 *
 * ⚠️ Only the coach's decisions surface here. `createStream` answers the opponent's with
 * `defaultAnswer` — every decision the engine raises must be answered or the generator
 * hangs, and the away side behaving exactly as it does in a batch match is deliberate.
 *
 * ⚠️ This owns the match; it does NOT own the phase. The container keeps `playReducer` as
 * the single driver of phase, so the two cannot disagree about where the coach is.
 */
export function useMatchDriver(): MatchDriver {
  const streamRef = useRef<MatchSession["stream"] | null>(null);
  const [match, setMatch] = useState<DrivenMatch | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [answers, setAnswers] = useState<DecisionAnswer[]>([]);
  const [pending, setPending] = useState<MatchDecision | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);

  /**
   * The decision waiting to be answered, as a REF.
   *
   * ⛔ A second source of truth for `pending`, and it earns its keep: `answer` has to know
   * synchronously whether the decision it was handed has already been answered, and React
   * state is not readable that way inside the same tick. See the claim in `answer`.
   */
  const awaiting = useRef<MatchDecision | null>(null);

  /** Fold one step of the stream into view state. */
  const consume = useCallback((step: StreamStep) => {
    setEvents((prior) => [...prior, ...step.events]);
    if (step.kind === "done") {
      awaiting.current = null;
      setResult(step.result);
      setPending(null);
    } else {
      awaiting.current = step.decision;
      setPending(step.decision);
    }
  }, []);

  const startSession = useCallback(
    (session: MatchSession) => {
      streamRef.current = session.stream;
      setMatch({ home: session.home, away: session.away, seed: session.seed });
      setEvents([]);
      setAnswers([]);
      setResult(null);
      consume(session.stream.advance());
    },
    [consume],
  );

  const start = useCallback<MatchDriver["start"]>(
    (pool, players, formation, seed, names, rival) => {
      startSession(buildSession(pool, players, formation, seed, names, rival));
    },
    [startSession],
  );

  /**
   * Answer the decision the engine is waiting on.
   *
   * ⛔ THE CLAIM IS THE POINT, and it is what makes a match reproducible.
   *
   * Every answer path funnels through here — the live screen's auto-answer effect, its
   * 20-second expiry, the bench dialog, the emergency keeper, the shipped `DecisionPrompt`
   * — and a decision answered TWICE both records a duplicate in `answers` and advances the
   * stream by an extra decision, which the second answer then answers with a reply shaped
   * for the first. The saved match and the share code carry that duplicate, and the replay
   * — which cannot duplicate anything — mismatches on it. It presents as "your link does
   * not work", pointing at the codec rather than at the double call.
   *
   * ⭐ Found by measurement, not by reading: a Legacy match played in the browser produced a
   * token stream beginning `h~h` for a match with ONE goal against, and the replay's second
   * decision was the 55th-minute substitution offer. React's StrictMode double-invokes
   * effects in development, so the auto-answer effect fired twice on mount — but the same
   * shape is reachable in production any time two paths answer in one tick, which is why
   * the guard lives here rather than in the effect.
   *
   * The claim is synchronous (a ref, not state) because both calls happen before React
   * commits either one.
   */
  const answer = useCallback<MatchDriver["answer"]>(
    (a) => {
      const stream = streamRef.current;
      const waiting = awaiting.current;
      if (stream == null || waiting == null) return;
      /**
       * ⛔ The answer must be FOR the decision the engine is waiting on.
       *
       * ⚠️ "Is anything pending?" is NOT enough, and that weaker guard was written first: by
       * the time the duplicate arrives the stream has already advanced, so something always
       * is. The stale answer then answers the NEXT decision — measured in the browser as
       * `answer(response@30)` landing while the engine awaited `sub-offer@55`.
       *
       * Every legitimate answer is built FROM the decision it answers — `answerFor`,
       * `defaultAnswer`, the bench dialog, the emergency keeper and the token replay all copy
       * its `minute` and `side` — so this can only ever reject a stale one.
       */
      if (a.kind !== waiting.kind || a.minute !== waiting.minute || a.side !== waiting.side) {
        return;
      }
      awaiting.current = null;
      setAnswers((prior) => [...prior, a]);
      setPending(null);
      consume(stream.answer(a));
    },
    [consume],
  );

  const adopt = useCallback<MatchDriver["adopt"]>((replayed) => {
    streamRef.current = replayed.session.stream;
    // ⛔ Seeded, or a RESUMED match refuses its very first answer and the clock never moves.
    awaiting.current = replayed.pending;
    setMatch({
      home: replayed.session.home,
      away: replayed.session.away,
      seed: replayed.session.seed,
    });
    setEvents(replayed.events);
    setAnswers(replayed.answers);
    setPending(replayed.pending);
    setResult(replayed.result);
  }, []);

  return { match, events, answers, pending, result, start, startSession, answer, adopt };
}
