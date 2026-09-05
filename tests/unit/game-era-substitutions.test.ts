import { describe, expect, it } from "vitest";
import {
  premierLeagueSubstitutions as rulesFor,
  substitutionAllowed,
} from "@/features/game/domain/substitution-rules";
import { drive, runMatch, simulate } from "@/features/game/domain/simulate";
import {
  defaultAnswer,
  type MatchDecision,
  type DecisionAnswer,
} from "@/features/game/domain/match-decisions";
import { answerFor } from "@/features/game/view/bench-state";
import { matchSetup } from "./_helpers/match-setup";

it.each([
  [1992, "1992-08-15", 2, undefined],
  [1993, "1994-05-01", 2, undefined],
  [1994, "1994-08-20", 3, undefined],
  [1995, "1995-08-19", 3, undefined],
  [2019, "2020-03-09", 3, undefined],
  [2019, "2020-06-17", 5, 3],
  [2020, "2020-09-12", 3, undefined],
  [2021, "2022-05-22", 3, undefined],
  [2022, "2022-08-05", 5, 3],
  [2025, "2026-05-01", 5, 3],
])("resolves season %i fixture %s", (season, date, maxSubs, maxWindows) => {
  const rules = rulesFor(season as number, date as string);
  expect(rules.maxSubs).toBe(maxSubs);
  expect(rules.maxWindows).toBe(maxWindows);
});
it("reserves the 1994/95 third change for the keeper, regardless of change order", () => {
  const rules = rulesFor(1994, "1995-01-01");
  const used = { used: 2, keeperChanges: 0, windows: new Set([55, 60]) };
  expect(substitutionAllowed(rules, used, 65)).toBe(false);
  expect(substitutionAllowed(rules, used, 65, true)).toBe(true);
  expect(substitutionAllowed(rules, { ...used, keeperChanges: 1 }, 65)).toBe(true);
  expect(substitutionAllowed(rules, { ...used, used: 3, keeperChanges: 1 }, 65, true)).toBe(false);
});
it("counts accepted changes by stoppage and exempts half-time, but never the player cap", () => {
  const rules = rulesFor(2022, "2022-08-05");
  const used = { used: 3, keeperChanges: 0, windows: new Set([55, 60, 65]) };
  expect(substitutionAllowed(rules, used, 66)).toBe(false);
  expect(substitutionAllowed(rules, used, 65)).toBe(true);
  expect(substitutionAllowed(rules, used, 45)).toBe(true);
  expect(substitutionAllowed(rules, { ...used, used: 5 }, 45)).toBe(false);
});
function eager(d: MatchDecision): DecisionAnswer {
  if (d.kind !== "sub-offer") return defaultAnswer(d);
  return {
    ...defaultAnswer(d),
    kind: "sub-offer",
    off: d.legalOff.find((p) => p.role !== "GK")?.playerId,
  };
}
describe("real engine enforcement", () => {
  it.each([2, 3, 5])(
    "caps both sides at %i even when the policy repeatedly requests changes",
    (maxSubs) => {
      let reached = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const result = drive(runMatch({ ...matchSetup(seed), substitutions: { maxSubs } }), eager);
        for (const side of ["home", "away"]) {
          const subs = result.events.filter((e) => e.kind === "substitution" && e.side === side);
          expect(subs.length).toBeLessThanOrEqual(maxSubs);
          if (subs.length === maxSubs) reached++;
        }
      }
      expect(reached).toBeGreaterThan(0);
    },
  );
  it("blocks a fourth stoppage with players still unused", () => {
    let exhausted = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const result = drive(
        runMatch({ ...matchSetup(seed), substitutions: { maxSubs: 5, maxWindows: 3 } }),
        (d) => (d.minute === 45 ? { kind: "sub-offer", minute: d.minute, side: d.side } : eager(d)),
      );
      for (const side of ["home", "away"]) {
        const subs = result.events.filter((e) => e.kind === "substitution" && e.side === side);
        expect(
          new Set(subs.filter((e) => e.minute !== 45).map((e) => e.minute)).size,
        ).toBeLessThanOrEqual(3);
        if (subs.length === 3) exhausted++;
      }
    }
    expect(exhausted).toBeGreaterThan(0);
  });
  it("can use all five players in one batch, without a second decision at the same minute", () => {
    let five = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const result = drive(
        runMatch({ ...matchSetup(seed), substitutions: { maxSubs: 5, maxWindows: 3 } }),
        (d) => {
          if (d.kind !== "sub-offer" || d.minute === 45) return defaultAnswer(d);
          const off = d.legalOff.filter((p) => p.role !== "GK").slice(0, 5);
          return {
            kind: d.kind,
            minute: d.minute,
            side: d.side,
            off: off[0]?.playerId,
            changes: off.slice(1).map((p) => ({ off: p.playerId })),
          };
        },
      );
      const subs = result.events.filter((e) => e.kind === "substitution" && e.side === "home");
      expect(subs.length).toBeLessThanOrEqual(5);
      if (subs.length === 5 && new Set(subs.map((e) => e.minute)).size === 1) five++;
    }
    expect(five).toBeGreaterThan(0);
  });
  it("keeps the original simulation byte-identical when no historical restrictions apply", () => {
    for (let seed = 1; seed <= 40; seed++)
      expect(simulate({ ...matchSetup(seed), substitutions: { maxSubs: 5 } })).toEqual(
        simulate(matchSetup(seed)),
      );
  });
});
it("keeps suggested batches in the live auto-answer and declines all changes in manual mode", () => {
  const d: MatchDecision = {
    kind: "sub-offer",
    minute: 60,
    side: "home",
    events: [],
    stoppage: true,
    engineSuggests: true,
    suggestedOff: 101,
    suggestedReason: "tactical",
    legalOn: [],
    legalOff: [],
    maxChanges: 5,
    suggestedChanges: [{ off: 102 }],
  };
  expect(answerFor(d, "auto")).toMatchObject({ off: 101, changes: [{ off: 102 }] });
  expect(answerFor(d, "manual")).not.toHaveProperty("changes");
});
