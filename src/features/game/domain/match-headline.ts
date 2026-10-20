import { hashStr } from "./hash";
import type { MatchEvent, MatchResult, Side } from "./match-types";
import { shotsOf, xgTotals } from "./match-xg";
import type { GameTeam } from "./team";

/**
 * TASK-1815 — the match's dramatic arc, as a message REFERENCE (the TASK-1804 commentary
 * convention): domain picks the key, the view translates it.
 *
 * ⚠️ Written from the COACH's side. A season fixture can put him away, and "0–3" there
 * is a win. Scores count GIVEN goals only (`disallowedAt == null`) — the `view/score.ts`
 * rule.
 *
 * Arcs are tested in priority order; the first that matches wins. The variant is hashed
 * from the match seed, so a replay of the same match prints the same headline.
 */
export type HeadlineArc =
  | "comeback"
  | "lateWinner"
  | "lateLoser"
  | "robbed"
  | "smashAndGrab"
  | "routWin"
  | "routLoss"
  | "hatTrick"
  | "tenMen"
  | "varDrama"
  | "boreDraw"
  | "thriller"
  | "win"
  | "draw"
  | "loss";

/** Every arc has this many wordings: `gameReport.headline.<arc>.0 … POOL-1`. */
export const HEADLINE_POOL = 3;
const LATE_MINUTE = 85;
/** Hundredths — a full goal of expected goals. */
const XG_GAP = 100;
const ROUT_MARGIN = 4;
const THRILLER_GOALS = 5;
/**
 * For an arc whose wordings sometimes name a hero, the variants that do NOT — the only
 * ones usable when the decisive goal has no scorer. Must match the catalogs; pinned by
 * game-match-headline.test against both en and ar.
 */
const NAMELESS: Partial<Record<HeadlineArc, readonly number[]>> = {
  lateWinner: [1, 2],
  lateLoser: [0, 2],
};

export interface HeadlineValues {
  coach: string;
  opponent: string;
  coachGoals: number;
  oppGoals: number;
  /** The hero of the arc, or "" when the arc names nobody. */
  player: string;
  /** The decisive minute, or 0 when the arc names none. */
  minute: number;
}
export interface HeadlineRef {
  arc: HeadlineArc;
  key: string;
  values: HeadlineValues;
}
export interface ScorerLine {
  side: Side;
  name: string;
  goals: number;
  ownGoal: boolean;
}

const other = (s: Side): Side => (s === "home" ? "away" : "home");
/**
 * The goals that STOOD, in match order — VAR-disallowed ones removed. Shared with the Hall of
 * Fame (`achievements.ts`, TASK-1813) so the two can never count a match differently.
 */
export const givenGoals = (events: readonly MatchEvent[]): MatchEvent[] =>
  events.filter((e) => e.kind === "goal" && e.disallowedAt == null && e.side != null);
const given = givenGoals;

/** Starters AND bench — a substitute can score (the `commentary.ts#nameOf` rule). */
function nameIn(team: GameTeam, id: number | undefined): string {
  if (id == null) return "";
  return [...team.players, ...(team.bench ?? [])].find((p) => p.playerId === id)?.name ?? "";
}

/** Given goals grouped per scorer, in the order they first scored. */
export function scorersOf(result: MatchResult, home: GameTeam, away: GameTeam): ScorerLine[] {
  const teams = { home, away };
  const lines: ScorerLine[] = [];
  for (const e of given(result.events)) {
    const side = e.side!;
    const ownGoal = e.source === "own-goal";
    // An own goal's scorer belongs to the side that CONCEDED.
    const name = ownGoal
      ? nameIn(teams[other(side)], e.ownGoalBy)
      : nameIn(teams[side], e.playerId);
    if (name === "") continue;
    const hit = lines.find((l) => l.side === side && l.name === name && l.ownGoal === ownGoal);
    if (hit) hit.goals += 1;
    else lines.push({ side, name, goals: 1, ownGoal });
  }
  return lines;
}

export function headlineFor(
  result: MatchResult,
  home: GameTeam,
  away: GameTeam,
  coachSide: Side,
): HeadlineRef {
  const teams = { home, away };
  const opp = other(coachSide);
  const goals = given(result.events);
  const cg = goals.filter((e) => e.side === coachSide).length;
  const og = goals.length - cg;
  const margin = cg - og;
  const values: HeadlineValues = {
    coach: teams[coachSide].name,
    opponent: teams[opp].name,
    coachGoals: cg,
    oppGoals: og,
    player: "",
    minute: 0,
  };

  // The coach's worst deficit at any point in the match.
  let worst = 0;
  let run = 0;
  for (const e of goals) {
    run += e.side === coachSide ? 1 : -1;
    worst = Math.min(worst, run);
  }

  const xg = xgTotals(shotsOf(result.events));
  const xgDiff = xg[coachSide] - xg[opp];

  /** The winner's goal that put them ahead for good: their (loser's tally + 1)th. */
  const decisive = (): MatchEvent | undefined => {
    if (margin === 0) return undefined;
    const winner = margin > 0 ? coachSide : opp;
    return goals.filter((e) => e.side === winner)[Math.min(cg, og)];
  };

  const hatTrickHero = (): MatchEvent | undefined => {
    const tally = new Map<string, number>();
    for (const e of goals) {
      if (e.source === "own-goal" || e.playerId == null) continue;
      const k = `${e.side}:${e.playerId}`;
      const n = (tally.get(k) ?? 0) + 1;
      tally.set(k, n);
      if (n === 3) return e;
    }
    return undefined;
  };

  const pick = (): HeadlineArc => {
    if (worst <= -2 && margin >= 0) return "comeback";
    const d = decisive();
    if (d != null && d.minute >= LATE_MINUTE) {
      values.player = nameIn(teams[d.side!], d.playerId);
      values.minute = d.minute;
      return margin > 0 ? "lateWinner" : "lateLoser";
    }
    if (margin < 0 && xgDiff >= XG_GAP) return "robbed";
    if (margin > 0 && -xgDiff >= XG_GAP) return "smashAndGrab";
    if (Math.abs(margin) >= ROUT_MARGIN) return margin > 0 ? "routWin" : "routLoss";
    const hero = hatTrickHero();
    if (hero != null) {
      values.player = nameIn(teams[hero.side!], hero.playerId);
      return "hatTrick";
    }
    const coachRed = result.events.some(
      (e) => e.kind === "card" && e.card === "red" && e.side === coachSide,
    );
    if (coachRed && margin >= 0) return "tenMen";
    const disallowed = result.events.some((e) => e.kind === "goal" && e.disallowedAt != null);
    if (disallowed && Math.abs(margin) <= 1) return "varDrama";
    if (cg + og === 0) return "boreDraw";
    if (cg + og >= THRILLER_GOALS) return "thriller";
    return margin > 0 ? "win" : margin === 0 ? "draw" : "loss";
  };

  const arc = pick();
  const h = hashStr(`${result.seed}:${arc}`);
  // ⛔ A late OWN GOAL has no scorer (`playerId` is unset), so the hero is nobody: draw
  // only from the wordings that never print `{player}`, or the headline opens on a blank.
  const nameless = values.player === "" ? NAMELESS[arc] : undefined;
  const variant = nameless != null ? nameless[h % nameless.length]! : h % HEADLINE_POOL;
  return { arc, key: `gameReport.headline.${arc}.${variant}`, values };
}
