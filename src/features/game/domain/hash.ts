import type { MatchEvent } from "./match-types";

/**
 * FNV-1a → non-negative 32-bit int.
 *
 * Deterministic by construction: no PRNG, no clock, no entropy of any kind. That is why
 * it is safe in `domain/`, where TASK-1803 forbids anything a replay cannot reproduce.
 */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The identity of one event, for hashing. Mirrors the key the stream tests compare on. */
const keyOf = (e: MatchEvent): string =>
  `${e.minute}:${e.kind}:${e.side ?? ""}:${e.playerId ?? ""}`;

/**
 * A fingerprint of the match so far.
 *
 * ⚠️ ORDER-SENSITIVE on purpose. A stored match is replayed against a CURRENT engine and
 * a CURRENT card pool, both of which drift with routine work — a data refresh, a rating
 * change, an engine tweak. Any of those can produce a different match from the same
 * tuple, silently. This is the gate that catches it, so it must be sensitive to
 * everything that makes a match that match.
 */
export function hashEvents(events: MatchEvent[]): number {
  return hashStr(events.map(keyOf).join("|"));
}
