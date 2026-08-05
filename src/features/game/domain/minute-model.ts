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

/** Per-minute goal probability for a side: attack-vs-defense edge × hazard × k. */
export function goalChance(attack: number, oppDefense: number, minute: number, k: number): number {
  const edge = attack / (attack + oppDefense || 1);
  return k * edge * minuteWeight(minute);
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

/** Booked: defensive/physical roles slightly more likely. */
export function pickBooked(players: GamePlayer[], rng: () => number): GamePlayer | null {
  return pickBy(
    players,
    rng,
    (p) => weightsFor(p.role).defense + weightsFor(p.role).physical + 0.2,
  );
}
