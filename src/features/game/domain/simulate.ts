import type { MatchResult, MatchSetup, MatchState, Side } from "./match-types";
import { calibrateK, cardChance, goalChance, pickBooked, pickScorer } from "./minute-model";
import { applyModifiers, baseWeights, BASELINE_MODIFIERS } from "./modifiers";
import { mulberry32 } from "./rng";
import { powerOf } from "./team-power";

const FULL_TIME = 90;
const RED_CARD_SHARE = 0.08;

function staminaAt(minute: number): number {
  return 1 - 0.25 * (minute / FULL_TIME); // 1.0 → 0.75
}

export function simulate(setup: MatchSetup): MatchResult {
  const rng = mulberry32(setup.seed);
  const modifiers = [...BASELINE_MODIFIERS, ...(setup.modifiers ?? [])];
  const k = calibrateK(setup.targetGoalsPerMatch);
  const teams = { home: setup.home, away: setup.away };

  const state: MatchState = {
    minute: 0,
    home: { power: setup.homePower ?? powerOf(setup.home), score: 0, stamina: 1, momentum: 0 },
    away: { power: setup.awayPower ?? powerOf(setup.away), score: 0, stamina: 1, momentum: 0 },
    events: [{ minute: 0, kind: "kickoff" }],
  };
  const sides: Side[] = ["home", "away"];

  for (let m = 1; m <= FULL_TIME; m++) {
    state.minute = m;
    state.home.stamina = staminaAt(m);
    state.away.stamina = staminaAt(m);
    state.home.momentum *= 0.9;
    state.away.momentum *= 0.9;

    for (const side of sides) {
      const opp: Side = side === "home" ? "away" : "home";
      const mine = applyModifiers(baseWeights(state[side].power), { state, side }, modifiers);
      const theirs = applyModifiers(baseWeights(state[opp].power), { state, side: opp }, modifiers);

      if (rng() < goalChance(mine.attack, theirs.defense, m, k)) {
        state[side].score += 1;
        const scorer = pickScorer(teams[side].players, rng);
        state.events.push({ minute: m, kind: "goal", side, playerId: scorer?.playerId });
        state[side].momentum = Math.min(1, state[side].momentum + 0.5);
        state[opp].momentum = Math.max(-1, state[opp].momentum - 0.3);
      }
      if (rng() < cardChance(mine.card)) {
        const booked = pickBooked(teams[side].players, rng);
        state.events.push({
          minute: m, kind: "card", side, playerId: booked?.playerId,
          card: rng() < RED_CARD_SHARE ? "red" : "yellow",
        });
      }
    }
    if (m === 45) state.events.push({ minute: 45, kind: "halftime" });
  }
  state.events.push({ minute: FULL_TIME, kind: "fulltime" });

  return {
    score: { home: state.home.score, away: state.away.score },
    events: state.events,
    seed: setup.seed,
  };
}
