import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { SeasonRun } from "@/features/game/domain/season";
import { idbDel, idbGet, idbPut } from "./idb";

/**
 * A season in progress, as stored (TASK-1811).
 *
 * ⛔ Carries the SQUAD as well as the run, because a season is "draft once and live with it"
 * (owner, 2026-09-01) — the XI is part of the run's identity, not something re-drafted on
 * resume. These are the same two identity fields `SavedMatch` keeps, for the same reasons:
 *
 * ⚠️ `formationKey` is the KEY, never an index into `FORMATIONS`. An index is positional, so
 * reordering that array would silently resurrect a stored run into the wrong shape.
 *
 * ⚠️ The run's results carry no events — see `SeasonRun` for why storing beats re-deriving,
 * and why the reason is engine drift rather than speed.
 */
export interface SavedRun extends SeasonRun {
  cardIds: PlayerSeasonId[];
  formationKey: string;
}

/** One run at a time, exactly as `match-slot.ts` keeps one match. */
const KEY = "current";

/**
 * ⚠️ Every operation swallows failure, the same rule `match-slot.ts` follows. Private
 * browsing, a quota error or a blocked upgrade must never interrupt a season — a run that
 * fails to save is a run that cannot be resumed, which beats a thrown error mid-matchweek.
 */
export async function saveRun(run: SavedRun): Promise<void> {
  try {
    await idbPut("season", KEY, run);
  } catch {
    // Persistence is best-effort by design.
  }
}

export async function loadRun(): Promise<SavedRun | null> {
  try {
    return await idbGet<SavedRun>("season", KEY);
  } catch {
    return null;
  }
}

export async function clearRun(): Promise<void> {
  try {
    await idbDel("season", KEY);
  } catch {
    // Nothing to clear is indistinguishable from cleared.
  }
}
