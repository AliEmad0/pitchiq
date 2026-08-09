import type { AltercationOutcome, RefereeStyle, Side, VarOutcome } from "./match-types";

/**
 * TASK-1822 Phase 3 — the referee, the card ledger, and video review.
 *
 * The engine previously had one disciplinary concept: a card, shown to nobody in
 * particular, with an 8% chance of being red. There was no memory of who had already
 * been booked, no way for a professional foul to be punished as one, and no official
 * with a point of view.
 */

export interface Referee {
  style: RefereeStyle;
  /** The side this referee leans toward, if any. */
  favours: Side | null;
  /** Multiplier on how readily cards come out. */
  cardBias: number;
  /** Multiplier on penalties for the favoured side. */
  penaltyBias: number;
}

const REFEREES: Record<RefereeStyle, Omit<Referee, "style">> = {
  // Books early and often. A player on a yellow is in real danger with this one.
  strict: { favours: null, cardBias: 1.7, penaltyBias: 1 },
  // Lets the game flow — good for a scrappy match, bad for a side being kicked.
  lenient: { favours: null, cardBias: 0.55, penaltyBias: 1 },
  // Hears the crowd. Marginal calls go the home side's way, and the away side knows it.
  "crowd-influenced": { favours: "home", cardBias: 1, penaltyBias: 2.1 },
};

const STYLES: RefereeStyle[] = ["strict", "lenient", "crowd-influenced"];

export function pickReferee(r: number): Referee {
  const style = STYLES[Math.min(STYLES.length - 1, Math.floor(r * STYLES.length))];
  return { style, ...REFEREES[style] };
}

/** Penalty-rate multiplier for one side under this referee. */
export function penaltyBiasFor(ref: Referee, side: Side): number {
  if (ref.favours == null) return 1;
  return ref.favours === side ? ref.penaltyBias : 1;
}

/** Card-rate multiplier for one side. A biased referee also books the OTHER side more. */
export function cardBiasFor(ref: Referee, side: Side): number {
  const lean = ref.favours == null ? 1 : ref.favours === side ? 0.75 : 1.3;
  return ref.cardBias * lean;
}

/** Per-side, per-minute chance of a professional foul on a clear breakaway. */
export const DOGSO_PER_MATCH = 0.05;

/** Per-minute chance that two players square up. */
export const ALTERCATION_PER_MATCH = 0.55;

const ALTERCATION_BRANCHES: [AltercationOutcome, number][] = [
  ["words", 0.7],
  ["both-booked", 0.27],
  ["red", 0.03],
];

export function resolveAltercation(r: number): AltercationOutcome {
  let acc = 0;
  for (const [outcome, weight] of ALTERCATION_BRANCHES) {
    acc += weight;
    if (r < acc) return outcome;
  }
  return "words";
}

/**
 * Chance a goal is reviewed AND chalked off. Deliberately small: a disallowed goal is
 * one of the most memorable things in a match precisely because it is rare, and a
 * model that took away one goal in five would just feel unfair.
 */
export const VAR_DISALLOW_CHANCE = 0.055;

/** Chance a review awards a penalty nobody saw. */
export const VAR_PENALTY_PER_MATCH = 0.06;

/** Chance a booking is upgraded to a sending-off on review. */
export const VAR_UPGRADE_CHANCE = 0.012;

/** Which flavour of disallowance — offside is by far the more common. */
export function disallowReason(r: number): VarOutcome {
  return r < 0.7 ? "goal-disallowed-offside" : "goal-disallowed-foul";
}
