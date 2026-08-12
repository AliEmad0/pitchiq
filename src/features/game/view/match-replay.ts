import { FORMATIONS, type PoolCard } from "@/features/game/domain/chaos-draft";
import { formationKey } from "@/features/game/domain/formation";
import { hashEvents } from "@/features/game/domain/hash";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import type { MatchEvent, MatchResult } from "@/features/game/domain/match-types";
import type { SavedMatch } from "@/features/game/storage/match-slot";
import { buildSession, type MatchSession, type SessionNames } from "./match-session";

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
 * Rebuild a saved match by re-running it, and prove it is still the same match.
 *
 * Returns null for every failure — an unresolvable card, a formation that no longer
 * exists, a diverged replay. ⚠️ Null is not an error condition to report: a stale save
 * is not the coach's problem, so the caller discards the slot and shows a clean hub.
 *
 * ⚠️ The verification is a FINGERPRINT, not a version stamp. A version constant is
 * cheaper and says why a record was dropped, but it depends on somebody remembering to
 * bump it — and a forgotten bump fails in exactly the direction that hurts, offering a
 * Resume that replays into a different match. This catches any cause of drift, including
 * ones nobody anticipated.
 */
export function replayMatch(
  pool: PoolCard[],
  record: SavedMatch,
  names: SessionNames,
): RestoredMatch | null {
  const byId = new Map(pool.map((c) => [c.cardId, c]));
  const players: PoolCard[] = [];
  for (const id of record.cardIds) {
    const card = byId.get(id);
    if (card == null) return null;
    players.push(card);
  }

  const formation = FORMATIONS.find((f) => formationKey(f) === record.formationKey);
  if (formation == null) return null;
  if (formation.slots.length !== players.length) return null;

  const session = buildSession(pool, players, formation, record.seed, names);
  const events: MatchEvent[] = [];
  let pending: MatchDecision | null = null;
  let result: MatchResult | null = null;

  let step = session.stream.advance();
  events.push(...step.events);
  for (const answer of record.answers) {
    // More stored answers than the engine now raises decisions: the match has changed
    // shape underneath the record.
    if (step.kind === "done") return null;
    step = session.stream.answer(answer);
    events.push(...step.events);
  }
  if (step.kind === "done") result = step.result;
  else pending = step.decision;

  if (events.length !== record.eventCount) return null;
  if (hashEvents(events) !== record.fingerprint) return null;

  return { session, events, answers: record.answers, pending, result, record };
}
