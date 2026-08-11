import type { MatchEventKind, Side, SubReason } from "./match-types";
import type { GamePlayer } from "./player";

/**
 * The events during which play is genuinely dead.
 *
 * ⚠️ The engine has NO ball-out-of-play event — `MatchEventKind` models consequential
 * events only, so there is no throw-in, goal kick or corner to wait for. "The next
 * stoppage" therefore has to be defined over what the engine actually emits.
 */
export const STOPPAGE_KINDS: ReadonlySet<MatchEventKind> = new Set<MatchEventKind>([
  "goal",
  "card",
  "penalty",
  "freekick",
  "injury",
  "var",
  "altercation",
  "substitution",
  "halftime",
]);

/**
 * Minutes a requested substitution waits for a stoppage before opening anyway.
 *
 * Without a bound a request can sit unanswered for a quarter of an hour, which the coach
 * experiences as a broken button. Halftime is always a stoppage, so this exists for the
 * second half.
 */
export const REQUEST_GRACE = 5;

export type ResponseChoice = "overload" | "stabilize" | "hold";

interface DecisionBase {
  minute: number;
  side: Side;
}

/**
 * Raised every minute of the substitution window, for both sides.
 *
 * `engineSuggests` carries the result of the engine's own `rng() < subRate` roll. The
 * roll still happens exactly when and where it always did; a coach-driven match simply
 * ignores the answer. Removing or gating it would shift every subsequent roll.
 */
export interface SubOfferDecision extends DecisionBase {
  kind: "sub-offer";
  /** Did a stoppage-kind event already land this minute? */
  stoppage: boolean;
  engineSuggests: boolean;
  /** Who the engine would take off. Computed unconditionally — `pickPlayerOff` is rng-free. */
  suggestedOff?: number;
  suggestedReason?: SubReason;
  legalOff: GamePlayer[];
  legalOn: GamePlayer[];
}

export interface ResponseDecision extends DecisionBase {
  kind: "response";
  /** The side that just conceded — the one the window lifts. */
  concededBy: Side;
}

export interface InjurySubDecision extends DecisionBase {
  kind: "injury-sub";
  /** Who is going off. Not a choice — he cannot continue. */
  off: number;
  legalOn: GamePlayer[];
}

export interface DismissalDecision extends DecisionBase {
  kind: "dismissal";
  legalOff: GamePlayer[];
  legalOn: GamePlayer[];
}

export type MatchDecision =
  | SubOfferDecision
  | ResponseDecision
  | InjurySubDecision
  | DismissalDecision;

export type DecisionKind = MatchDecision["kind"];

interface AnswerBase {
  minute: number;
  side: Side;
}

/** `off` absent = no change. `on` absent = let the engine pick the replacement. */
export interface SubAnswer extends AnswerBase {
  kind: "sub-offer";
  off?: number;
  on?: number;
  reason?: SubReason;
}
export interface ResponseAnswer extends AnswerBase {
  kind: "response";
  choice: ResponseChoice;
}
export interface InjurySubAnswer extends AnswerBase {
  kind: "injury-sub";
  on?: number;
}
export interface DismissalAnswer extends AnswerBase {
  kind: "dismissal";
  off?: number;
  on?: number;
}

export type DecisionAnswer = SubAnswer | ResponseAnswer | InjurySubAnswer | DismissalAnswer;

/**
 * How the engine answers when nobody is coaching — i.e. exactly what it does today.
 *
 * `simulate()` drives the generator with this, which is why the existing determinism
 * snapshots must not move.
 */
export function defaultAnswer(d: MatchDecision): DecisionAnswer {
  switch (d.kind) {
    case "sub-offer":
      return {
        kind: "sub-offer",
        minute: d.minute,
        side: d.side,
        off: d.engineSuggests ? d.suggestedOff : undefined,
        on: undefined,
        reason: d.engineSuggests ? d.suggestedReason : undefined,
      };
    case "response":
      return { kind: "response", minute: d.minute, side: d.side, choice: "hold" };
    case "injury-sub":
      return { kind: "injury-sub", minute: d.minute, side: d.side, on: undefined };
    case "dismissal":
      return { kind: "dismissal", minute: d.minute, side: d.side, off: undefined, on: undefined };
  }
}
