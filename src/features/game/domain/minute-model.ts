import type { ChanceOutcome } from "./match-types";
import type { GamePlayer } from "./player";
import { weightsFor } from "./rating-weights";

const CARD_K = 0.03; // ~2.7 cards/match at mean aggression

/** Goal-hazard shape: gentle rise + stoppage spikes (45+, 90+), from the real histogram. */
export function minuteWeight(minute: number): number {
  let w = 0.85 + 0.3 * (minute / 90);
  if (minute >= 44 && minute <= 46) w += 0.4;
  if (minute >= 88) w += 0.6;
  return w;
}

function sumMinuteWeights(): number {
  let s = 0;
  for (let m = 1; m <= 90; m++) s += minuteWeight(m);
  return s;
}

/** Scale factor so two equal teams score ≈ target total goals over a match. */
export function calibrateK(targetGoalsPerMatch: number): number {
  return targetGoalsPerMatch / sumMinuteWeights();
}

/**
 * How sharply a rating advantage converts into chances (TASK-1844).
 *
 * ⛔ `p = 1` is the ORIGINAL formula, `attack / (attack + oppDefense)`. Measured over real
 * seasons played by their real squads, it makes the archive's WIDEST squad gap (92.7 v 69.8)
 * worth ~0.05 points per game, so a 38-week league table came out at half the real dispersion
 * — points SD 8.7 against a real 16.2 — and finishing order was mostly noise. A single match
 * hides this; a season cannot.
 *
 * ⭐ FITTED at 6 over 9 real seasons × 4 seeds, against the tables that actually happened:
 * points SD 16.3 (real 16.2), top-to-bottom 61.3 (real 62.0), champion win rate 68.6% (69.9%).
 * It fits the SHAPE of a table rather than any one row — `p = 9` matches champion points almost
 * exactly and is wrong, because it overshoots both dispersion measures.
 *
 * ⚠️ It is only meaningful alongside `edgeShare`'s normalisation. Without that, the exponent
 * also moves the goal RATE, and the optimum reads as ~12 for the wrong reason.
 *
 * ⛔ Anything fitted against match OUTCOMES moves when this does — `CHEM_EFFECT` was re-fitted
 * from 0.08 to 0.03 in the same change. See the spec.
 */
export const POWER_EXPONENT = 6;

/**
 * One side's RAW strength edge — its attack measured against the other's defence.
 *
 * ⚠️ NOT used directly to drive the match; see `edgeShare`. Two IDENTICAL teams do not score
 * 0.5 here, because a team's attack and its defence are different numbers.
 */
export function rawEdge(
  attack: number,
  oppDefense: number,
  exponent: number = POWER_EXPONENT,
): number {
  const a = Math.pow(Math.max(attack, 1), exponent);
  const d = Math.pow(Math.max(oppDefense, 1), exponent);
  return a / (a + d || 1);
}

/**
 * Per-minute goal probability for one side in isolation: raw edge × hazard × k.
 *
 * ⚠️ `exponent` is a seam for the CALIBRATION sweep. Production always takes the default.
 */
export function goalChance(
  attack: number,
  oppDefense: number,
  minute: number,
  k: number,
  exponent: number = POWER_EXPONENT,
): number {
  return k * rawEdge(attack, oppDefense, exponent) * minuteWeight(minute);
}

/** Both sides of a fixture, from the perspective of the side being resolved. */
export interface Matchup {
  attack: number;
  defense: number;
  oppAttack: number;
  oppDefense: number;
}

/**
 * A side's SHARE of the match's chances. The two sides always sum to exactly 1.
 *
 * ⛔ THE NORMALISATION IS LOAD-BEARING (TASK-1844), and measuring is what forced it. `calibrateK`
 * sets `k` so that a match yields the season-authentic goal total, which holds only if the two
 * sides' edges sum to 1. They do not: a raw edge compares ATTACK against DEFENCE, and those sit
 * on different scales — measured across real leagues, mean attack 57.8 v defence 49.2 in 2000
 * but 53.8 v 57.1 in 2012, i.e. the offset flips sign by season. At `POWER_EXPONENT = 1` that
 * distortion is small (edge sums 1.08 and 0.97), but the exponent AMPLIFIES it: at p = 12 the
 * same two seasons sum to 1.75 and 0.65, so one would score 75% too many goals and the other
 * 35% too few.
 *
 * ⭐ Normalising decouples the two questions the engine must answer separately: **how many**
 * chances a match produces (the season's goal rate, set by `k`) and **who gets them** (the
 * strength split, set by `POWER_EXPONENT`). Changing the exponent can now never move the goal
 * rate — which is what the shipped `game-match-harness.test.ts` band exists to protect.
 */
export function edgeShare(m: Matchup, exponent: number = POWER_EXPONENT): number {
  const mine = rawEdge(m.attack, m.oppDefense, exponent);
  const theirs = rawEdge(m.oppAttack, m.defense, exponent);
  const total = mine + theirs;
  return total > 0 ? mine / total : 0.5;
}

/**
 * Share of chances that become goals.
 *
 * DELIBERATELY CONSTANT at the match level. Team strength already decides how many
 * chances a side CREATES (`chanceRate` carries the attack-vs-defence edge), which is
 * how football actually differs between good and bad teams. Making conversion vary too
 * would double-count strength AND break the season-authentic goals-per-match
 * calibration, which is pinned by `game-match-harness.test.ts`.
 */
export const CONVERSION = 0.11;

/**
 * Per-minute probability that a side creates a CHANCE (not a goal).
 *
 * Derived from the goal rate so that goals-per-match is preserved exactly: a chance
 * arrives 1/CONVERSION times as often as a goal used to, and converts at CONVERSION.
 * The engine gains ~9x the events without moving a single result.
 */
export function chanceRate(
  m: Matchup,
  minute: number,
  k: number,
  exponent: number = POWER_EXPONENT,
): number {
  return (k * edgeShare(m, exponent) * minuteWeight(minute)) / CONVERSION;
}

/**
 * Non-goal chance outcomes, weighted to a plausible shot mix: most attempts are saved
 * or blocked, woodwork is rare enough to feel like an event when it happens.
 */
const OUTCOME_WEIGHTS: [ChanceOutcome, number][] = [
  ["saved", 0.42],
  ["blocked", 0.24],
  ["wide", 0.24],
  ["post", 0.06],
  ["crossbar", 0.04],
];

/** Resolve a chance into a goal or one of the near-miss branches. */
export function resolveChance(r: number, conversion = CONVERSION): "goal" | ChanceOutcome {
  if (r < conversion) return "goal";
  let acc = conversion;
  const span = 1 - conversion;
  for (const [outcome, share] of OUTCOME_WEIGHTS) {
    acc += share * span;
    if (r < acc) return outcome;
  }
  return "saved";
}

export function cardChance(cardWeight: number): number {
  return CARD_K * (cardWeight / 100);
}

/** Cumulative weighted pick; r ∈ [0,1). Uniform fallback if all weights 0. */
export function weightedIndex(weights: number[], r: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return Math.min(weights.length - 1, Math.floor(r * weights.length));
  let acc = 0;
  const threshold = r * total;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (threshold < acc) return i;
  }
  return weights.length - 1;
}

function pickBy(
  players: GamePlayer[],
  rng: () => number,
  weight: (p: GamePlayer) => number,
): GamePlayer | null {
  if (players.length === 0) return null;
  return players[weightedIndex(players.map(weight), rng())];
}

/** Scorer: attacking roles + attack rating. The keeper never scores in open play. */
export function pickScorer(players: GamePlayer[], rng: () => number): GamePlayer | null {
  return pickBy(players, rng, (p) =>
    p.role === "GK" ? 0 : (weightsFor(p.role).attack + 0.1) * (p.ratings?.attack ?? 50),
  );
}

/**
 * Share of open-play goals that carry an assist. Real football sits near three in five;
 * the rest are solo runs, rebounds, deflections and long-range efforts nobody set up.
 */
export const ASSIST_SHARE = 0.6;

/**
 * Assister: creation-weighted, and NEVER the scorer.
 *
 * Excluding the scorer is not a nicety — a goal credited to the same player for both
 * halves of it reads as a bug the first time anyone sees it in a roster.
 */
export function pickAssister(
  players: GamePlayer[],
  scorerId: number | undefined,
  rng: () => number,
): GamePlayer | null {
  const eligible = players.filter((p) => p.playerId !== scorerId && p.role !== "GK");
  return pickBy(
    eligible,
    rng,
    (p) => (weightsFor(p.role).creation + 0.1) * (p.ratings?.creation ?? 50),
  );
}

/** Booked: defensive/physical roles slightly more likely. */
export function pickBooked(players: GamePlayer[], rng: () => number): GamePlayer | null {
  return pickBy(
    players,
    rng,
    (p) => weightsFor(p.role).defense + weightsFor(p.role).physical + 0.2,
  );
}
