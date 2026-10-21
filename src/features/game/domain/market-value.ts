import type { MatchResult, Side } from "./match-types";
import type { GamePlayer } from "./player";

/**
 * TASK-1826 — an in-run market value for every card in the coach's squad.
 *
 * ⛔ SYNTHESISED, NEVER SOURCED, and labelled as an in-game valuation wherever it is shown. The
 * base comes from the card's rating and the movement from what the man does IN THIS RUN — no
 * real fee is read, so the number can never be mistaken for one.
 *
 * ⛔ Only the RAW OUTPUT is stored (`ValueLine`, one per coach fixture); every value is derived
 * by folding those lines. That keeps a save immune to retuning: change a weight below and every
 * run re-values itself, rather than carrying numbers computed under the old rule.
 *
 * ⚠️ Values are integer TENTHS of a million, like `price-band.ts`, so a squad total summed over
 * sixteen cards can never drift by a float.
 */

/** What one coach fixture contributed, captured once from its real events. */
export interface ValueLine {
  week: number;
  /** Every card that played: the XI plus anyone brought on. */
  on: string[];
  /** One entry per goal the coach's side scored (own goals are nobody's). */
  goals: string[];
  assists: string[];
  conceded: number;
  result: "w" | "d" | "l";
}

/** Base value in tenths of £m: `2.0 × 1.075^(OVR − 60)`, clamped to £0.5m–£40m. */
export function baseValue(ovr: number): number {
  const m = 2.0 * Math.pow(1.075, ovr - 60);
  return Math.round(Math.min(40, Math.max(0.5, m)) * 10);
}

/** How each kind of output moves a value — multiplicative, so a star moves more in £. */
export const VALUE_MOVES = {
  appeared: 0.005,
  win: 0.015,
  loss: -0.01,
  goal: 0.06,
  assist: 0.04,
  cleanSheet: 0.04,
  /** Each fixture out of the side: a squad player who never plays is worth less. */
  rust: -0.015,
} as const;

/** A value can neither collapse nor explode over a season. */
const FACTOR_MIN = 0.5;
const FACTOR_MAX = 3;

/** Who keeps a clean sheet: the keeper and the back line, by primary role. */
const DEFENSIVE = new Set(["GK", "CB", "LB", "RB", "LWB", "RWB"]);

type Valued = Pick<GamePlayer, "cardId" | "role" | "ratings">;

/**
 * Every card's value after each line: `series[cardId][0]` is the base, `[n]` the value after the
 * n-th line. Lines are folded in the order given (the run's own order).
 */
export function valueSeries(
  cards: readonly Valued[],
  lines: readonly ValueLine[],
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const card of cards) {
    const base = baseValue(card.ratings?.overall ?? 50);
    let factor = 1;
    const series = [base];
    for (const line of lines) {
      if (line.on.includes(card.cardId)) {
        factor *= 1 + VALUE_MOVES.appeared;
        if (line.result === "w") factor *= 1 + VALUE_MOVES.win;
        if (line.result === "l") factor *= 1 + VALUE_MOVES.loss;
        for (const g of line.goals) if (g === card.cardId) factor *= 1 + VALUE_MOVES.goal;
        for (const a of line.assists) if (a === card.cardId) factor *= 1 + VALUE_MOVES.assist;
        if (line.conceded === 0 && DEFENSIVE.has(card.role ?? "")) {
          factor *= 1 + VALUE_MOVES.cleanSheet;
        }
      } else {
        factor *= 1 + VALUE_MOVES.rust;
      }
      factor = Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, factor));
      series.push(Math.max(5, Math.round(base * factor)));
    }
    out.set(card.cardId, series);
  }
  return out;
}

/**
 * The line one finished coach fixture contributes, from its REAL events.
 *
 * ⚠️ Events name players by `playerId`; the line keys on `cardId`, the run's identity. A goal
 * VAR chalked off (`disallowedAt`) counts for nothing, and an own goal has no scorer.
 */
export function valueLine(
  week: number,
  result: MatchResult,
  coachSide: Side,
  squad: readonly Pick<GamePlayer, "cardId" | "playerId">[],
  starters: readonly Pick<GamePlayer, "cardId">[],
): ValueLine {
  const byPlayer = new Map(squad.map((p) => [p.playerId, p.cardId]));
  const on = new Set(starters.map((p) => p.cardId));
  const goals: string[] = [];
  const assists: string[] = [];
  for (const e of result.events) {
    if (e.side !== coachSide) continue;
    if (e.kind === "substitution" && e.subOnPlayerId != null) {
      const id = byPlayer.get(e.subOnPlayerId);
      if (id != null) on.add(id);
    }
    if (e.kind === "goal" && e.disallowedAt == null && e.ownGoalBy == null) {
      const scorer = e.playerId == null ? undefined : byPlayer.get(e.playerId);
      if (scorer != null) goals.push(scorer);
      const assist = e.assistPlayerId == null ? undefined : byPlayer.get(e.assistPlayerId);
      if (assist != null) assists.push(assist);
    }
  }
  const mine = result.score[coachSide];
  const theirs = result.score[coachSide === "home" ? "away" : "home"];
  return {
    week,
    on: [...on],
    goals,
    assists,
    conceded: theirs,
    result: mine > theirs ? "w" : mine === theirs ? "d" : "l",
  };
}

/** A line for a fixture he did not play (a no-show or a forfeit): nobody appeared. */
export function absentLine(week: number, scored: number, conceded: number): ValueLine {
  return {
    week,
    on: [],
    goals: [],
    assists: [],
    conceded,
    result: scored > conceded ? "w" : scored === conceded ? "d" : "l",
  };
}

/** Light shape check for a stored line — storage is untrusted on read. */
export function isValueLine(v: unknown): v is ValueLine {
  if (v == null || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  const strs = (x: unknown) => Array.isArray(x) && x.every((s) => typeof s === "string");
  return (
    Number.isInteger(l.week) &&
    strs(l.on) &&
    strs(l.goals) &&
    strs(l.assists) &&
    Number.isInteger(l.conceded) &&
    (l.result === "w" || l.result === "d" || l.result === "l")
  );
}

/** Format tenths of £m for display: 124 → "12.4". The label says "in-game valuation". */
export function formatValue(tenths: number): string {
  return (tenths / 10).toFixed(1);
}
