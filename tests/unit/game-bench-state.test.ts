import { describe, expect, it } from "vitest";
import type { SubOfferDecision } from "@/features/game/domain/match-decisions";
import { encodeTokens } from "@/features/game/domain/decision-tokens";
import { answerFor, benchLabel, declineOf, subOfferOf } from "@/features/game/view/bench-state";

import { matchSetup } from "./_helpers/match-setup";

const team = matchSetup(7).home;
const offer = (minute: number, suggests: boolean): SubOfferDecision => ({
  kind: "sub-offer",
  minute,
  side: "home",
  events: [],
  stoppage: false,
  engineSuggests: suggests,
  suggestedOff: team.players[3]!.playerId,
  suggestedReason: "tactical",
  legalOff: team.players,
  legalOn: team.bench!,
});

describe("answerFor", () => {
  it("auto mode executes the engine's own recommendation", () => {
    // The owner's ruling: ignore the amber button for 20s and the change is made for you.
    const a = answerFor(offer(60, true), "auto");
    expect(a.kind).toBe("sub-offer");
    expect((a as { off?: number }).off).toBe(team.players[3]!.playerId);
  });

  it("⛔ manual mode NEVER substitutes for you", () => {
    // "Manual subs only" — the window expires with no change made.
    expect((answerFor(offer(60, true), "manual") as { off?: number }).off).toBeUndefined();
  });

  it("declines in either mode when the engine is not suggesting anything", () => {
    for (const mode of ["auto", "manual"] as const) {
      expect((answerFor(offer(60, false), mode) as { off?: number }).off).toBeUndefined();
    }
  });

  it("⛔ ALWAYS answers — an unanswered decision hangs the generator", () => {
    // There is no "leave it pending". Both modes must produce a real answer carrying the
    // decision's own minute and side, or the match stops dead.
    for (const mode of ["auto", "manual"] as const) {
      expect(answerFor(offer(73, false), mode)).toMatchObject({ minute: 73, side: "home" });
    }
  });
});

describe("declineOf", () => {
  it("is the least disruptive answer for every decision kind", () => {
    const base = { minute: 40, side: "home" as const, events: [] };
    expect(declineOf({ ...base, kind: "response", concededBy: "away" })).toMatchObject({
      choice: "hold",
    });
    expect(declineOf({ ...base, kind: "injury-sub", off: 2, legalOn: [] })).toMatchObject({
      on: undefined,
    });
    expect(
      declineOf({
        ...base,
        kind: "dismissal",
        legalOff: [],
        legalOn: [],
        keeperGone: false,
        emergencyKeepers: [],
      }),
    ).toMatchObject({
      kind: "dismissal",
    });
    expect((declineOf(offer(40, true)) as { off?: number }).off).toBeUndefined();
  });
});

describe("⛔ the answer must be ENCODABLE into a share code", () => {
  it("auto mode carries no `reason`", () => {
    /**
     * `defaultAnswer` attaches a `reason` whenever the engine suggested the change, and
     * `encodeTokens` THROWS on one — "a sub `reason` cannot be carried by a share code".
     *
     * That crashed the full-time screen of every Legacy match that made an automatic
     * substitution, and it took a real browser to find because the crash is in
     * `buildShareCode`, three components away from the bench.
     */
    const a = answerFor(offer(60, true), "auto");
    expect(a).not.toHaveProperty("reason");
    expect((a as { off?: number }).off).toBe(team.players[3]!.playerId); // the change itself is untouched
  });

  it("every mode produces a stream encodeTokens accepts", () => {
    const answers = [
      answerFor(offer(60, true), "auto"),
      answerFor(offer(61, false), "auto"),
      answerFor(offer(62, true), "manual"),
    ];
    expect(() => encodeTokens(answers)).not.toThrow();
  });
});

describe("benchLabel", () => {
  it("reads 'Change available' only while one actually is", () => {
    expect(benchLabel(offer(60, true))).toBe("available");
    expect(benchLabel(offer(60, false))).toBe("idle");
    expect(benchLabel(null)).toBe("idle");
  });
});

describe("subOfferOf", () => {
  it("recognises a sub offer and ignores every other decision kind", () => {
    expect(subOfferOf(offer(60, true))).not.toBeNull();
    expect(subOfferOf(null)).toBeNull();
    expect(
      subOfferOf({ kind: "response", minute: 5, side: "home", events: [], concededBy: "away" }),
    ).toBeNull();
  });
});

it("an engine roll cannot advertise a substitution with no legal replacement or outgoing player", () => {
  expect(benchLabel({ ...offer(77, true), legalOn: [] })).toBe("idle");
  expect(benchLabel({ ...offer(77, true), legalOff: [] })).toBe("idle");
  expect(benchLabel(offer(77, true))).toBe("available");
});
