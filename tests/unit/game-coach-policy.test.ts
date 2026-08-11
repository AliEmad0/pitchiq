import { describe, expect, it } from "vitest";
import type { SubOfferDecision } from "@/features/game/domain/match-decisions";
import { REQUEST_GRACE } from "@/features/game/domain/match-decisions";
import {
  createCoachState,
  requestSubstitution,
  shouldOpenPrompt,
  spendRequest,
} from "@/features/game/view/coach-policy";

const offer = (minute: number, stoppage: boolean): SubOfferDecision => ({
  kind: "sub-offer",
  minute,
  side: "home",
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
