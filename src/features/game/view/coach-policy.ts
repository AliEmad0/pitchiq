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

/**
 * A standing request that nothing can honour any more (owner-reported, 2026-08-20).
 *
 * ⛔ THE BUG THIS EXISTS FOR. `shouldOpenPrompt` is only ever consulted against a
 * `sub-offer`, and the engine raises those ONLY between `SUB_WINDOW_START` (55') and
 * `SUB_WINDOW_END` (85'). So a request made after 85' — or any request still standing when
 * the whistle goes — could never be answered by anything, because nothing would ever be
 * raised again. The Bench button is disabled while a request stands, so the coach was
 * locked out of his own bench for the rest of the match and the label read "Waiting for a
 * break in play" all the way past full time.
 *
 * ⚠️ `hasOffer` is load-bearing, not a convenience. The grace bound is what makes BOTH
 * rules fire, so they race on the same minute: without this guard a request would be
 * thrown away on the very tick that was about to honour it, and pressing Bench then
 * waiting exactly the grace period would evaporate the request instead of opening it.
 *
 * ⚠️ Strictly AFTER the grace, so `shouldOpenPrompt`'s inclusive bound always gets its turn
 * first even if an offer appears late in the same minute.
 */
export function requestLapsed(
  st: CoachState,
  minute: number,
  ctx: { finished: boolean; hasOffer: boolean },
): boolean {
  if (st.requestedAt == null) return false;
  if (ctx.finished) return true;
  if (ctx.hasOffer) return false;
  return minute > st.requestedAt + REQUEST_GRACE;
}
