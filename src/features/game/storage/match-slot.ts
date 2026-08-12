import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { DecisionAnswer } from "@/features/game/domain/match-decisions";
import { idbDel, idbGet, idbPut } from "./idb";

/**
 * An in-progress match, stored as the tuple that REPLAYS it.
 *
 * Not a snapshot: the live state is a running generator, and a generator cannot be
 * serialized. A match is a pure function of `(setup, seed, decisions[])` and re-runs in
 * under 100ms, so replay costs nothing — and it is already the seed-share code path
 * (TASK-1812), which means resume is exercised by every sharing test rather than being
 * its own untested branch.
 */
export interface SavedMatch {
  /** 11 cards, ordered — the index IS the formation slot. */
  cardIds: PlayerSeasonId[];
  /**
   * ⚠️ The KEY, never an index into `FORMATIONS`. An index is positional, so reordering
   * that array would silently resurrect stored matches into the wrong shape.
   */
  formationKey: string;
  seed: number;
  /**
   * The coach's answers only. `createStream` answers the opponent's with `defaultAnswer`,
   * which is deterministic, so replaying these reproduces the opponent's too. Storing
   * both would duplicate derivable state and let the two disagree.
   */
  answers: DecisionAnswer[];
  /** `hashEvents` over the events seen. The gate against a drifted pool or engine. */
  fingerprint: number;
  eventCount: number;
}

const KEY = "current";

/**
 * ⚠️ Every operation swallows failure. Private browsing, a quota error or a blocked
 * upgrade must never interrupt a running match — a match that fails to save is simply a
 * match that cannot be resumed, which is a far better outcome than a thrown error
 * mid-90th-minute.
 */
export async function saveMatch(match: SavedMatch): Promise<void> {
  try {
    await idbPut("match", KEY, match);
  } catch {
    // Persistence is best-effort by design.
  }
}

export async function loadMatch(): Promise<SavedMatch | null> {
  try {
    return await idbGet<SavedMatch>("match", KEY);
  } catch {
    return null;
  }
}

export async function clearMatch(): Promise<void> {
  try {
    await idbDel("match", KEY);
  } catch {
    // See saveMatch.
  }
}
