import { isoWeekKey, ladderStanding } from "@/features/game/domain/weekly";
import { type RecordsSummary, recordsSummary } from "@/features/game/domain/records";
import { loadCareer } from "@/features/game/storage/career-slot";
import { allDaily } from "@/features/game/storage/daily-slot";
import { loadMarketBest } from "@/features/game/storage/market-slot";
import { allWeekly } from "@/features/game/storage/weekly-slot";
import { loadWhatIfBests } from "@/features/game/storage/what-if-slot";
import { backfillCareer } from "./career-backfill";
import { localDay } from "./trophy-record";
import { ladderComplete } from "./weekly-run";

/** The ladder's coach is always club 0 in his own league (`WeeklyLadder`). */
const LADDER_COACH = 0;

/**
 * TASK-1812 — everything the Records page reads, gathered after mount.
 *
 * ⚠️ Client only: every `/game/*` route is `force-static`, so storage may only be read once the
 * page is mounted. The backfill runs first, so a coach's first open already shows what his
 * saves still hold. Every source is best-effort: a failed read is an empty one.
 */
export async function loadRecords(now: Date = new Date()): Promise<RecordsSummary> {
  const today = localDay(now);
  const week = isoWeekKey(now);
  const safe = async <T>(f: () => Promise<T>, empty: T): Promise<T> => {
    try {
      return await f();
    } catch {
      return empty;
    }
  };
  await safe(() => backfillCareer(today), undefined);
  const [career, daily, weekly, marketBest, whatIf] = await Promise.all([
    safe(loadCareer, []),
    safe(allDaily, []),
    safe(allWeekly, []),
    safe(loadMarketBest, null),
    safe(loadWhatIfBests, {}),
  ]);
  return recordsSummary(
    {
      career,
      daily,
      weekly: weekly.map((r) => ({
        week: r.week,
        done: ladderComplete(r.run),
        ...ladderStanding(LADDER_COACH, r.run.results),
      })),
      marketBest: marketBest == null ? null : { wins: marketBest.wins, rounds: marketBest.rounds },
      whatIf: Object.values(whatIf),
    },
    today,
    week,
  );
}
