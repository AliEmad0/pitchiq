import { describe, expect, it } from "vitest";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import { defaultAnswer } from "@/features/game/domain/match-decisions";
import type { MatchEvent } from "@/features/game/domain/match-types";
import { runMatch, simulate } from "@/features/game/domain/simulate";
import { matchSetup } from "./_helpers/match-setup";

/** Drive to completion with the default policy, collecting every decision raised. */
function collect(seed: number) {
  const seen: MatchDecision[] = [];
  const gen = runMatch(matchSetup(seed));
  let step = gen.next(undefined as unknown as DecisionAnswer);
  while (!step.done) {
    seen.push(step.value);
    step = gen.next(defaultAnswer(step.value));
  }
  return { seen, result: step.value };
}

const key = (e: MatchEvent) => `${e.minute}:${e.kind}:${e.side ?? ""}:${e.playerId ?? ""}`;

describe("decision event snapshots", () => {
  it("every decision carries the match so far", () => {
    const { seen } = collect(42);
    expect(seen.length).toBeGreaterThan(0);
    for (const d of seen) expect(Array.isArray(d.events)).toBe(true);
  });

  it("⚠️ a snapshot CAN run ahead of its own minute — only a VAR verdict does", () => {
    // `scoreGoal` pushes the verdict at `minute + VAR_DECISION_DELAY` BEFORE it yields
    // the response decision at `minute`, so the snapshot legitimately holds an event one
    // minute in the future. Nothing else does.
    //
    // ⚠️ This is why the CLOCK, not the copy, protects the suspense: the view must never
    // render past its own cursor, or a goal is chalked off before the crowd has finished
    // celebrating it.
    let sawAhead = 0;
    for (let s = 0; s < 40; s++) {
      for (const d of collect(s).seen) {
        for (const e of d.events) {
          if (e.minute <= d.minute) continue;
          expect(e.kind).toBe("var");
          sawAhead += 1;
        }
      }
    }
    // Swept over 40 seeds specifically so this is not vacuous — a single seed with no
    // reviewed goal would assert nothing at all.
    expect(sawAhead).toBeGreaterThan(0);
  });

  it("snapshots grow monotonically", () => {
    const { seen } = collect(42);
    let previous = 0;
    for (const d of seen) {
      expect(d.events.length).toBeGreaterThanOrEqual(previous);
      previous = d.events.length;
    }
  });

  it("every snapshotted event survives into the final match", () => {
    // Compared as identity keys, not positions: the engine stable-sorts events by minute
    // at the very end, so a VAR verdict emitted a minute after its goal moves position.
    const { seen, result } = collect(42);
    const finalKeys = new Set(result.events.map(key));
    for (const d of seen) {
      for (const e of d.events) expect(finalKeys.has(key(e))).toBe(true);
    }
  });

  it("⚠️ the snapshot is a COPY — mutating it cannot corrupt the match", () => {
    const { seen, result } = collect(7);
    const before = result.events.length;
    seen[0].events.push({ minute: 999, kind: "fulltime" });
    expect(result.events).toHaveLength(before);
    expect(result.events.some((e) => e.minute === 999)).toBe(false);
  });

  it("adding the field did not change the match", () => {
    for (const seed of [1, 42, 999]) {
      expect(collect(seed).result).toEqual(simulate(matchSetup(seed)));
    }
  });
});
