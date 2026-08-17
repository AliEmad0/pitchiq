"use client";
import { useCallback, useRef, useState } from "react";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import type { Formation } from "@/features/game/domain/formation";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import type { MatchEvent, MatchResult } from "@/features/game/domain/match-types";
import type { GameTeam } from "@/features/game/domain/team";
import { buildSession, type MatchSession, type SessionNames } from "./match-session";
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
  ) => void;
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

  const start = useCallback<MatchDriver["start"]>(
    (pool, players, formation, seed, names) => {
      const session = buildSession(pool, players, formation, seed, names);
      streamRef.current = session.stream;
      setMatch({ home: session.home, away: session.away, seed });
      setEvents([]);
      setAnswers([]);
      setResult(null);
      // The first segment carries the referee and the weather — they are the first two
      // draws inside `runMatch`, so advancing here is the only way to show the coach the
      // official who is actually taking charge.
      consume(session.stream.advance());
    },
    [consume],
  );

  const answer = useCallback<MatchDriver["answer"]>(
    (a) => {
      const stream = streamRef.current;
      if (stream == null) return;
      setAnswers((prior) => [...prior, a]);
      setPending(null);
      consume(stream.answer(a));
    },
    [consume],
  );

  const adopt = useCallback<MatchDriver["adopt"]>((replayed) => {
    streamRef.current = replayed.session.stream;
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

  return { match, events, answers, pending, result, start, answer, adopt };
}
