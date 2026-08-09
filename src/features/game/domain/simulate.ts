import type { MatchResult, MatchSetup, MatchState, Side } from "./match-types";
import {
  calibrateK,
  cardChance,
  chanceRate,
  pickBooked,
  pickScorer,
  resolveChance,
} from "./minute-model";
import { BASELINE_MODIFIERS, DESPERATION_MINUTE, applyModifiers, baseWeights } from "./modifiers";
import { mulberry32 } from "./rng";
import { powerOf } from "./team-power";

const FULL_TIME = 90;
const RED_CARD_SHARE = 0.08;

/**
 * Minutes a side stays lifted after conceding.
 *
 * TASK-1822: conceding provokes a RESPONSE. The previous model rewarded the scorer and
 * punished the conceding side, which suppressed comebacks — measured, only 10.4% of
 * matches were won by the side that conceded first.
 */
export const RESPONSE_WINDOW = 15;

/**
 * Urgency granted for conceding, versus the much smaller lift from scoring.
 *
 * The gap between these two IS the response. Note the edge function
 * `attack / (attack + oppDefense)` is deliberately insensitive — a ten-point attack
 * swing moves a side's share of play by only ~1.5pp — so the response is a real but
 * modest tilt, not a takeover. The outcome that matters (comeback rate) is pinned by
 * `game-match-harness.test.ts`.
 */
const RESPONSE_URGENCY = 0.6;
const SCORER_URGENCY = 0.1;

/** Added time at the end of the ninety. Stoppage-time drama is a real match's climax. */
const MIN_ADDED = 2;
const ADDED_SPREAD = 5; // 2-6 minutes

function staminaAt(minute: number): number {
  return 1 - 0.25 * (Math.min(minute, FULL_TIME) / FULL_TIME); // 1.0 → 0.75
}

export function simulate(setup: MatchSetup): MatchResult {
  const rng = mulberry32(setup.seed);
  const modifiers = [...BASELINE_MODIFIERS, ...(setup.modifiers ?? [])];
  const k = calibrateK(setup.targetGoalsPerMatch);
  const teams = { home: setup.home, away: setup.away };

  const blank = (power: ReturnType<typeof powerOf>) => ({
    power,
    score: 0,
    stamina: 1,
    momentum: 0,
    respondingUntil: 0,
    pushed: false,
  });

  const state: MatchState = {
    minute: 0,
    home: blank(setup.homePower ?? powerOf(setup.home)),
    away: blank(setup.awayPower ?? powerOf(setup.away)),
    events: [{ minute: 0, kind: "kickoff" }],
  };
  const sides: Side[] = ["home", "away"];

  // Drawn up front so the roll order stays stable regardless of what happens in play —
  // a later phase adding VAR or injury stoppages must not shift every subsequent roll.
  const added = MIN_ADDED + Math.floor(rng() * ADDED_SPREAD);
  const lastMinute = FULL_TIME + added;

  for (let m = 1; m <= lastMinute; m++) {
    state.minute = m;
    for (const side of sides) {
      const s = state[side];
      s.stamina = staminaAt(m);
      // Urgency decays, and the response window closes hard when it expires.
      s.momentum = m > s.respondingUntil ? s.momentum * 0.86 : s.momentum;
      if (s.momentum < 0.02) s.momentum = 0;
    }

    // Announce a late all-out push once per side, so the comeback is VISIBLE rather
    // than being a silent change in the numbers.
    if (m >= DESPERATION_MINUTE) {
      for (const side of sides) {
        const opp: Side = side === "home" ? "away" : "home";
        if (!state[side].pushed && state[opp].score > state[side].score) {
          state[side].pushed = true;
          state.events.push({ minute: m, kind: "push", side });
        }
      }
    }

    if (m === FULL_TIME) {
      state.events.push({ minute: FULL_TIME, kind: "stoppage", addedMinutes: added });
    }

    for (const side of sides) {
      const opp: Side = side === "home" ? "away" : "home";
      const mine = applyModifiers(baseWeights(state[side].power), { state, side }, modifiers);
      const theirs = applyModifiers(baseWeights(state[opp].power), { state, side: opp }, modifiers);

      if (rng() < chanceRate(mine.attack, theirs.defense, m, k)) {
        const shooter = pickScorer(teams[side].players, rng);
        const outcome = resolveChance(rng());
        if (outcome === "goal") {
          state[side].score += 1;
          state.events.push({ minute: m, kind: "goal", side, playerId: shooter?.playerId });
          // The response: the side that just CONCEDED is the one lifted.
          state[opp].momentum = Math.min(1, state[opp].momentum + RESPONSE_URGENCY);
          state[opp].respondingUntil = m + RESPONSE_WINDOW;
          state[side].momentum = Math.min(1, state[side].momentum + SCORER_URGENCY);
        } else {
          state.events.push({
            minute: m,
            kind: "chance",
            side,
            playerId: shooter?.playerId,
            outcome,
          });
        }
      }

      if (rng() < cardChance(mine.card)) {
        const booked = pickBooked(teams[side].players, rng);
        state.events.push({
          minute: m,
          kind: "card",
          side,
          playerId: booked?.playerId,
          card: rng() < RED_CARD_SHARE ? "red" : "yellow",
        });
      }
    }
    if (m === 45) state.events.push({ minute: 45, kind: "halftime" });
  }
  state.events.push({ minute: lastMinute, kind: "fulltime" });

  return {
    score: { home: state.home.score, away: state.away.score },
    events: state.events,
    seed: setup.seed,
  };
}

/** Kept for callers that reason about regulation time. */
export { FULL_TIME };
