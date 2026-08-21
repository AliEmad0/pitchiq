import { describe, expect, it } from "vitest";
import type { SubOfferDecision } from "@/features/game/domain/match-decisions";
import { REQUEST_GRACE } from "@/features/game/domain/match-decisions";
import {
  createCoachState,
  requestLapsed,
  requestSubstitution,
  shouldOpenPrompt,
  spendRequest,
} from "@/features/game/view/coach-policy";

const offer = (minute: number, stoppage: boolean): SubOfferDecision => ({
  kind: "sub-offer",
  minute,
  side: "home",
  events: [],
  stoppage,
  engineSuggests: false,
  legalOff: [],
  legalOn: [],
});

describe("coach policy", () => {
  it("does not open a prompt when nothing was requested", () => {
    expect(shouldOpenPrompt(createCoachState(), offer(60, true))).toBe(false);
  });

  it("does not open on the request minute itself while play is live", () => {
    const st = requestSubstitution(createCoachState(), 60);
    expect(shouldOpenPrompt(st, offer(60, false))).toBe(false);
  });

  it("opens at the next stoppage after a request", () => {
    const st = requestSubstitution(createCoachState(), 60);
    expect(shouldOpenPrompt(st, offer(61, false))).toBe(false);
    expect(shouldOpenPrompt(st, offer(62, true))).toBe(true);
  });

  it("opens anyway once the grace period expires with no stoppage", () => {
    // Otherwise a request can sit unanswered for a quarter of an hour, which the coach
    // experiences as a broken button.
    const st = requestSubstitution(createCoachState(), 60);
    for (let m = 61; m < 60 + REQUEST_GRACE; m++) {
      expect(shouldOpenPrompt(st, offer(m, false))).toBe(false);
    }
    expect(shouldOpenPrompt(st, offer(60 + REQUEST_GRACE, false))).toBe(true);
  });

  it("a spent request cannot re-open the prompt", () => {
    let st = requestSubstitution(createCoachState(), 60);
    expect(shouldOpenPrompt(st, offer(62, true))).toBe(true);
    st = spendRequest();
    expect(shouldOpenPrompt(st, offer(63, true))).toBe(false);
  });

  it("cancelling spends the opportunity exactly as substituting does", () => {
    // Owner decision: making the change OR cancelling both consume it, so the prompt
    // cannot be re-opened to shop around within one window.
    let st = requestSubstitution(createCoachState(), 60);
    st = spendRequest();
    expect(shouldOpenPrompt(st, offer(61, true))).toBe(false);
    // A fresh request is a new opportunity, and works normally.
    st = requestSubstitution(st, 64);
    expect(shouldOpenPrompt(st, offer(65, true))).toBe(true);
  });
});

/**
 * ⛔ OWNER-REPORTED, 2026-08-20, and the worst bug of the round: he pressed Bench, the
 * button read "Waiting for a break in play" — and it never opened, through two goals and
 * then past the final whistle, still reading "waiting".
 *
 * The cause is structural, not a stoppage-detection miss. `shouldOpenPrompt` is only ever
 * consulted against a `sub-offer`, and the engine raises those ONLY between
 * `SUB_WINDOW_START` (55') and `SUB_WINDOW_END` (85'). A request made after 85' — or any
 * request still standing when the whistle goes — can never be answered by anything,
 * because nothing will ever be raised again. The Bench button is `disabled` while a
 * request stands, so the coach was locked out of his own bench for the rest of the match.
 *
 * ⚠️ `shouldOpenPrompt` is NOT wrong and is unchanged. What was missing is the other half
 * of the rule: when a request can no longer be honoured, it has to LAPSE.
 */
describe("coach policy — a request that nothing can honour", () => {
  it("lapses once the whistle has gone", () => {
    const st = requestSubstitution(createCoachState(), 88);
    expect(requestLapsed(st, 95, { finished: true, hasOffer: false })).toBe(true);
  });

  it("lapses when the grace passes with no offer in sight", () => {
    // After 85' the engine raises no more sub-offers at all, so waiting is waiting forever.
    const st = requestSubstitution(createCoachState(), 86);
    expect(requestLapsed(st, 86 + REQUEST_GRACE, { finished: false, hasOffer: false })).toBe(false);
    expect(requestLapsed(st, 87 + REQUEST_GRACE, { finished: false, hasOffer: false })).toBe(true);
  });

  it("⛔ never lapses while an offer is live — `shouldOpenPrompt` owns that decision", () => {
    /**
     * The grace bound is what makes BOTH rules fire, so they race on the same minute. If
     * lapsing won, a request would be thrown away on the very tick that was about to
     * honour it — the coach would press Bench, wait exactly the grace period, and watch
     * his request evaporate instead of opening.
     */
    /**
     * ⚠️ Verified by sabotage, and the FIRST version of this test was vacuous. It used
     * `requestedAt + REQUEST_GRACE` exactly — where the lapse rule returns false anyway,
     * because its bound is strict — so it stayed green with the guard deleted. The minute
     * has to be one the lapse rule would otherwise claim.
     */
    const st = requestSubstitution(createCoachState(), 60);
    const minute = 60 + REQUEST_GRACE + 2;
    expect(shouldOpenPrompt(st, offer(minute, false))).toBe(true);
    expect(requestLapsed(st, minute, { finished: false, hasOffer: false })).toBe(true);
    expect(requestLapsed(st, minute, { finished: false, hasOffer: true })).toBe(false);
  });

  it("has nothing to lapse when he never asked", () => {
    expect(requestLapsed(createCoachState(), 90, { finished: true, hasOffer: false })).toBe(false);
  });
});
