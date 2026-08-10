import {
  ALTERCATION_PER_MATCH,
  DOGSO_PER_MATCH,
  type Referee,
  REF_AGREES_VAR,
  VAR_DECISION_DELAY,
  VAR_RED_REVIEW_CHANCE,
  VAR_REVIEW_CHANCE,
  VAR_PENALTY_PER_MATCH,
  VAR_UPGRADE_CHANCE,
  cardBiasFor,
  disallowReason,
  penaltyBiasFor,
  pickReferee,
  resolveAltercation,
} from "./discipline";
import {
  CROWD_PER_MATCH,
  OWN_GOAL_PER_MATCH,
  goalStyleFor,
  pickWeather,
  slipFactor,
} from "./colour";
import type {
  CardReason,
  MatchEvent,
  GoalStyle,
  GoalSource,
  MatchResult,
  MatchSetup,
  MatchState,
  Side,
  SubReason,
} from "./match-types";
import {
  ASSIST_SHARE,
  calibrateK,
  cardChance,
  chanceRate,
  pickAssister,
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
import {
  INJURY_PER_SIDE,
  KEEPER_SWEEP_PER_SIDE,
  KNOCK_MINUTES,
  MAX_SUBS,
  SUBS_PER_SIDE,
  SUB_WINDOW_END,
  SUB_WINDOW_START,
  pickPlayerOff,
  pickPlayerOn,
  resolveInjury,
  resolveKeeper,
} from "./squad";
import { powerOf } from "./team-power";
import type { GamePlayer } from "./player";

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
  extra?: {
    goalStyle?: GoalStyle;
    ownGoalBy?: number;
    narrated?: boolean;
    assistPlayerId?: number;
  },
): void {
  // THE GOAL IS GIVEN FIRST — always, in full, with scorer, assist and description.
  // The old model deleted a disallowed goal outright, so a viewer saw a review with no
  // idea what was being reviewed. Owner's call: celebrate it, THEN doubt it.
  //
  // ⚠️ A penalty is NEVER reviewed for offside or a build-up foul. A spot kick has no
  // build-up and cannot be offside — a test caught the engine chalking those off.
  const reviewable = source !== "penalty";
  const goalEvent: MatchEvent = {
    minute,
    kind: "goal",
    side,
    playerId,
    source,
    ...(extra?.goalStyle != null ? { goalStyle: extra.goalStyle } : {}),
    ...(extra?.ownGoalBy != null ? { ownGoalBy: extra.ownGoalBy } : {}),
    ...(extra?.narrated ? { narrated: true } : {}),
    ...(extra?.assistPlayerId != null ? { assistPlayerId: extra.assistPlayerId } : {}),
  };
  state.events.push(goalEvent);
  state[side].score += 1;

  if (reviewable && rng != null && rng() < VAR_REVIEW_CHANCE) {
    // Beat two, SAME minute: the booth doubts it and the referee is sent to the monitor.
    state.events.push({ minute, kind: "var", side, playerId, varOutcome: "review-goal" });
    // Beat three, a MINUTE LATER: his decision. The delay is the suspense — the goal is
    // on the scoreboard and the crowd is celebrating while everyone waits.
    const decisionMinute = minute + VAR_DECISION_DELAY;
    if (rng() < REF_AGREES_VAR) {
      goalEvent.disallowedAt = decisionMinute;
      state[side].score -= 1;
      state.events.push({
        minute: decisionMinute,
        kind: "var",
        side,
        playerId,
        varOutcome: disallowReason(rng()),
      });
      if (referee != null) noteBias(state, referee, side === "home" ? "away" : "home", minute);
    } else {
      // He is not convinced by the intervention. It stands.
      state.events.push({
        minute: decisionMinute,
        kind: "var",
        side,
        playerId,
        varOutcome: "goal-stands",
      });
      if (referee != null) noteBias(state, referee, side, minute);
    }
    if (goalEvent.disallowedAt != null) return;
  }
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
  onPitch: GamePlayer[],
  side: Side,
  minute: number,
  reason: CardReason,
  rng: () => number,
  force?: "red",
): "yellow" | "red" | null {
  const key = (playerId: number) => `${side}:${playerId}`;
  const available = onPitch.filter((p) => !state.dismissed.has(key(p.playerId)));
  const player = pickBooked(available, rng);
  if (player == null) return null;
  const id = player.playerId;

  const alreadyBooked = (state.booked.get(key(id)) ?? 0) > 0;
  let card: "yellow" | "red" = force ?? "yellow";
  let finalReason = reason;

  if (reason === "dogso" || reason === "violent-conduct" || force === "red") {
    card = "red";
    // A sending-off is the decision most worth stopping the match to be sure about. He
    // goes to the monitor — and can come back unconvinced, in which case it is a booking.
    if (rng() < VAR_RED_REVIEW_CHANCE) {
      state.events.push({ minute, kind: "var", side, playerId: id, varOutcome: "review-red" });
      if (rng() < REF_AGREES_VAR) {
        // NOT `red-upgraded` — that means the booth turned a BOOKING into a red. This is
        // a red already shown and stood by. Reusing the name broke the invariant pairing
        // `red-upgraded` with a violent-conduct card.
        state.events.push({ minute, kind: "var", side, playerId: id, varOutcome: "red-confirmed" });
      } else {
        state.events.push({ minute, kind: "var", side, playerId: id, varOutcome: "red-not-given" });
        // Downgraded to a booking — UNLESS he was already on one, in which case the
        // reprieve is worthless: a second yellow is still a second yellow and he walks.
        // Without this the review could leave a player on the pitch holding two yellows.
        if (alreadyBooked) {
          finalReason = "second-yellow";
        } else {
          card = "yellow";
          finalReason = "normal";
        }
      }
    }
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
  else {
    state.dismissed.add(key(id));
    // A dismissed player leaves the pitch, so he can never be booked, injured or
    // substituted afterwards.
    const idx = onPitch.findIndex((p) => p.playerId === id);
    if (idx >= 0) onPitch.splice(idx, 1);
  }
  if (card === "red") state[side].sentOff += 1;

  state.events.push({ minute, kind: "card", side, playerId: id, card, reason: finalReason });
  return card;
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

  // Per-side, per-minute rates for the set pieces, spread over regulation time.
  const basePenaltyRate = PENALTY_PER_MATCH / 2 / FULL_TIME;
  const freeKickRate = FREE_KICK_PER_MATCH / 2 / FULL_TIME;
  const dogsoRate = DOGSO_PER_MATCH / 2 / FULL_TIME;
  const altercationRate = ALTERCATION_PER_MATCH / FULL_TIME;
  const varPenaltyRate = VAR_PENALTY_PER_MATCH / 2 / FULL_TIME;

  const referee = pickReferee(rng());
  const weather = pickWeather(rng());
  const slip = slipFactor(weather);
  const ownGoalRate = OWN_GOAL_PER_MATCH / 2 / FULL_TIME;
  const crowdRate = CROWD_PER_MATCH / FULL_TIME;

  const blank = (power: ReturnType<typeof powerOf>) => ({
    power,
    score: 0,
    stamina: 1,
    momentum: 0,
    respondingUntil: 0,
    pushed: false,
    sentOff: 0,
    rage: 0,
    subsUsed: 0,
    unavailable: new Set<number>(),
    broughtOn: new Set<number>(),
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
      { minute: 0, kind: "weather", weather },
    ],
    booked: new Map(),
    dismissed: new Set(),
  };
  const sides: Side[] = ["home", "away"];

  // The eleven actually ON THE PITCH, mutated by substitutions and dismissals. Scorers,
  // bookings and injuries all draw from here — before Phase 4 they drew from the fixed
  // starting XI, so a substituted player could still score.
  const squads: Record<Side, GamePlayer[]> = {
    home: [...setup.home.players],
    away: [...setup.away.players],
  };
  const benches: Record<Side, GamePlayer[]> = {
    home: [...(setup.home.bench ?? [])],
    away: [...(setup.away.bench ?? [])],
  };
  const subRate = SUBS_PER_SIDE / (SUB_WINDOW_END - SUB_WINDOW_START + 1);
  const injuryRate = INJURY_PER_SIDE / FULL_TIME;
  const keeperRate = KEEPER_SWEEP_PER_SIDE / FULL_TIME;

  /** Take a player off and bring one on. Returns false if the bench cannot cover it. */
  const substitute = (side: Side, minute: number, off: GamePlayer, reason: SubReason): boolean => {
    const st = state[side];
    if (st.subsUsed >= MAX_SUBS) return false;
    const availableIds = new Set(
      benches[side].filter((b) => !st.broughtOn.has(b.playerId)).map((b) => b.playerId),
    );
    const on = pickPlayerOn(benches[side], availableIds, off.role ?? null);
    if (on == null) return false;
    squads[side] = squads[side].filter((p) => p.playerId !== off.playerId);
    squads[side].push(on);
    st.broughtOn.add(on.playerId);
    st.unavailable.add(off.playerId);
    st.subsUsed += 1;
    state.events.push({
      minute,
      kind: "substitution",
      side,
      playerId: off.playerId,
      subOnPlayerId: on.playerId,
      subReason: reason,
    });
    return true;
  };

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
        const shooter = pickScorer(squads[side], rng);
        const outcome = resolveChance(rng());
        if (outcome === "goal") {
          // Rolled unconditionally so the PRNG stream does not depend on whether the
          // goal ends up assisted — the same discipline the set-piece rolls follow.
          const assistRoll = rng();
          const assister = pickAssister(squads[side], shooter?.playerId, rng);
          scoreGoal(state, side, opp, m, shooter?.playerId, "open", rng, referee, {
            goalStyle: goalStyleFor(shooter, rng()),
            assistPlayerId: assistRoll < ASSIST_SHARE ? assister?.playerId : undefined,
          });
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
        const taker = pickScorer(squads[side], rng);
        const outcome = resolvePenalty(penaltyBranch);
        const rebound = outcome === "saved-rebound-goal" ? pickScorer(squads[side], rng) : null;
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
        const taker = pickScorer(squads[side], rng);
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
      if (rng() < cardChance(mine.card) * cardBiasFor(referee, side) * slip) {
        const violent = rng() < RED_CARD_SHARE;
        showCard(state, squads[side], side, m, violent ? "violent-conduct" : "normal", rng);
      }

      // A professional foul on a clear breakaway: the DEFENDING side loses a man and
      // the attacking side gets the set piece. Both halves of the punishment.
      if (rng() < dogsoRate) {
        const victimSide = opp;
        showCard(state, squads[victimSide], victimSide, m, "dogso", rng);
        const inBox = rng() < 0.4;
        const taker = pickScorer(squads[side], rng);
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
          showCard(state, squads.home, "home", m, "altercation", rng);
          showCard(state, squads.away, "away", m, "altercation", rng);
        } else if (outcome === "red") {
          const guilty: Side = rng() < 0.5 ? "home" : "away";
          showCard(state, squads[guilty], guilty, m, "violent-conduct", rng, "red");
        }
      }

      // A defensive mix-up: the ball goes in off someone in the WRONG shirt, and the
      // goal is credited to the other side.
      if (rng() < ownGoalRate) {
        const backLine = squads[side].filter((pl) => pl.role !== "GK");
        const unlucky = backLine.length > 0 ? backLine[Math.floor(rng() * backLine.length)] : null;
        scoreGoal(state, opp, side, m, undefined, "own-goal", undefined, undefined, {
          ownGoalBy: unlucky?.playerId,
        });
      }

      // The home crowd turning on the visitors. Only ever the away side — it is the
      // HOME support, and a hostile atmosphere is exactly the thing a home crowd makes.
      if (side === "away" && rng() < crowdRate) {
        state.events.push({ minute: m, kind: "crowd", side: "away" });
        state.away.rage = Math.min(1, state.away.rage + 0.15);
      }

      // ---- squad dynamics ---------------------------------------------------
      if (m >= SUB_WINDOW_START && m <= SUB_WINDOW_END && rng() < subRate) {
        const bookedIds = new Set(
          squads[side]
            .filter((pl) => (state.booked.get(`${side}:${pl.playerId}`) ?? 0) > 0)
            .map((pl) => pl.playerId),
        );
        const diff = state[side].score - state[opp].score;
        const choice = pickPlayerOff(
          squads[side],
          bookedIds,
          diff === 0 ? "level" : diff < 0 ? "trailing" : "leading",
        );
        if (choice != null) substitute(side, m, choice.player, choice.reason);
      }

      if (rng() < injuryRate) {
        const severity = resolveInjury(rng());
        const hurtPool = squads[side].filter((pl) => pl.role !== "GK");
        const hurt = hurtPool.length > 0 ? hurtPool[Math.floor(rng() * hurtPool.length)] : null;
        if (hurt != null) {
          state.events.push({
            minute: m,
            kind: "injury",
            side,
            playerId: hurt.playerId,
            injurySeverity: severity,
          });
          if (severity === "knock") {
            // Treated on the touchline and carries on, but hurting.
            state[side].knockUntil = m + KNOCK_MINUTES;
          } else if (!substitute(side, m, hurt, "injury")) {
            // Nobody left on the bench — the side plays on a man short.
            squads[side] = squads[side].filter((pl) => pl.playerId !== hurt.playerId);
            state[side].sentOff += 1;
            state.events.push({
              minute: m,
              kind: "shorthanded",
              side,
              playerId: hurt.playerId,
            });
          }
        }
      }

      if (rng() < keeperRate) {
        const outcome = resolveKeeper(rng());
        const gk = squads[side].find((pl) => pl.role === "GK") ?? null;
        // ⚠️ Nothing is emitted without a keeper on the pitch. The event used to be
        // pushed BEFORE this check, so a side whose keeper had already gone off could
        // produce "the keeper is sent off" with no keeper and no card — a latent defect
        // that only surfaced when Phase 5 shifted the random stream.
        if (gk != null) {
          // The CARD IS SHOWN FIRST when the keeper charges out, because VAR can send the
          // referee to the monitor and he can come back unconvinced. Announcing "the
          // keeper is sent off" before knowing the verdict left the narration claiming a
          // dismissal that the card no longer matched.
          const shown =
            outcome === "sent-off"
              ? showCard(state, squads[side], side, m, "dogso", rng, "red")
              : null;
          const settled = outcome === "sent-off" && shown !== "red" ? "clearance" : outcome;
          state.events.push({
            minute: m,
            kind: "keeper",
            side,
            playerId: gk.playerId,
            keeperOutcome: settled,
          });
          if (settled === "sent-off") {
            // A foul outside the area concedes a free kick as well as the red — the same
            // both-halves punishment as an outfield DOGSO. Phase 3's invariant ("every
            // dogso card is paired with a set piece") caught this branch omitting it.
            const taker = pickScorer(squads[opp], rng);
            const fk = resolveFreeKick(rng());
            state.events.push({
              minute: m,
              kind: "freekick",
              side: opp,
              playerId: taker?.playerId,
              freeKickOutcome: fk,
            });
            if (fk === "scored") scoreGoal(state, opp, side, m, taker?.playerId, "freekick");
            // The backup keeper comes on — and if there is none, an outfielder goes in
            // goal and the side is simply worse for it.
            const outfield = squads[side].find((pl) => pl.role !== "GK");
            if (outfield != null) substitute(side, m, outfield, "injury");
          } else if (outcome === "punished") {
            const punisher = pickScorer(squads[opp], rng);
            // The keeper event above already told this story in full — describing it
            // again would read as two separate goals.
            scoreGoal(state, opp, side, m, punisher?.playerId, "open", undefined, undefined, {
              narrated: true,
            });
          }
        }
      }

      // A review that awards a penalty nobody saw.
      if (rng() < varPenaltyRate) {
        // A penalty shout goes to the screen, and he decides either way.
        state.events.push({ minute: m, kind: "var", side, varOutcome: "review-penalty" });
        if (rng() >= REF_AGREES_VAR) {
          state.events.push({ minute: m, kind: "var", side, varOutcome: "penalty-waved-away" });
        } else {
          state.events.push({ minute: m, kind: "var", side, varOutcome: "penalty-awarded" });
          noteBias(state, referee, side, m);
          const taker = pickScorer(squads[side], rng);
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
    }
    if (m === 45) state.events.push({ minute: 45, kind: "halftime" });
  }
  state.events.push({ minute: lastMinute, kind: "fulltime" });
  // A VAR verdict is emitted a minute after the goal it judges, so the tail of the list
  // can be out of order. Stable-sorted by minute — the view walks this list forwards.
  state.events = state.events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.minute - b.e.minute || a.i - b.i)
    .map(({ e }) => e);

  return {
    score: { home: state.home.score, away: state.away.score },
    events: state.events,
    seed: setup.seed,
  };
}

/** Kept for callers that reason about regulation time. */
export { FULL_TIME };
