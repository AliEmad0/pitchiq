import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { DecisionAnswer } from "@/features/game/domain/match-decisions";
import { idbGet, idbGetAll, idbPut } from "./idb";

/**
 * One day's attempt, stored as the tuple that REPLAYS it.
 *
 * ⚠️ `seed` and `formationKey` are deliberately ABSENT — both are derived from `day` via
 * `domain/daily.ts`. Storing them would be a second source of truth that could disagree
 * with the day the record is filed under.
 *
 * If the shape roster or the epoch ever changed, the record would replay against a
 * different shape and its FINGERPRINT would stop matching, so it is discarded rather than
 * resumed into a match nobody played — the TASK-1807 B2 rule, inherited for free.
 */
export interface DailyRecord {
  /** The UTC day key. Also the store key; kept in the value so a read is self-describing. */
  day: string;
  cardIds: PlayerSeasonId[];
  answers: DecisionAnswer[];
  fingerprint: number;
  eventCount: number;
  done: boolean;
  score?: { home: number; away: number };
}

/**
 * ⚠️ Every operation swallows failure, matching `match-slot.ts`. Private browsing, a quota
 * error or a blocked upgrade must never interrupt a running match — a challenge that
 * cannot be saved is a far better outcome than a thrown error in the 90th minute.
 */
export async function saveDaily(record: DailyRecord): Promise<void> {
  try {
    await idbPut("daily", record.day, record);
  } catch {
    // Persistence is best-effort by design.
  }
}

export async function loadDaily(day: string): Promise<DailyRecord | null> {
  try {
    return await idbGet<DailyRecord>("daily", day);
  } catch {
    return null;
  }
}

export async function allDaily(): Promise<DailyRecord[]> {
  try {
    return await idbGetAll<DailyRecord>("daily");
  } catch {
    return [];
  }
}

const lockKey = (day: string): string => `daily_active_lock_${day}`;

/**
 * Mark a day as started, outside IndexedDB.
 *
 * ⛔ THIS IS A SPEED BUMP, NOT A LOCK, and the difference matters enough to write down.
 * `sessionStorage` is per-tab and dies with the tab, so a new tab defeats it outright —
 * and the same DevTools "clear site data" that wipes IndexedDB wipes this too. It raises
 * the cost of clearing storage to retry a bad result; it cannot prevent it.
 *
 * In a 100% client-side design no client-side measure can be authoritative, which is
 * exactly why there is no global leaderboard. Do not build one on top of this.
 */
export function markStarted(day: string): void {
  try {
    sessionStorage.setItem(lockKey(day), "1");
  } catch {
    // Blocked storage simply means no speed bump.
  }
}

/** Keyed by day, so a marker from an earlier day can never lock the current one. */
export function wasStarted(day: string): boolean {
  try {
    return sessionStorage.getItem(lockKey(day)) != null;
  } catch {
    return false;
  }
}
