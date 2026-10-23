import type { CareerFacts } from "./achievements";
import { computeStats, type DailyOutcome, type DailyStats } from "./daily-stats";
import { type LadderOutcome, type LadderStats, ladderStats } from "./weekly";
import type { Verdict } from "./what-if";

/**
 * TASK-1812 — the Records page: a coach's career, read back.
 *
 * ⛔ TWO sources, never both for one thing. The daily challenge and the Weekly Ladder already
 * keep their WHOLE history in their own stores (`daily`, `weekly`), so the page reads them
 * there. Everything else — single matches, season / Classic / Survival fixtures, Market rounds,
 * What-If, finished runs — is the CAREER LOG that `recordFullTime` writes from 2026-10-23 on.
 * Before that those modes kept only their latest run, so older history is not recoverable, and
 * the page says so rather than inventing it.
 *
 * ⚠️ PURE: no clock, no I/O. `at` is stamped by the view layer when an entry is written, and is
 * what orders the log — store keys are not chronological.
 */

export type CareerMode =
  | "draft"
  | "chaos"
  | "legacy"
  | "captains"
  | "budget"
  | "nationality"
  | "chemistry"
  | "season"
  | "classic"
  | "market"
  | "whatIf"
  | "single";

export interface CareerMatch {
  kind: "match";
  key: string;
  at: number;
  day: string;
  mode: CareerMode;
  gf: number;
  ga: number;
  context: string;
}

export interface CareerRun {
  kind: "run";
  key: string;
  at: number;
  day: string;
  mode: CareerMode;
  /** Final league position and size, when the run was a league ("2/20"). */
  position?: number;
  clubs?: number;
  won: boolean;
  unbeaten: boolean;
  survived?: boolean;
  context: string;
}

export type CareerEntry = CareerMatch | CareerRun;

const ROUTE_MODES: Record<string, CareerMode> = {
  draft: "draft",
  chaos: "chaos",
  legacy: "legacy",
  captains: "captains",
  budget: "budget",
  nationality: "nationality",
  nation: "nationality",
  chemistry: "chemistry",
};

/**
 * A key's mode. The key families are `recordFullTime`'s: `m:<path>:<seed>`, `s:` season week,
 * `c:` Classic / Survival fixture, `k:` Market round, `w:` What-If, `r:` a finished run.
 * Null for a family the log does not keep (`d:` daily, `l:` ladder, `b:` backfill).
 */
export function modeOfKey(key: string): CareerMode | null {
  const head = key.slice(0, 2);
  if (head === "s:" || head === "r:") return "season";
  if (head === "c:") return "classic";
  if (head === "k:") return "market";
  if (head === "w:") return "whatIf";
  if (head === "m:") {
    const seg = /\/game\/([a-z]+)/.exec(key)?.[1];
    return (seg != null ? ROUTE_MODES[seg] : undefined) ?? "single";
  }
  return null;
}

/** "Coach · 2/20" or "2/20" — `runContext`'s one wording, read back. */
const RUN_PLACE = /(\d+)\/(\d+)$/;

/** The career-log entry for what one full-time screen recorded, or null when the log skips it. */
export function careerEntry(
  e: { key: string; day: string; context: string; facts: CareerFacts },
  at: number,
): CareerEntry | null {
  const mode = modeOfKey(e.key);
  if (mode == null) return null;
  if (e.facts.season != null) {
    const place = RUN_PLACE.exec(e.context);
    return {
      kind: "run",
      key: e.key,
      at,
      day: e.day,
      mode,
      ...(place != null ? { position: Number(place[1]), clubs: Number(place[2]) } : {}),
      won: e.facts.season.won,
      unbeaten: e.facts.season.unbeaten,
      ...(e.facts.season.survived != null ? { survived: e.facts.season.survived } : {}),
      context: e.context,
    };
  }
  const m = e.facts.match;
  if (m == null) return null;
  return {
    kind: "match",
    key: e.key,
    at,
    day: e.day,
    mode,
    gf: m.for,
    ga: m.against,
    context: e.context,
  };
}

export interface Totals {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
}

export interface RecordsSummary {
  /** Nothing to show yet — the page renders its empty state. */
  empty: boolean;
  totals: Totals;
  biggestWin: CareerMatch | null;
  longestUnbeaten: number;
  /** The last ten logged matches, oldest first. */
  form: { key: string; result: "W" | "D" | "L"; context: string }[];
  byMode: { mode: CareerMode; played: number; won: number; drawn: number; lost: number }[];
  runs: CareerRun[];
  bestRun: CareerRun | null;
  daily: DailyStats;
  ladder: LadderStats;
  marketBest: { wins: number; rounds: number } | null;
  whatIfRewritten: number;
  /** What-If rescues tried — the "of N" beside the rewrites. */
  whatIfPlayed: number;
  /** Every logged match, NEWEST first — the page's fixture list. */
  recent: CareerMatch[];
  /** The earliest day anything was played (log or daily), for "since …". */
  since: string | null;
}

const resultOf = (gf: number, ga: number): "W" | "D" | "L" =>
  gf > ga ? "W" : gf === ga ? "D" : "L";

/**
 * Everything the Records page shows, derived on every read — the `daily-stats` rule: a counter
 * stored beside the history is a second source of truth that can drift from it.
 *
 * ⚠️ The daily counts in the career TOTALS (it is a match he played; the coach is always home
 * there) but not in the streaks or the form strip, which follow the log's order alone. The
 * ladder has its own section and is not folded into the totals: an unplayed matchday is stored
 * as a 0–3 no-show that looks exactly like a defeat.
 */
export function recordsSummary(
  input: {
    career: readonly CareerEntry[];
    daily: readonly DailyOutcome[];
    weekly: readonly LadderOutcome[];
    marketBest: { wins: number; rounds: number } | null;
    whatIf: readonly { verdict: Verdict }[];
  },
  todayKey: string,
  nowWeek: string,
): RecordsSummary {
  const log = [...input.career].sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
  const matches = log.filter((e): e is CareerMatch => e.kind === "match");
  const runs = log.filter((e): e is CareerRun => e.kind === "run");

  const totals: Totals = { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 };
  const add = (gf: number, ga: number) => {
    totals.played++;
    totals.gf += gf;
    totals.ga += ga;
    const r = resultOf(gf, ga);
    if (r === "W") totals.won++;
    else if (r === "D") totals.drawn++;
    else totals.lost++;
  };
  for (const m of matches) add(m.gf, m.ga);
  for (const d of input.daily) if (d.done && d.score != null) add(d.score.home, d.score.away);

  let biggestWin: CareerMatch | null = null;
  let longestUnbeaten = 0;
  let streak = 0;
  for (const m of matches) {
    if (m.gf > m.ga && (biggestWin == null || m.gf - m.ga > biggestWin.gf - biggestWin.ga)) {
      biggestWin = m;
    }
    streak = m.gf >= m.ga ? streak + 1 : 0;
    longestUnbeaten = Math.max(longestUnbeaten, streak);
  }

  const modes = new Map<CareerMode, { played: number; won: number; drawn: number; lost: number }>();
  for (const m of matches) {
    const row = modes.get(m.mode) ?? { played: 0, won: 0, drawn: 0, lost: 0 };
    row.played++;
    const r = resultOf(m.gf, m.ga);
    if (r === "W") row.won++;
    else if (r === "D") row.drawn++;
    else row.lost++;
    modes.set(m.mode, row);
  }

  // Best finish: champions first, then the highest place as a share of the league.
  const place = (r: CareerRun) => (r.position != null && r.clubs ? r.position / r.clubs : 1);
  const bestRun = runs.reduce<CareerRun | null>(
    (best, r) =>
      best == null ||
      Number(r.won) > Number(best.won) ||
      (r.won === best.won && place(r) < place(best))
        ? r
        : best,
    null,
  );

  const ladder = ladderStats(input.weekly, nowWeek);
  return {
    empty:
      totals.played === 0 && runs.length === 0 && ladder.weeks === 0 && input.marketBest == null,
    totals,
    biggestWin,
    longestUnbeaten,
    form: matches
      .slice(-10)
      .map((m) => ({ key: m.key, result: resultOf(m.gf, m.ga), context: m.context })),
    byMode: [...modes].map(([mode, row]) => ({ mode, ...row })),
    runs,
    bestRun,
    daily: computeStats(input.daily, todayKey),
    ladder,
    marketBest: input.marketBest,
    whatIfRewritten: input.whatIf.filter((w) => w.verdict === "rewrote").length,
    whatIfPlayed: input.whatIf.length,
    recent: [...matches].reverse(),
    since:
      [
        ...log.map((e) => e.day),
        ...input.daily.filter((d) => d.done).map((d) => d.day),
      ].sort()[0] ?? null,
  };
}
