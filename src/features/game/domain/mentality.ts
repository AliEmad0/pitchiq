import type { Modifier, Side } from "./match-types";

/**
 * Mentality — the coach's stance for one match, picked on the Scout's Dossier beside his style
 * (split out of TASK-1825, owner 2026-10-21).
 *
 * ⭐ A stance sets the match's TEMPO, never the balance of power. Attacking opens the game up —
 * more goals at BOTH ends, fewer draws — and Defensive shuts it down: fewer goals, more draws.
 * Measured over 1,500 real-engine matches each, both land within 0.02 points a game of Balanced
 * (`mentality.test.ts`), so a stance is a choice about RISK — chase a win, or grind out a point —
 * and never a free win.
 *
 * ⛔ Measured, not assumed (`mentality.test.ts`): shifting attack up and defence down on one side
 * does NOTHING. The engine normalises the two sides' chance shares to sum to 1 (`edgeShare`), and
 * that shift raises both sides' edges equally, so it cancels. The lever is the match's goal rate.
 */
export type Mentality = "attacking" | "balanced" | "defensive";

/** The three stances in their SHIPPED order. ⛔ The share code's tokens are keyed on them. */
export const MENTALITIES: readonly Mentality[] = ["attacking", "balanced", "defensive"];

/**
 * Multiplier on the match's target goals per match. ⚠️ Balanced is exactly 1, so it is
 * byte-identical to a match played before mentality existed.
 */
export const MENTALITY_RATE: Record<Mentality, number> = {
  attacking: 1.3,
  balanced: 1,
  defensive: 0.72,
};

/** The goal target a match plays to under this stance. Absent = unchanged. */
export function mentalityTarget(base: number, stance: Mentality | undefined): number {
  return stance == null || stance === "balanced" ? base : base * MENTALITY_RATE[stance];
}

/**
 * The price of attacking: a high line leaves room to counter, so the OPPONENT gets an attacking
 * edge. ⛔ Without it Attacking was a free win — measured, an open game also magnifies home
 * advantage, so it out-pointed Balanced for favourites AND underdogs alike.
 */
export const COUNTER_EDGE = 4;

/** The weight half of a stance. Only Attacking has one; the others contribute nothing. */
export function mentalityModifier(coachSide: Side, stance: Mentality | undefined): Modifier | null {
  if (stance !== "attacking") return null;
  return ({ side }) => (side === coachSide ? {} : { attack: COUNTER_EDGE });
}
