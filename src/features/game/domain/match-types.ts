import type { SubstitutionRules } from "./substitution-rules";
import type { GameTeam } from "./team";

export type Side = "home" | "away";

/**
 * TASK-1822 Phase 1 extends this beyond goal/card. Later phases add penalties, VAR,
 * substitutions, injuries and altercations — every one of them is "an event with a
 * branching outcome and a commentary key", which is why the taxonomy is the spine.
 */
export type MatchEventKind =
  | "kickoff"
  | "goal"
  | "card"
  | "halftime"
  | "fulltime"
  | "chance" // a shot that did NOT go in — the match's connective tissue
  | "stoppage" // added time announced
  | "push" // a trailing side throws everyone forward
  | "penalty" // awarded AND resolved in one event
  | "freekick" // a direct free kick from a dangerous area
  | "var" // a video review, and what it decided
  | "altercation" // players squaring up
  | "referee" // who is officiating, and how they call it
  | "bias" // a contentious decision, noted
  | "substitution" // one off, one on
  | "injury" // knock / moderate / severe
  | "keeper" // the goalkeeper leaves his line
  | "shorthanded" // a player lost with nobody left to replace him
  | "weather" // the conditions, set at kick-off
  | "crowd" // the home support turns on the visitors
  | "crisis"; // TASK-1814 follow-up — a tiring man, and the coach's call on him

/** How an open-play goal was actually scored. Set-piece goals carry their own words. */
export type GoalStyle =
  | "header"
  | "counter"
  | "chip"
  | "trivela"
  | "tap-in"
  | "long-range"
  | "volley";

export type Weather = "clear" | "rain" | "heavy-rain" | "wind" | "snow";

export type SubReason = "stamina" | "tactical" | "discipline" | "injury";

/**
 * A knock is treated and the player carries on; moderate and severe both force him
 * off, the difference being how quickly and how it looks.
 */
export type InjurySeverity = "knock" | "moderate" | "severe";

export type KeeperOutcome =
  | "clearance" // races out and heads it clear
  | "sent-off" // wipes out the striker outside the box
  | "punished"; // slices the clearance to an opponent, who finds the empty net

/** Why a card was shown. `second-yellow` and `dogso` are always red. */
export type CardReason = "normal" | "second-yellow" | "dogso" | "violent-conduct" | "altercation";

/**
 * What a review decided. A disallowed goal never emits a `goal` event at all — that is
 * what keeps "the scoreline equals the count of goal events" true.
 */
/**
 * A VAR sequence is now THREE beats, not one.
 *
 * The old model deleted a disallowed goal outright — it never emitted the `goal` event
 * at all — so a viewer saw a review with no idea what was being reviewed. Owner's call:
 * **the goal is given in full first**, VAR then tells the referee they doubt it, and the
 * referee decides. He does not always agree.
 *
 *   `review-*`  the check has begun and play has stopped
 *   `*-stands` / `*-overturned`  the on-field referee's decision
 */
export type VarOutcome =
  // the check
  | "review-goal"
  | "review-penalty"
  | "review-red"
  // the decision
  | "goal-disallowed-offside"
  | "goal-disallowed-foul"
  | "goal-stands"
  | "penalty-awarded"
  | "penalty-waved-away"
  /** The booth spotted violent conduct the referee missed — a booking becomes a red. */
  | "red-upgraded"
  /** He went to the monitor about a red already shown, and stood by it. */
  | "red-confirmed"
  /** He went to the monitor and came back unconvinced — a booking, not a dismissal. */
  | "red-not-given";

export type AltercationOutcome = "words" | "both-booked" | "red";

export type RefereeStyle = "strict" | "lenient" | "crowd-influenced";

/** How a chance that wasn't a goal actually ended. */
export type ChanceOutcome = "saved" | "blocked" | "wide" | "post" | "crossbar";

/**
 * The nine endings of a penalty.
 *
 * `saved-rebound-goal` is the one that matters structurally: the keeper saves it and
 * the ball still ends up in the net, so a "saved" outcome must still produce a goal.
 */
export type PenaltyOutcome =
  | "scored-top-corner"
  | "scored-placed"
  | "scored-panenka"
  | "saved-corner" // parried behind
  | "saved-held" // keeper holds it
  | "saved-rebound-goal" // parried — and someone follows it in
  | "post"
  | "crossbar"
  | "wide";

export type FreeKickOutcome = "scored" | "saved" | "wall" | "wide";

/**
 * Where a goal came from. Set on every `goal` event so a scoreline can always be
 * attributed — without it, a missed penalty and an open-play goal in the same minute
 * are indistinguishable. Phase 5's goal descriptions build on this.
 */
export type GoalSource = "open" | "penalty" | "freekick" | "own-goal";

export interface MatchEvent {
  minute: number;
  kind: MatchEventKind;
  side?: Side; // goal / card / chance / push
  playerId?: number; // scorer / booked / shooter
  card?: "yellow" | "red";
  outcome?: ChanceOutcome; // chance
  addedMinutes?: number; // stoppage
  source?: GoalSource; // goal
  /**
   * Who created the goal. Open play only — a penalty is not assisted, and nobody
   * "assists" an own goal.
   */
  assistPlayerId?: number;
  /**
   * The minute a given goal was chalked off after review — not a boolean, deliberately.
   *
   * The goal STAYS in the timeline and **counts on the scoreboard until this minute
   * arrives**. That is where the suspense lives: the crowd celebrates, the score ticks
   * up, the referee walks to the monitor, and only then does it come back off. A boolean
   * would let the view know the verdict the instant the goal was scored and the drama
   * would be gone before it started.
   *
   * ⚠️ A final scoreline filters on `disallowedAt == null`; a scoreline AT minute `m`
   * filters on `disallowedAt == null || disallowedAt > m`.
   */
  disallowedAt?: number;
  penaltyOutcome?: PenaltyOutcome; // penalty
  freeKickOutcome?: FreeKickOutcome; // freekick
  /** The player who followed in a parried penalty. */
  reboundPlayerId?: number;
  reason?: CardReason; // card
  varOutcome?: VarOutcome; // var
  altercationOutcome?: AltercationOutcome; // altercation
  refStyle?: RefereeStyle; // referee
  /** Substitution: `playerId` comes OFF, this one comes ON. */
  subOnPlayerId?: number;
  subReason?: SubReason;
  injurySeverity?: InjurySeverity;
  /** `crisis`: what the coach decided about the tiring man. */
  crisisChoice?: CrisisChoice;
  keeperOutcome?: KeeperOutcome;
  goalStyle?: GoalStyle; // open-play goal
  /**
   * The player who put it into his OWN net. He belongs to the side that CONCEDED, so
   * `playerId` is deliberately left unset — nobody on the scoring side touched it, and
   * crediting him there would put an own goal on a striker's tally.
   */
  ownGoalBy?: number;
  weather?: Weather;
  /**
   * An earlier event in the same minute already told this goal's story (the keeper
   * blunder that gifted it, for instance), so the goal line renders as a terse
   * scoreline. Same reasoning as set-piece goals — describing it twice reads as two
   * separate goals.
   */
  narrated?: boolean;
}

/** 0–100 aggregate team strength. TASK-1805 extends this to the "record" opponent. */
export interface TeamPower {
  attack: number;
  defense: number;
  aggression: number;
}

export interface MinuteWeights {
  attack: number;
  defense: number;
  foul: number;
  card: number;
}

export interface SideState {
  power: TeamPower;
  score: number;
  stamina: number; // 1 → decays
  /**
   * Attacking urgency, 0–1. NOT "who is winning": conceding raises it (the response
   * window), scoring raises it only slightly. Before TASK-1822 this ran the other way
   * and produced a rich-get-richer loop.
   */
  momentum: number;
  /** Minute the conceding-side response window expires. */
  respondingUntil: number;
  /**
   * How the coach chose to respond to the last goal conceded.
   *
   * Read by `responseModifier`. `hold` is the default and contributes nothing, so an
   * un-coached match behaves exactly as it did before the engine became interruptible.
   */
  responseChoice?: "overload" | "stabilize" | "hold";
  /** Has the late all-out-attack push already been announced for this side? */
  pushed: boolean;
  /**
   * Players missing from the eleven, for ANY reason — sent off, or injured with an
   * empty bench. Both leave a side short, so both feed `sentOffModifier`.
   */
  sentOff: number;
  /** Players brought on so far. Capped at `MAX_SUBS`. */
  subsUsed: number;
  /** Ids currently unavailable (off injured, substituted, or dismissed). */
  unavailable: Set<number>;
  /** Ids on the pitch who came off the bench — they cannot be brought on twice. */
  broughtOn: Set<number>;
  /** Minute a knock's debuff expires. A treated player carries on, but hurting. */
  knockUntil?: number;
  /** The tiring man the coach pushed on with (`crisis`), while he is still on the pitch. */
  crisisPush?: number;
  /** The coach rested his tiring man (`crisis`): fresh legs for the rest of the match. */
  crisisRested?: boolean;
  /**
   * Sense of injustice, 0–1. Raised when the referee's bias goes against this side;
   * drives BOTH a fired-up response and reckless tackling, which is how a wronged team
   * actually behaves.
   */
  rage: number;
}

export interface MatchState {
  minute: number;
  /** TASK-1828 — `MatchSetup.conditions.varScale`; absent = 1. */
  varScale?: number;
  home: SideState;
  away: SideState;
  events: MatchEvent[];
  /**
   * Yellow cards per player — a second one is a red.
   *
   * ⚠️ Keyed `"side:playerId"`, NOT by player id. Both Chaos teams draft from the same
   * pool with independent `used` sets, so the SAME player id can legitimately turn out
   * for both sides in one match; a plain id key would let a booking leak across the
   * halfway line and send off a player who had never been cautioned.
   */
  booked: Map<string, number>;
  /** Players already sent off, same `"side:playerId"` keying. */
  dismissed: Set<string>;
}

export interface MinuteContext {
  state: MatchState;
  side: Side;
}

/** A pure weight contributor. The seeded PRNG still rolls outcomes → deterministic. */
export type Modifier = (ctx: MinuteContext) => Partial<MinuteWeights>;

export interface MatchSetup {
  /** Explicit competition policy; omitted preserves existing cross-era match behavior. */
  substitutions?: SubstitutionRules;
  home: GameTeam;
  away: GameTeam;
  seed: number;
  targetGoalsPerMatch: number; // season-authentic, from the adapter
  modifiers?: Modifier[]; // layered after the baseline set
  /** Override a side's power (a record-based opponent has no XI to aggregate). */
  homePower?: TeamPower;
  awayPower?: TeamPower;
  /**
   * TASK-1816 — start part-way through a REAL match.
   *
   * `priorEvents` are the real goals and red cards up to `minute`; the starting score and
   * the dismissed players are DERIVED from them, so the scoreboard, the event list and
   * every view that counts goal events agree by construction. `subsUsed` is the real
   * substitutions already made. At `minute + 1` the engine raises a team talk — a
   * response for `teamTalk`, then a half-time-style sub-offer for both sides — before any
   * play. ⛔ Absent = the engine is byte-identical to before (golden-pinned).
   */
  startState?: {
    minute: number;
    priorEvents: MatchEvent[];
    subsUsed: { home: number; away: number };
    teamTalk: Side;
  };
  /**
   * TASK-1828 — the weekly ladder's ruleset: force the weather, the referee, or scale how often
   * VAR reviews. ⛔ The forced draws still CONSUME their random numbers, so the rest of the match
   * keeps the same stream. Absent = byte-identical to before (golden-pinned).
   */
  conditions?: MatchConditions;
  /**
   * The mid-match crisis prompt: once per side, between 70' and 78', the side's least-fit
   * outfielder is flagged and the coach decides — push on or take him off. ⛔ Its timing and risk
   * come from a SEPARATE seeded stream, so the main stream is untouched; absent = byte-identical.
   */
  crisis?: boolean;
}

export type CrisisChoice = "push" | "rest";

export interface MatchConditions {
  weather?: Weather;
  referee?: RefereeStyle;
  /** Multiplier on both VAR review chances (goal and red). */
  varScale?: number;
}

export interface MatchResult {
  score: { home: number; away: number };
  events: MatchEvent[];
  seed: number;
}
