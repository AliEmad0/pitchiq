import { dayKeyOffset } from "./daily";

/**
 * The part of a stored record that stats care about.
 *
 * Deliberately narrower than `DailyRecord`: this module has no business knowing about
 * replay tuples, and a narrow input keeps it testable without building a match.
 */
export interface DailyOutcome {
  day: string;
  done: boolean;
  score?: { home: number; away: number };
}

export interface DailyStats {
  played: number;
  won: number;
  currentStreak: number;
  bestStreak: number;
  bestMargin: number;
}

const isWin = (o: DailyOutcome | undefined): boolean =>
  o != null && o.done && o.score != null && o.score.home > o.score.away;

/**
 * Streaks and bests, DERIVED on every read.
 *
 * ⚠️ Nothing here is stored. A counter kept alongside the history is a second source of
 * truth that drifts the first time a write half-fails, and it is also the one field worth
 * editing in DevTools. Deriving costs nothing at this size and cannot disagree with the
 * record list it came from.
 *
 * A streak is consecutive CALENDAR DAYS WON. A loss breaks it, a draw breaks it, and an
 * unplayed day breaks it — one rule, no exceptions to remember. That is why the walk steps
 * through `dayKeyOffset` rather than through the record list, which would silently treat a
 * gap as contiguous.
 */
export function computeStats(records: readonly DailyOutcome[], todayKey: string): DailyStats {
  const byDay = new Map(records.map((r) => [r.day, r]));

  let played = 0;
  let won = 0;
  let bestMargin = 0;
  for (const r of records) {
    if (!r.done || r.score == null) continue;
    played++;
    if (r.score.home > r.score.away) {
      won++;
      bestMargin = Math.max(bestMargin, r.score.home - r.score.away);
    }
  }

  /** Walk back from `from` while each day is a win. */
  const runEndingAt = (from: string): number => {
    let n = 0;
    let cursor = from;
    while (isWin(byDay.get(cursor))) {
      n++;
      cursor = dayKeyOffset(cursor, -1);
    }
    return n;
  };

  // ⚠️ The fallback to yesterday keys off "today is UNFINISHED", never off "today is not a
  // win". An untouched morning should still show the streak the coach went to bed on
  // rather than a demoralising zero — but a day that was PLAYED AND LOST must read as
  // zero, and keying off `isWin` here resurrects the dead streak instead.
  const today = byDay.get(todayKey);
  const finishedToday = today != null && today.done && today.score != null;
  const currentStreak = finishedToday
    ? runEndingAt(todayKey)
    : runEndingAt(dayKeyOffset(todayKey, -1));

  let bestStreak = currentStreak;
  for (const r of records) {
    if (isWin(r)) bestStreak = Math.max(bestStreak, runEndingAt(r.day));
  }

  return { played, won, currentStreak, bestStreak, bestMargin };
}
