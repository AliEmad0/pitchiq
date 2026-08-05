import type { GameTeam } from "./team";

export type Side = "home" | "away";
export type MatchEventKind = "kickoff" | "goal" | "card" | "halftime" | "fulltime";

export interface MatchEvent {
  minute: number;
  kind: MatchEventKind;
  side?: Side; // goal / card
  playerId?: number; // scorer / booked
  card?: "yellow" | "red";
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
  momentum: number; // -1..1
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
