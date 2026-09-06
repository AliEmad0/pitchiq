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
  /** Exact table-index order. Absent only on saves made before PR 3. */
  leagueIds?: number[];
  cardIds: PlayerSeasonId[];
  rosterIds?: string[];
  lineupIds?: string[];
  formationKey: string;
}

/** One run at a time, exactly as `match-slot.ts` keeps one match. */
const KEY = "current";

/** Writes are strict: results and availability must either both persist or show retry. */
export async function saveRun(run: SavedRun): Promise<void> {
  if (typeof indexedDB === "undefined") throw new Error("Storage unavailable");
  await idbPut("season", KEY, run);
}

export async function loadRun(): Promise<SavedRun | null> {
  if (typeof indexedDB === "undefined") throw new Error("Storage unavailable");
  return await idbGet<SavedRun>("season", KEY);
}

export async function clearRun(): Promise<void> {
  try {
    await idbDel("season", KEY);
  } catch {
    // Nothing to clear is indistinguishable from cleared.
  }
}
