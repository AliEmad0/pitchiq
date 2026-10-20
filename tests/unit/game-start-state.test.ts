import { describe, expect, it } from "vitest";
import { encodeTokens } from "@/features/game/domain/decision-tokens";
import { hashEvents } from "@/features/game/domain/hash";
import {
  defaultAnswer,
  type DecisionAnswer,
  type MatchDecision,
} from "@/features/game/domain/match-decisions";
import type { MatchEvent, MatchSetup } from "@/features/game/domain/match-types";
import { drive, runMatch, simulate } from "@/features/game/domain/simulate";
import { premierLeagueSubstitutions } from "@/features/game/domain/substitution-rules";
import golden from "./fixtures/engine-inert-golden.json";
import { matchSetup } from "./_helpers/match-setup";

/**
 * TASK-1816 — the engine can start part-way through a match.
 *
 * `startState` carries the REAL events before the start minute (goals, red cards); the
 * starting score is derived from them, so the scoreboard and the event list can never
 * disagree. With it absent, the engine must be byte-identical to before the change.
 */
const goal = (minute: number, side: "home" | "away"): MatchEvent => ({
  minute,
  kind: "goal",
  side,
  source: "open",
});

const whatIf = (seed: number, over: Partial<NonNullable<MatchSetup["startState"]>> = {}) =>
  ({
    ...matchSetup(seed),
    startState: {
      minute: 26,
      priorEvents: [goal(1, "away"), goal(10, "away"), goal(20, "away"), goal(26, "away")],
      subsUsed: { home: 0, away: 0 },
      teamTalk: "home",
      ...over,
    },
  }) satisfies MatchSetup;

/** Every decision the engine raises, answered with the default (sub reasons stripped). */
function playLogged(setup: MatchSetup) {
  const decisions: MatchDecision[] = [];
  const answers: DecisionAnswer[] = [];
  const result = drive(runMatch(setup), (d) => {
    decisions.push(d);
    const a = defaultAnswer(d);
    const clean = a.kind === "sub-offer" ? { ...a, reason: undefined } : a;
    answers.push(clean);
    return clean;
  });
  return { decisions, answers, result };
}

describe("startState — inert when absent", () => {
  it("⛔ absent startState is byte-identical to the pre-change engine (200 + 50 seeds)", () => {
    const plain = Array.from({ length: 200 }, (_, i) =>
      hashEvents(simulate(matchSetup(i + 1)).events),
    );
    const classic = Array.from({ length: 50 }, (_, i) =>
      hashEvents(
        simulate({
          ...matchSetup(i + 1),
          substitutions: premierLeagueSubstitutions(2001, "2001-09-29"),
        }).events,
      ),
    );
    expect(plain).toEqual(golden.plain);
    expect(classic).toEqual(golden.classic);
  });
});

describe("startState — starting part-way through", () => {
  it("starts from the prior events: no NEW event before the start minute, score includes them", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = simulate(whatIf(seed));
      const prior = r.events.filter((e) => e.kind === "goal" && e.minute <= 26);
      expect(prior).toHaveLength(4);
      const newBefore = r.events.filter(
        (e) => e.minute > 0 && e.minute <= 26 && !(e.kind === "goal"),
      );
      expect(newBefore, `seed ${seed}`).toEqual([]);
      expect(r.score.away).toBeGreaterThanOrEqual(4);
      const given = r.events.filter((e) => e.kind === "goal" && e.disallowedAt == null);
      expect(given.filter((e) => e.side === "home")).toHaveLength(r.score.home);
      expect(given.filter((e) => e.side === "away")).toHaveLength(r.score.away);
    }
  });

  it("the first decisions are the team talk AT the start minute: a response, then halftime sub-offers", () => {
    const { decisions } = playLogged(whatIf(7));
    expect(decisions[0]).toMatchObject({ kind: "response", minute: 26, side: "home" });
    expect(decisions[1]).toMatchObject({ kind: "sub-offer", minute: 26, halftime: true });
    expect(decisions[1]!.kind === "sub-offer" && decisions[1]!.legalOn.length).toBeGreaterThan(0);
  });

  it("⛔ no two decisions share kind/minute/side — even when the start falls in the sub window", () => {
    // Review finding #1: the team talk used to be raised at minute+1, the same minute normal
    // play then raised its own sub-offer (55'–85') or a response to a goal — a repeat the
    // driver's duplicate guard cannot tell apart.
    for (const minute of [26, 55, 64]) {
      for (let seed = 1; seed <= 40; seed++) {
        const { decisions } = playLogged(whatIf(seed, { minute }));
        const keys = decisions.map((d) => `${d.kind}:${d.minute}:${d.side}`);
        expect(new Set(keys).size, `start ${minute}, seed ${seed}`).toBe(keys.length);
      }
    }
  });

  it("a player sent off before the start never plays: not in events, not offered", () => {
    const red: MatchEvent = {
      minute: 15,
      kind: "card",
      card: "red",
      side: "home",
      playerId: 105,
    };
    for (let seed = 1; seed <= 30; seed++) {
      const { decisions, result } = playLogged(
        whatIf(seed, { priorEvents: [goal(1, "away"), goal(10, "away"), red] }),
      );
      const after = result.events.filter((e) => e.minute > 26 && e.playerId === 105);
      expect(after, `seed ${seed}`).toEqual([]);
      for (const d of decisions)
        if (d.kind === "sub-offer" && d.side === "home")
          expect(d.legalOff.some((p) => p.playerId === 105)).toBe(false);
    }
  });

  it("substitutions already used count against the season's limit (1994: two used → none offered)", () => {
    const { decisions } = playLogged({
      ...whatIf(3, { subsUsed: { home: 2, away: 0 } }),
      substitutions: premierLeagueSubstitutions(1993, "1994-01-04"),
    });
    const homeOffers = decisions.filter(
      (d) => d.kind === "sub-offer" && d.side === "home" && d.legalOn.length > 0,
    );
    expect(homeOffers).toEqual([]);
  });

  it("⛔ replays byte-for-byte with a team-talk answer, and the answers encode", () => {
    const setup = whatIf(11);
    const first = drive(runMatch(setup), (d) =>
      d.kind === "response" && d.minute === 26
        ? { kind: "response", minute: 26, side: d.side, choice: "overload" }
        : (() => {
            const a = defaultAnswer(d);
            return a.kind === "sub-offer" ? { ...a, reason: undefined } : a;
          })(),
    );
    const { answers } = playLogged(setup);
    expect(() => encodeTokens(answers)).not.toThrow();
    const again = drive(runMatch(setup), (d) =>
      d.kind === "response" && d.minute === 26
        ? { kind: "response", minute: 26, side: d.side, choice: "overload" }
        : (() => {
            const a = defaultAnswer(d);
            return a.kind === "sub-offer" ? { ...a, reason: undefined } : a;
          })(),
    );
    expect(again).toEqual(first);
  });
});
