import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import { isValueLine } from "@/features/game/domain/market-value";
import { LADDER_CLUBS } from "@/features/game/domain/weekly";
import type { SeasonRun } from "@/features/game/domain/season";
import { idbGet, idbGetAll, idbPut } from "./idb";

/**
 * TASK-1828 — one ISO week's ladder, keyed by the week.
 *
 * ⚠️ The formation, the deal, the rule and the rival clubs are all DERIVED from the week; the
 * record keeps `rivalIds` only as an identity check (a club list that changed under a deploy must
 * not re-point stored results at different clubs), and the coach's XI because he chose it.
 *
 * ⛔ Results are STORED, never re-derived — the season rule on engine drift (`SeasonRun`).
 */
export interface WeeklyRecord {
  week: string;
  cardIds: PlayerSeasonId[];
  rivalIds: number[];
  run: SeasonRun;
}

/** Writes are strict, like the season's: a matchday must either persist or show retry. */
export async function saveWeekly(record: WeeklyRecord): Promise<void> {
  if (typeof indexedDB === "undefined") throw new Error("Storage unavailable");
  await idbPut("weekly", record.week, record);
}

/** Storage is untrusted on read: a record that is not a ladder is treated as absent. */
function valid(r: unknown): r is WeeklyRecord {
  if (r == null || typeof r !== "object") return false;
  const w = r as WeeklyRecord;
  return (
    typeof w.week === "string" &&
    Array.isArray(w.cardIds) &&
    Array.isArray(w.rivalIds) &&
    w.run != null &&
    w.run.clubs === LADDER_CLUBS &&
    w.run.coach === 0 &&
    Array.isArray(w.run.results) &&
    (w.run.market == null || (Array.isArray(w.run.market) && w.run.market.every(isValueLine)))
  );
}

export async function loadWeekly(week: string): Promise<WeeklyRecord | null> {
  if (typeof indexedDB === "undefined") throw new Error("Storage unavailable");
  const r = await idbGet<unknown>("weekly", week);
  return valid(r) ? r : null;
}

export async function allWeekly(): Promise<WeeklyRecord[]> {
  try {
    return (await idbGetAll<unknown>("weekly")).filter(valid);
  } catch {
    return [];
  }
}
