import type { PlayerRole } from "@/data/schemas";
import type { GamePlayer } from "./player";
import type { GameTeam } from "./team";

/**
 * TASK-1810 — the matchday programme's arithmetic.
 *
 * Pure and I/O-free, so the whole pre-match screen is testable without React. Lives in
 * `domain/` for the same reason everything else here does: it is browser-safe and reads
 * nothing but the team it is handed.
 */

/** The four bars the Tale of the Tape draws. */
export interface Tape {
  overall: number;
  attack: number;
  midfield: number;
  defence: number;
}

/**
 * Role → comparison group.
 *
 * ⚠️ PRESENTATION ONLY. Nothing drafts, fields or simulates through this map — the
 * formation's own slots decide who plays where. It exists so that three bars can be drawn,
 * and a role landing in a surprising bucket changes a chart and nothing else.
 *
 * ⚠️ The goalkeeper counts toward the DEFENCE. A separate one-man bar would be noise, and
 * a keeper excluded from every group would make the three bars disagree with `overall`.
 */
const GROUP: Record<PlayerRole, "attack" | "midfield" | "defence"> = {
  GK: "defence",
  RB: "defence",
  CB: "defence",
  LB: "defence",
  CDM: "midfield",
  CM: "midfield",
  CAM: "midfield",
  RM: "midfield",
  LM: "midfield",
  RW: "attack",
  LW: "attack",
  SS: "attack",
  CF: "attack",
};

const rated = (players: GamePlayer[]): number[] =>
  players.map((p) => p.ratings?.overall).filter((r): r is number => r != null);

/**
 * The mean, rounded.
 *
 * ⚠️ Returns 0 for an empty list rather than NaN. A group with nobody rated is a real
 * case — Legacy draws from a club's whole history, and the thinner seasons carry cards the
 * rating pipeline could not score — and NaN would reach the screen as the string "NaN"
 * inside the bar's own label.
 */
const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * Group the XI by the FORMATION SLOT's role, never by the card's own.
 *
 * A card's `role` is nullable and can differ from where the coach actually fielded him;
 * the slot is what he is playing, and it is never null.
 */
export function taleOfTheTape(team: GameTeam): Tape {
  const buckets: Record<"attack" | "midfield" | "defence", number[]> = {
    attack: [],
    midfield: [],
    defence: [],
  };
  team.formation.slots.forEach((slot, i) => {
    const r = team.players[i]?.ratings?.overall;
    if (r == null) return;
    buckets[GROUP[slot.role]].push(r);
  });
  return {
    overall: mean(rated(team.players)),
    attack: mean(buckets.attack),
    midfield: mean(buckets.midfield),
    defence: mean(buckets.defence),
  };
}

/** The best card in the XI — the spotlight's subject. Null when nothing in it is rated. */
export function starOf(team: GameTeam): GamePlayer | null {
  let best: GamePlayer | null = null;
  for (const p of team.players) {
    const r = p.ratings?.overall;
    if (r == null) continue;
    if (best == null || r > (best.ratings?.overall ?? 0)) best = p;
  }
  return best;
}

/**
 * First and last season the XI is drawn from — the programme's subline.
 *
 * Legacy deals a club's complete history, so an XI routinely spans decades; saying so is
 * most of what makes the screen feel like a matchday programme rather than a team sheet.
 */
export function decadeSpan(team: GameTeam): { first: number; last: number } {
  const seasons = team.players.map((p) => p.season).filter((s) => Number.isFinite(s));
  if (seasons.length === 0) return { first: 0, last: 0 };
  return { first: Math.min(...seasons), last: Math.max(...seasons) };
}

export const squadAverage = (team: GameTeam): number => mean(rated(team.players));
