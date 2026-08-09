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
  | "freekick"; // a direct free kick from a dangerous area

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
export type GoalSource = "open" | "penalty" | "freekick";

export interface MatchEvent {
  minute: number;
  kind: MatchEventKind;
  side?: Side; // goal / card / chance / push
  playerId?: number; // scorer / booked / shooter
  card?: "yellow" | "red";
  outcome?: ChanceOutcome; // chance
  addedMinutes?: number; // stoppage
  source?: GoalSource; // goal
  penaltyOutcome?: PenaltyOutcome; // penalty
  freeKickOutcome?: FreeKickOutcome; // freekick
  /** The player who followed in a parried penalty. */
  reboundPlayerId?: number;
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
  /** Has the late all-out-attack push already been announced for this side? */
  pushed: boolean;
}

export interface MatchState {
  minute: number;
  home: SideState;
  away: SideState;
  events: MatchEvent[];
}

export interface MinuteContext {
  state: MatchState;
  side: Side;
}

/** A pure weight contributor. The seeded PRNG still rolls outcomes → deterministic. */
export type Modifier = (ctx: MinuteContext) => Partial<MinuteWeights>;

export interface MatchSetup {
  home: GameTeam;
  away: GameTeam;
  seed: number;
  targetGoalsPerMatch: number; // season-authentic, from the adapter
  modifiers?: Modifier[]; // layered after the baseline set
  /** Override a side's power (a record-based opponent has no XI to aggregate). */
  homePower?: TeamPower;
  awayPower?: TeamPower;
}

export interface MatchResult {
  score: { home: number; away: number };
  events: MatchEvent[];
  seed: number;
}
