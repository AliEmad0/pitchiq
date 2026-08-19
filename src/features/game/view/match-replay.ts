import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import { FORMATIONS, type PoolCard } from "@/features/game/domain/chaos-draft";
import type { NextAnswer, TokenReader } from "@/features/game/domain/decision-tokens";
import { formationKey } from "@/features/game/domain/formation";
import { hashEvents } from "@/features/game/domain/hash";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import type { MatchEvent, MatchResult } from "@/features/game/domain/match-types";
import type { SavedMatch } from "@/features/game/storage/match-slot";
import {
  buildSession,
  type MatchSession,
  type RivalSetup,
  type SessionNames,
} from "./match-session";

export interface RestoredMatch {
  session: MatchSession;
  events: MatchEvent[];
  answers: DecisionAnswer[];
  /** The decision waiting to be answered, or null if the match reached full time. */
  pending: MatchDecision | null;
  result: MatchResult | null;
  /**
   * The record this was restored from, echoed back.
   *
   * A resumed match must keep saving under the same identity, and its `cardIds` and
   * `formationKey` cannot be recovered from the session — `GameTeam` holds cards, not the
   * formation key, and reconstructing either would be a second source of truth.
   */
  record: SavedMatch;
}

/**
 * Where a replay's answers come from.
 *
 * ⚠️ This is the ONLY thing that differs between resume-by-replay and replay-from-a-link.
 * `storage/match-slot.ts` states that the two are deliberately one code path, so each is
 * exercised by the other's tests; this interface is what makes that literally true rather
 * than aspirational.
 */
export interface AnswerSource {
  next(decision: MatchDecision): NextAnswer;
  /** Every answer consumed? Leftovers mean the match changed shape underneath. */
  done(): boolean;
}

/** Resume: a fixed list, applied in order. */
export function arraySource(answers: readonly DecisionAnswer[]): AnswerSource {
  let i = 0;
  return {
    next: () =>
      i < answers.length ? { ok: true, answer: answers[i++]! } : { ok: false, reason: "exhausted" },
    done: () => i >= answers.length,
  };
}

/** Share: a token stream, materialised against each decision as the engine raises it. */
export function tokenSource(reader: TokenReader): AnswerSource {
  return reader;
}

export interface ReplaySetup {
  cardIds: readonly PlayerSeasonId[];
  formationKey: string;
  seed: number;
}

export interface ReplayOptions {
  /**
   * ⚠️ The asymmetry the fingerprint exists for.
   *
   * `discard` (resume) — a stale save is not the coach's problem, so drop it and show a
   * clean hub. `keep` (share) — the sender's version is unreachable by construction, so
   * rendering our own replay and warning is the only honest option.
   */
  onDrift: "discard" | "keep";
  expectedFingerprint?: number;
  /** Resume only. A share code carries none — the hash already makes this check. */
  expectedEventCount?: number;
}

export interface ReplayedMatch {
  session: MatchSession;
  events: MatchEvent[];
  answers: DecisionAnswer[];
  pending: MatchDecision | null;
  result: MatchResult | null;
  /** Our replay differs from the fingerprint we were handed. `onDrift: "keep"` only. */
  drifted: boolean;
}

/**
 * Rebuild a match by re-running it.
 *
 * Returns null for every UNPLAYABLE input — an unresolvable card, a formation that no
 * longer exists, an answer that does not fit the decision it is meant to answer, more
 * answers than the engine raises decisions. Drift is different from unplayable, and is
 * governed by `options.onDrift`.
 *
 * ⚠️ The verification is a FINGERPRINT, not a version stamp. A version constant is cheaper
 * and says why a record was dropped, but it depends on somebody remembering to bump it —
 * and a forgotten bump fails in exactly the direction that hurts. This catches any cause
 * of drift, including ones nobody anticipated.
 */
export function replayWith(
  pool: PoolCard[],
  setup: ReplaySetup,
  source: AnswerSource,
  names: SessionNames,
  options: ReplayOptions,
  /** The replay must build the SAME opponent, from the same cards. See `buildSession`. */
  rival?: RivalSetup,
): ReplayedMatch | null {
  const byId = new Map(pool.map((c) => [c.cardId, c]));
  const players: PoolCard[] = [];
  for (const id of setup.cardIds) {
    const card = byId.get(id);
    if (card == null) return null;
    players.push(card);
  }

  const formation = FORMATIONS.find((f) => formationKey(f) === setup.formationKey);
  if (formation == null) return null;
  if (formation.slots.length !== players.length) return null;

  const session = buildSession(pool, players, formation, setup.seed, names, rival);
  const events: MatchEvent[] = [];
  const answers: DecisionAnswer[] = [];
  let pending: MatchDecision | null = null;
  let result: MatchResult | null = null;

  let step = session.stream.advance();
  events.push(...step.events);
  while (step.kind !== "done") {
    const next = source.next(step.decision);
    if (!next.ok) {
      // ⛔ A mismatch is not "stop here". It proves the answers belong to a different
      // match, and stopping would render a truncated replay as though it were whole.
      if (next.reason === "mismatch") return null;
      break;
    }
    answers.push(next.answer);
    step = session.stream.answer(next.answer);
    events.push(...step.events);
  }
  if (step.kind === "done") result = step.result;
  else pending = step.decision;

  // More answers than the engine now raises decisions: the match has changed shape.
  if (!source.done()) return null;

  if (options.expectedEventCount != null && events.length !== options.expectedEventCount) {
    if (options.onDrift === "discard") return null;
  }
  const drifted =
    options.expectedFingerprint != null && hashEvents(events) !== options.expectedFingerprint;
  if (drifted && options.onDrift === "discard") return null;

  return { session, events, answers, pending, result, drifted };
}

/**
 * Rebuild a saved match, and prove it is still the same match.
 *
 * ⚠️ Null is not an error condition to report: a stale save is not the coach's problem, so
 * the caller discards the slot and shows a clean hub.
 */
export function replayMatch(
  pool: PoolCard[],
  record: SavedMatch,
  names: SessionNames,
  rival?: RivalSetup,
): RestoredMatch | null {
  const replayed = replayWith(
    pool,
    { cardIds: record.cardIds, formationKey: record.formationKey, seed: record.seed },
    arraySource(record.answers),
    names,
    {
      onDrift: "discard",
      expectedFingerprint: record.fingerprint,
      expectedEventCount: record.eventCount,
    },
    rival,
  );
  if (replayed == null) return null;
  return {
    session: replayed.session,
    events: replayed.events,
    answers: record.answers,
    pending: replayed.pending,
    result: replayed.result,
    record,
  };
}
