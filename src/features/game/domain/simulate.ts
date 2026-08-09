import {
  ALTERCATION_PER_MATCH,
  DOGSO_PER_MATCH,
  type Referee,
  VAR_DISALLOW_CHANCE,
  VAR_PENALTY_PER_MATCH,
  VAR_UPGRADE_CHANCE,
  cardBiasFor,
  disallowReason,
  penaltyBiasFor,
  pickReferee,
  resolveAltercation,
} from "./discipline";
import type {
  CardReason,
  GoalSource,
  MatchResult,
  MatchSetup,
  MatchState,
  Side,
} from "./match-types";
import type { GameTeam } from "./team";
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
import {
  FREE_KICK_PER_MATCH,
  PENALTY_PER_MATCH,
  openPlayTarget,
  penaltyScored,
  resolveFreeKick,
  resolvePenalty,
} from "./set-pieces";
import { powerOf } from "./team-power";

const FULL_TIME = 90;
/**
 * Share of ordinary bookings that are a straight red instead.
 *
 * Cut from 0.08 when Phase 3 added four MORE routes to a dismissal (second yellows,
 * DOGSO, altercations, VAR upgrades). Measured, the old value stacked them to 0.65 reds
 * per match against a real-football rate near 0.2 — every new source has to come out of
 * the same budget, exactly as set-piece goals come out of the goal target.
 */
const RED_CARD_SHARE = 0.025;

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

/**
 * Record a goal from ANY source — open play, penalty or free kick.
 *
 * Shared on purpose: the scoreline, the `goal` event and the response window must move
 * together no matter how the ball went in, and a penalty that updated the score without
 * emitting a `goal` event would leave the UI (which counts goal events) disagreeing
 * with the result.
 */
function scoreGoal(
  state: MatchState,
  side: Side,
  opp: Side,
  minute: number,
  playerId: number | undefined,
  source: GoalSource,
  rng?: () => number,
  referee?: Referee,
): void {
  // VAR lives HERE rather than at each call site, so "a disallowed goal never emits a
  // `goal` event" is structural. That is what keeps the scoreline exactly equal to the
  // number of goal events no matter how many ways a phase adds to score.
  //
  // ⚠️ NEVER for a penalty. A spot kick cannot be offside and has no build-up to find a
  // foul in, so reviewing one for either reason is nonsense — a test caught the engine
  // chalking off converted penalties for offside.
  const reviewable = source !== "penalty";
  if (reviewable && rng != null && rng() < VAR_DISALLOW_CHANCE) {
    state.events.push({ minute, kind: "var", side, playerId, varOutcome: disallowReason(rng()) });
    if (referee != null) noteBias(state, referee, side === "home" ? "away" : "home", minute);
    return;
  }
  state[side].score += 1;
  state.events.push({ minute, kind: "goal", side, playerId, source });
  // The side that CONCEDED is the one lifted — see RESPONSE_WINDOW.
  state[opp].momentum = Math.min(1, state[opp].momentum + RESPONSE_URGENCY);
  state[opp].respondingUntil = minute + RESPONSE_WINDOW;
  state[side].momentum = Math.min(1, state[side].momentum + SCORER_URGENCY);
}

/**
 * Show a card, honouring the booking ledger.
 *
 * A player already on a yellow gets a SECOND YELLOW and walks; a player already sent
 * off cannot be picked at all. Both were impossible before — the old model drew a
 * fresh card with an 8% red share and no memory whatsoever.
 */
function showCard(
  state: MatchState,
  teams: { home: GameTeam; away: GameTeam },
  side: Side,
  minute: number,
  reason: CardReason,
  rng: () => number,
  force?: "red",
): void {
  const key = (playerId: number) => `${side}:${playerId}`;
  const available = teams[side].players.filter((p) => !state.dismissed.has(key(p.playerId)));
  const player = pickBooked(available, rng);
  if (player == null) return;
  const id = player.playerId;

  const alreadyBooked = (state.booked.get(key(id)) ?? 0) > 0;
  let card: "yellow" | "red" = force ?? "yellow";
  let finalReason = reason;

  if (reason === "dogso" || reason === "violent-conduct" || force === "red") {
    card = "red";
  } else if (alreadyBooked) {
    card = "red";
    finalReason = "second-yellow";
  } else if (rng() < VAR_UPGRADE_CHANCE) {
    // The review sees something the referee missed.
    state.events.push({ minute, kind: "var", side, playerId: id, varOutcome: "red-upgraded" });
    card = "red";
    finalReason = "violent-conduct";
  }

  if (card === "yellow") state.booked.set(key(id), (state.booked.get(key(id)) ?? 0) + 1);
  else state.dismissed.add(key(id));
  if (card === "red") state[side].sentOff += 1;

  state.events.push({ minute, kind: "card", side, playerId: id, card, reason: finalReason });
}

/** Note a decision that went the referee's favoured way, and anger the other side. */
function noteBias(state: MatchState, referee: Referee, benefited: Side, minute: number): void {
  if (referee.favours == null || referee.favours !== benefited) return;
  const wronged: Side = benefited === "home" ? "away" : "home";
  state[wronged].rage = Math.min(1, state[wronged].rage + 0.35);
  state.events.push({ minute, kind: "bias", side: wronged, refStyle: referee.style });
}

export function simulate(setup: MatchSetup): MatchResult {
  const rng = mulberry32(setup.seed);
  const modifiers = [...BASELINE_MODIFIERS, ...(setup.modifiers ?? [])];
  // Open play gets what set pieces do not — see `openPlayTarget`. Adding new ways to
  // score on TOP of the target would make `targetGoalsPerMatch` meaningless.
  const k = calibrateK(openPlayTarget(setup.targetGoalsPerMatch));
  const teams = { home: setup.home, away: setup.away };

  // Per-side, per-minute rates for the set pieces, spread over regulation time.
  const basePenaltyRate = PENALTY_PER_MATCH / 2 / FULL_TIME;
  const freeKickRate = FREE_KICK_PER_MATCH / 2 / FULL_TIME;
  const dogsoRate = DOGSO_PER_MATCH / 2 / FULL_TIME;
  const altercationRate = ALTERCATION_PER_MATCH / FULL_TIME;
  const varPenaltyRate = VAR_PENALTY_PER_MATCH / 2 / FULL_TIME;

  const referee = pickReferee(rng());

  const blank = (power: ReturnType<typeof powerOf>) => ({
    power,
    score: 0,
    stamina: 1,
    momentum: 0,
    respondingUntil: 0,
    pushed: false,
    sentOff: 0,
    rage: 0,
  });

  const state: MatchState = {
    minute: 0,
    home: blank(setup.homePower ?? powerOf(setup.home)),
    away: blank(setup.awayPower ?? powerOf(setup.away)),
    // Kick-off stays FIRST — it is the match starting, and existing consumers rely on
    // `events[0].kind === "kickoff"`. The referee is introduced immediately after.
    events: [
      { minute: 0, kind: "kickoff" },
      { minute: 0, kind: "referee", refStyle: referee.style },
    ],
    booked: new Map(),
    dismissed: new Set(),
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
      // Injustice fades, but slowly — a wronged side carries it a long way.
      s.rage *= 0.97;
      if (s.rage < 0.02) s.rage = 0;
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
          scoreGoal(state, side, opp, m, shooter?.playerId, "open", rng, referee);
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

      // ---- set pieces -------------------------------------------------------
      // Rolled every minute for BOTH sides regardless of outcome, so the PRNG
      // consumption pattern stays fixed. A later phase gating these behind an
      // earlier event would shift every subsequent roll and break seed replay.
      const penaltyRoll = rng();
      const penaltyBranch = rng();
      const freeKickRoll = rng();
      const freeKickBranch = rng();

      if (penaltyRoll < basePenaltyRate * penaltyBiasFor(referee, side)) {
        const taker = pickScorer(teams[side].players, rng);
        const outcome = resolvePenalty(penaltyBranch);
        const rebound =
          outcome === "saved-rebound-goal" ? pickScorer(teams[side].players, rng) : null;
        state.events.push({
          minute: m,
          kind: "penalty",
          side,
          playerId: taker?.playerId,
          penaltyOutcome: outcome,
          reboundPlayerId: rebound?.playerId,
        });
        if (penaltyScored(outcome)) {
          scoreGoal(
            state,
            side,
            opp,
            m,
            rebound?.playerId ?? taker?.playerId,
            "penalty",
            rng,
            referee,
          );
        }
      }

      if (freeKickRoll < freeKickRate) {
        const taker = pickScorer(teams[side].players, rng);
        const outcome = resolveFreeKick(freeKickBranch);
        state.events.push({
          minute: m,
          kind: "freekick",
          side,
          playerId: taker?.playerId,
          freeKickOutcome: outcome,
        });
        if (outcome === "scored") scoreGoal(state, side, opp, m, taker?.playerId, "freekick");
      }

      // ---- discipline -------------------------------------------------------
      if (rng() < cardChance(mine.card) * cardBiasFor(referee, side)) {
        const violent = rng() < RED_CARD_SHARE;
        showCard(state, teams, side, m, violent ? "violent-conduct" : "normal", rng);
      }

      // A professional foul on a clear breakaway: the DEFENDING side loses a man and
      // the attacking side gets the set piece. Both halves of the punishment.
      if (rng() < dogsoRate) {
        const victimSide = opp;
        showCard(state, teams, victimSide, m, "dogso", rng);
        const inBox = rng() < 0.4;
        const taker = pickScorer(teams[side].players, rng);
        if (inBox) {
          const outcome = resolvePenalty(rng());
          state.events.push({
            minute: m,
            kind: "penalty",
            side,
            playerId: taker?.playerId,
            penaltyOutcome: outcome,
          });
          if (penaltyScored(outcome)) {
            scoreGoal(state, side, opp, m, taker?.playerId, "penalty");
          }
        } else {
          const outcome = resolveFreeKick(rng());
          state.events.push({
            minute: m,
            kind: "freekick",
            side,
            playerId: taker?.playerId,
            freeKickOutcome: outcome,
          });
          if (outcome === "scored") scoreGoal(state, side, opp, m, taker?.playerId, "freekick");
        }
      }

      // Two players squaring up. Only rolled for the home side so a single flashpoint
      // isn't double-counted from both perspectives.
      if (side === "home" && rng() < altercationRate) {
        const outcome = resolveAltercation(rng());
        state.events.push({ minute: m, kind: "altercation", altercationOutcome: outcome });
        if (outcome === "both-booked") {
          showCard(state, teams, "home", m, "altercation", rng);
          showCard(state, teams, "away", m, "altercation", rng);
        } else if (outcome === "red") {
          const guilty: Side = rng() < 0.5 ? "home" : "away";
          showCard(state, teams, guilty, m, "violent-conduct", rng, "red");
        }
      }

      // A review that awards a penalty nobody saw.
      if (rng() < varPenaltyRate) {
        state.events.push({ minute: m, kind: "var", side, varOutcome: "penalty-awarded" });
        noteBias(state, referee, side, m);
        const taker = pickScorer(teams[side].players, rng);
        const outcome = resolvePenalty(rng());
        state.events.push({
          minute: m,
          kind: "penalty",
          side,
          playerId: taker?.playerId,
          penaltyOutcome: outcome,
        });
        if (penaltyScored(outcome)) {
          scoreGoal(state, side, opp, m, taker?.playerId, "penalty");
        }
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
