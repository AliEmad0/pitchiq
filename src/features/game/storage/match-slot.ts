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
  /**
   * The SQUAD, ordered: the XI first (index = formation slot), then any drafted bench.
   *
   * ⚠️ Eleven for every mode that drafts an XI only. Budget Cap appends its five bench picks
   * (TASK-1810), and `buildSession` is the one place that splits them apart again.
   */
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
  /**
   * The club he chose to face, and how it drafted. Absent = his own pool (owner, 2026-08-19).
   *
   * ⛔ Part of the match's IDENTITY, exactly as the share code's copy is. Resume re-runs
   * `buildSession`, so a record without this rebuilds a DIFFERENT opponent — and because
   * resume verifies by fingerprint, the mismatch surfaces as "your saved match is corrupt"
   * rather than as the missing field it actually is.
   *
   * ⚠️ Optional so a record written before this shipped still loads. It replays against the
   * coach's own pool, which is what it was actually played against.
   */
  /** A club's numeric id, or a NATION's flag-icons code (TASK-1842). IndexedDB stores
   *  either untouched; every reader resolves it through the same rivals route. */
  rival?: { teamId: number | string; policy: "random" | "best" | "strong" };
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
