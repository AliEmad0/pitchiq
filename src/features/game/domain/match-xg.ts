import type { ChanceOutcome, GoalStyle, MatchEvent, PenaltyOutcome, Side } from "./match-types";

/**
 * TASK-1815 — an ESTIMATED xG per shot, read off what each event already records.
 *
 * The engine does not compute shot quality, and teaching it to would change its output
 * and drift every save and share code. This table maps the recorded shape of a shot onto
 * a plausible probability instead. Values are integer HUNDREDTHS so totals never drift
 * through float addition (the Budget Cap integer-tenths lesson).
 *
 * ⛔ FROZEN — pinned by a golden test. Every report is derived on the fly, so editing a
 * value silently rewrites the report of every match ever played or shared (the
 * `DAILY_SHAPES` rule).
 *
 * ⚠️ The engine emits a set piece as its OWN event (`penalty` / `freekick`) AND a separate
 * `goal` carrying `source`. The shot is counted on the set-piece event; its goal adds
 * nothing. An own goal is not a shot at all.
 */
export const XG_PENALTY = 76;
export const XG_FREEKICK = 6;
export const XG_OPEN_DEFAULT = 30;
export const XG_GOAL_STYLE: Readonly<Record<GoalStyle, number>> = {
  "tap-in": 55,
  counter: 30,
  header: 18,
  chip: 15,
  volley: 12,
  trivela: 5,
  "long-range": 4,
};
export const XG_CHANCE: Readonly<Record<ChanceOutcome, number>> = {
  post: 20,
  crossbar: 20,
  saved: 12,
  wide: 6,
  blocked: 5,
};

export type DangerBand = "low" | "medium" | "high";

export interface ShotXg {
  minute: number;
  side: Side;
  /** Integer hundredths. */
  xg: number;
  band: DangerBand;
  goal: boolean;
  /** A given goal later chalked off — it keeps its xG; the chance was real. */
  disallowed: boolean;
}

const penaltyScores = (o: PenaltyOutcome | undefined): boolean =>
  o != null && (o.startsWith("scored") || o === "saved-rebound-goal");

export function shotXgOf(e: MatchEvent): number | null {
  if (e.kind === "penalty") return XG_PENALTY;
  if (e.kind === "freekick") return XG_FREEKICK;
  if (e.kind === "chance") return e.outcome != null ? XG_CHANCE[e.outcome] : null;
  if (e.kind === "goal" && e.source === "open")
    return e.goalStyle != null ? XG_GOAL_STYLE[e.goalStyle] : XG_OPEN_DEFAULT;
  return null;
}

export function bandOf(h: number): DangerBand {
  return h < 10 ? "low" : h < 30 ? "medium" : "high";
}

/** The goal a penalty / free kick produced, to read its VAR verdict. */
function setPieceGoal(events: readonly MatchEvent[], e: MatchEvent): MatchEvent | undefined {
  return events.find(
    (g) => g.kind === "goal" && g.source === e.kind && g.minute === e.minute && g.side === e.side,
  );
}

export function shotsOf(events: readonly MatchEvent[]): ShotXg[] {
  const out: ShotXg[] = [];
  for (const e of events) {
    const xg = shotXgOf(e);
    if (xg == null || e.side == null) continue;
    let goal = false;
    let disallowed = false;
    if (e.kind === "goal") {
      goal = true;
      disallowed = e.disallowedAt != null;
    } else if (e.kind === "penalty" || e.kind === "freekick") {
      goal =
        e.kind === "penalty" ? penaltyScores(e.penaltyOutcome) : e.freeKickOutcome === "scored";
      disallowed = goal && setPieceGoal(events, e)?.disallowedAt != null;
    }
    out.push({ minute: e.minute, side: e.side, xg, band: bandOf(xg), goal, disallowed });
  }
  return out;
}

export function xgTotals(shots: readonly ShotXg[]): { home: number; away: number } {
  const t = { home: 0, away: 0 };
  for (const s of shots) t[s.side] += s.xg;
  return t;
}

/** The cumulative total per side after each shot, from 0' to the final whistle. */
export function xgSeries(
  shots: readonly ShotXg[],
  endMinute: number,
): { minute: number; home: number; away: number }[] {
  const pts = [{ minute: 0, home: 0, away: 0 }];
  const run = { home: 0, away: 0 };
  for (const s of shots) {
    run[s.side] += s.xg;
    pts.push({ minute: s.minute, home: run.home, away: run.away });
  }
  const last = pts[pts.length - 1]!;
  pts.push({ minute: Math.max(endMinute, last.minute), home: run.home, away: run.away });
  return pts;
}

/** Hundredths → one decimal, e.g. 245 → "2.5". Integer rounding, never float `toFixed`. */
export const formatXg = (h: number): string => {
  const tenths = Math.round(h / 10);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
};
