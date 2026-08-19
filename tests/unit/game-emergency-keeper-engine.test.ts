import { describe, expect, it } from "vitest";
import { encodeTokens, readTokens } from "@/features/game/domain/decision-tokens";
import {
  defaultAnswer,
  type DecisionAnswer,
  type MatchDecision,
} from "@/features/game/domain/match-decisions";
import { runMatch } from "@/features/game/domain/simulate";
import { matchSetup } from "./_helpers/match-setup";

/**
 * TASK-1810 — the engine half of the emergency keeper (owner's rule, 2026-08-19).
 *
 * ⚠️ Driven over REAL matches. Measured first, because the obvious fixture is vacuous:
 * across 400 seeds the engine dismisses a keeper 39 times but NEVER offers an emergency
 * keeper, because substitutions are still available every time. Spending the bench first
 * produces 20 real opportunities — so every test here drives with `spendEverything`.
 */
const spendEverything = (d: MatchDecision): DecisionAnswer => {
  if (d.kind === "sub-offer") {
    // ⚠️ Never `defaultAnswer` for a sub-offer: it attaches a `reason` whenever the engine
    // suggested the change, and `encodeTokens` throws on one. No coach path produces a
    // reason, so a driver standing in for a coach must not either.
    if (d.legalOff.length > 0 && d.legalOn.length > 0) {
      return {
        kind: "sub-offer",
        minute: d.minute,
        side: d.side,
        off: d.legalOff[0]!.playerId,
        on: d.legalOn[0]!.playerId,
      };
    }
    return { kind: "sub-offer", minute: d.minute, side: d.side };
  }
  return defaultAnswer(d);
};

interface Run {
  seen: MatchDecision[];
  answers: DecisionAnswer[];
  score: { home: number; away: number };
}

function drive(seed: number, answer: (d: MatchDecision) => DecisionAnswer): Run {
  const gen = runMatch(matchSetup(seed));
  const seen: MatchDecision[] = [];
  const answers: DecisionAnswer[] = [];
  let step = gen.next(undefined as unknown as DecisionAnswer);
  while (!step.done) {
    seen.push(step.value);
    const a = answer(step.value);
    answers.push(a);
    step = gen.next(a);
  }
  return { seen, answers, score: step.value.score };
}

/** The first seed whose match actually offers an emergency keeper. */
function seedWithOffer(): number | null {
  for (let seed = 1; seed <= 400; seed++) {
    const { seen } = drive(seed, spendEverything);
    if (seen.some((d) => d.kind === "dismissal" && d.emergencyKeepers.length > 0)) return seed;
  }
  return null;
}

describe("the dismissal decision", () => {
  it("⭐ DOES offer an emergency keeper once the bench is spent", () => {
    // Non-vacuous by construction: this fails if the path becomes unreachable.
    const seed = seedWithOffer();
    expect(seed).not.toBeNull();
  });

  it("⛔ never offers one while a substitution is still possible", () => {
    // With a bench keeper available the coach should bring him on, not improvise.
    for (let seed = 1; seed <= 80; seed++) {
      for (const d of drive(seed, spendEverything).seen) {
        if (d.kind !== "dismissal" || d.emergencyKeepers.length === 0) continue;
        expect(d.legalOn).toHaveLength(0);
        expect(d.keeperGone).toBe(true);
      }
    }
  });

  it("only ever offers players who are NOT already keepers", () => {
    for (let seed = 1; seed <= 80; seed++) {
      for (const d of drive(seed, spendEverything).seen) {
        if (d.kind !== "dismissal") continue;
        for (const p of d.emergencyKeepers) expect(p.role).not.toBe("GK");
      }
    }
  });
});

describe("an emergency keeper survives a share code", () => {
  it("⭐ replays to the SAME scoreline through the token stream", () => {
    /**
     * This is the whole reason the token grammar was extended rather than left alone: a
     * match that cannot replay itself breaks the invariant the rest of Phase 18 rests on,
     * and a half-replayable one surfaces later as a mysterious drift warning.
     */
    const seed = seedWithOffer();
    expect(seed).not.toBeNull();

    const withKeeper = (d: MatchDecision): DecisionAnswer => {
      if (d.kind === "dismissal" && d.emergencyKeepers.length > 0) {
        return {
          kind: "dismissal",
          minute: d.minute,
          side: d.side,
          inGoal: d.emergencyKeepers[0]!.playerId,
        };
      }
      return spendEverything(d);
    };

    const live = drive(seed!, withKeeper);
    expect(live.answers.some((a) => a.kind === "dismissal" && a.inGoal != null)).toBe(true);

    // Encode what the coach did, then replay the match by reading it back.
    const code = encodeTokens(live.answers);
    const reader = readTokens(code);
    expect(reader).not.toBeNull();

    const replayed = drive(seed!, (d) => {
      const out = reader!.next(d);
      expect(out.ok).toBe(true);
      return (out as { ok: true; answer: DecisionAnswer }).answer;
    });

    expect(replayed.score).toEqual(live.score);
    expect(reader!.done()).toBe(true);
  });
});
