import {
  type DecisionAnswer,
  type MatchDecision,
  type SubOfferDecision,
  defaultAnswer,
} from "@/features/game/domain/match-decisions";

/**
 * TASK-1810 — what the bench does with a decision nobody answered.
 *
 * Sits on top of the already-shipped `coach-policy.ts`, which decides WHETHER an offer
 * should open the dialog at all. This decides what happens to the ones that do not.
 */

/**
 * Whether an ignored offer resolves itself (owner ruling, 2026-08-18).
 *
 * `auto` — the clock keeps running, the Bench button glows amber, and after the limit the
 * engine executes its OWN recommendation.
 * `manual` — "Manual subs only". The timer is bypassed entirely and the window expires
 * with no change made; nothing is ever decided for the coach.
 */
export type SubMode = "auto" | "manual";

/**
 * The least disruptive answer: no change at all.
 *
 * ⚠️ Deliberately re-declared here rather than imported from `DecisionPrompt`. That
 * module is a `"use client"` component and this is a `view/` module the domain tests
 * import directly; reaching into a component for a pure function would drag React into
 * them. `DecisionPrompt.fallbackFor` stays the shipped path for the shipped screens.
 */
export function declineOf(d: MatchDecision): DecisionAnswer {
  const base = { minute: d.minute, side: d.side };
  if (d.kind === "response") return { kind: "response", ...base, choice: "hold" };
  if (d.kind === "injury-sub") return { kind: "injury-sub", ...base, on: undefined };
  if (d.kind === "dismissal") return { kind: "dismissal", ...base };
  return { kind: "sub-offer", ...base };
}

/**
 * What an offer the coach did not answer becomes.
 *
 * ⛔ There is no "leave it pending". EVERY decision the engine raises must be answered or
 * the generator hangs, so both modes return an answer — they differ only in what it says.
 *
 * ⚠️ `auto` uses `defaultAnswer`, NOT the decline. The shipped `fallbackFor` in
 * `DecisionPrompt` answers a lapsed sub-offer with no `off`, i.e. it DECLINES; the owner
 * asked for the engine to execute its own recommendation, and `defaultAnswer` is the one
 * that takes `suggestedOff` when `engineSuggests` is true. Getting these two the wrong way
 * round silently disables every automatic substitution in the game.
 */
export function answerFor(d: MatchDecision, mode: SubMode): DecisionAnswer {
  return mode === "manual" ? declineOf(d) : defaultAnswer(d);
}

/**
 * What the Bench button should read.
 *
 * `available` turns it amber. ⛔ Nothing else changes on screen — no panel appears until
 * the coach presses it. That is the entire point of the redesign.
 */
export function benchLabel(pending: SubOfferDecision | null): "idle" | "available" {
  return pending?.engineSuggests === true ? "available" : "idle";
}

/** The pending decision, if it is a substitution offer this bench can act on. */
export function subOfferOf(d: MatchDecision | null): SubOfferDecision | null {
  return d != null && d.kind === "sub-offer" ? d : null;
}
