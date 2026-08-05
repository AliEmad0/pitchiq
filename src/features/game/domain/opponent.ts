import type { MatchSetup, Modifier, TeamPower } from "./match-types";
import { type GameTeam, makeGameTeam } from "./team";
import { powerOf } from "./team-power";

// TASK-1805 — the hybrid opponent. Modern matchups aggregate the opponent's
// player ratings; historical opponents (any of the 34 seasons) derive their
// strength from their real league-season standings row. One `opponentPower`
// collapses both for the engine, and each side carries a `tacticalStyle` so the
// modifier stack can reward style match-ups — all deterministic (no rng here).

export type TacticalStyle =
  | "balanced"
  | "tiki-taka"
  | "high-press"
  | "low-block"
  | "counter"
  | "direct";

/** The slice of a standings row a record-based opponent needs. */
export interface OpponentRecord {
  name: string;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  rank: number;
}

export type Opponent =
  | { kind: "squad"; team: GameTeam; style: TacticalStyle }
  | { kind: "record"; record: OpponentRecord; style: TacticalStyle };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Collapse either opponent kind into the engine's `TeamPower`. */
export function opponentPower(opp: Opponent): TeamPower {
  if (opp.kind === "squad") return powerOf(opp.team);
  const r = opp.record;
  const forPg = r.played > 0 ? r.goalsFor / r.played : 1;
  const againstPg = r.played > 0 ? r.goalsAgainst / r.played : 1.5;
  return {
    attack: clamp(Math.round(forPg * 34), 15, 95),
    defense: clamp(Math.round(100 - againstPg * 28), 15, 95),
    aggression: 50,
  };
}

export function opponentName(opp: Opponent): string {
  return opp.kind === "squad" ? opp.team.name : opp.record.name;
}

/** Realise an opponent as a `GameTeam` for the engine (record → no XI). */
export function opponentTeam(opp: Opponent, season: number): GameTeam {
  if (opp.kind === "squad") return opp.team;
  return makeGameTeam(-1, opp.record.name, season, { name: "", season, slots: [] }, []);
}

// Style counters form a 5-cycle (each beats exactly one, loses to one);
// `balanced` is neutral to all.
const BEATS: Record<TacticalStyle, TacticalStyle> = {
  "high-press": "tiki-taka",
  "tiki-taka": "direct",
  direct: "low-block",
  "low-block": "counter",
  counter: "high-press",
  balanced: "balanced",
};

/** +1 if `mine` counters `theirs`, -1 if countered, 0 otherwise. */
export function styleEdge(mine: TacticalStyle, theirs: TacticalStyle): number {
  if (mine === "balanced" || theirs === "balanced") return 0;
  if (BEATS[mine] === theirs) return 1;
  if (BEATS[theirs] === mine) return -1;
  return 0;
}

const EDGE_ATTACK = 8;

/** A weight-contributing modifier for the 1803 stack: the side whose style
 * counters the opponent's gets a small attacking edge. */
export function tacticalStyleModifier(home: TacticalStyle, away: TacticalStyle): Modifier {
  return ({ side }) => {
    const mine = side === "home" ? home : away;
    const theirs = side === "home" ? away : home;
    return { attack: EDGE_ATTACK * styleEdge(mine, theirs) };
  };
}

/** Build a `MatchSetup` for a home team vs a hybrid opponent — feeds the
 * opponent's collapsed power + the tactical-style modifier into the engine. */
export function opponentSetup(args: {
  home: GameTeam;
  homeStyle: TacticalStyle;
  opponent: Opponent;
  season: number;
  seed: number;
  targetGoalsPerMatch: number;
  modifiers?: Modifier[];
}): MatchSetup {
  const { home, homeStyle, opponent, season, seed, targetGoalsPerMatch, modifiers = [] } = args;
  return {
    home,
    away: opponentTeam(opponent, season),
    awayPower: opponentPower(opponent),
    seed,
    targetGoalsPerMatch,
    modifiers: [tacticalStyleModifier(homeStyle, opponent.style), ...modifiers],
  };
}
