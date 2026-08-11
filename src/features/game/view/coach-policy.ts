import { REQUEST_GRACE, type SubOfferDecision } from "@/features/game/domain/match-decisions";

/**
 * The coach's pending-request state.
 *
 * Lives in `view/` on purpose. The engine offers a substitution every minute of the
 * window and knows nothing about buttons or clocks; deciding whether to ACT on an offer
 * is a view concern. Keeping it here means the rules are testable without React, and it
 * keeps the determinism story clean — the engine never learns that a human was involved.
 */
export interface CoachState {
  /** Minute the coach asked for a change, or null if he has not. */
  requestedAt: number | null;
}

export const createCoachState = (): CoachState => ({ requestedAt: null });

export const requestSubstitution = (_st: CoachState, minute: number): CoachState => ({
  requestedAt: minute,
});

/**
 * Making the change and cancelling both consume the opportunity (owner decision), so the
 * prompt cannot be re-opened repeatedly to shop around within one window.
 */
export const spendRequest = (): CoachState => ({ requestedAt: null });

/**
 * Should this offer open the prompt?
 *
 * A request opens at the next stoppage. If none arrives within `REQUEST_GRACE` minutes
 * it opens anyway — the engine emits no ball-out-of-play event, so there is no guarantee
 * a stoppage lands in any given span, and without the bound a request can sit unanswered
 * long enough that the button looks broken.
 */
export function shouldOpenPrompt(st: CoachState, d: SubOfferDecision): boolean {
  if (st.requestedAt == null) return false;
  if (d.minute <= st.requestedAt) return false;
  if (d.stoppage) return true;
  return d.minute >= st.requestedAt + REQUEST_GRACE;
}
