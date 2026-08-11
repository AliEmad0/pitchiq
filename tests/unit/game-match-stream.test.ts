import { describe, expect, it } from "vitest";
import { defaultAnswer } from "@/features/game/domain/match-decisions";
import type { MatchEvent } from "@/features/game/domain/match-types";
import { runMatch, simulate } from "@/features/game/domain/simulate";
import { createStream } from "@/features/game/view/match-stream";
import { matchSetup } from "./_helpers/match-setup";

const key = (e: MatchEvent) => `${e.minute}:${e.kind}:${e.side ?? ""}:${e.playerId ?? ""}`;

/** Drive a stream to full time, collecting what each step emitted. */
function drain(seed: number, coachSide: "home" | "away" = "home") {
  const stream = createStream(runMatch(matchSetup(seed)), coachSide);
  const emitted: MatchEvent[][] = [];
  const surfaced: string[] = [];
  let step = stream.advance();
  for (let guard = 0; guard < 500; guard++) {
    emitted.push(step.events);
    if (step.kind === "done") return { emitted, surfaced, result: step.result };
    surfaced.push(step.decision.side);
    step = stream.answer(defaultAnswer(step.decision));
  }
  throw new Error("stream did not finish — it is looping");
}

describe("createStream", () => {
  it("surfaces only the coach's own decisions", () => {
    // The engine raises decisions for BOTH sides; the opponent's are answered silently
    // so it behaves exactly as it does in a batch match.
    const { surfaced } = drain(42, "home");
    expect(surfaced.length).toBeGreaterThan(0);
    expect(new Set(surfaced)).toEqual(new Set(["home"]));
  });

  it("still finishes when the coach takes the other side", () => {
    // Proof the filter is a filter and not a hard-coded side: every decision must be
    // answered either way, or the generator hangs.
    const { surfaced, result } = drain(42, "away");
    expect(new Set(surfaced)).toEqual(new Set(["away"]));
    expect(result.events[result.events.length - 1].kind).toBe("fulltime");
  });

  it("⚠️ concatenated segments equal the batch match exactly", () => {
    // The assertion that proves streaming invented nothing and dropped nothing.
    // Compared as identity SETS: the engine stable-sorts events by minute at the very
    // end, so a VAR verdict emitted a minute after its goal moves position.
    for (const seed of [1, 42, 777]) {
      const { emitted } = drain(seed);
      const streamed = emitted.flat().map(key);
      const batch = simulate(matchSetup(seed)).events.map(key);
      expect(new Set(streamed)).toEqual(new Set(batch));
    }
  });

  it("⚠️ never emits the same event twice", () => {
    // Cumulative snapshots make double-rendering the likeliest defect in this shape,
    // so it gets its own assertion rather than being implied by the set comparison.
    for (const seed of [1, 42, 777]) {
      const streamed = drain(seed).emitted.flat().map(key);
      expect(streamed.length).toBe(new Set(streamed).size);
    }
  });

  it("emits every event exactly once, counting duplicates the engine really produced", () => {
    for (const seed of [5, 55]) {
      const { emitted } = drain(seed);
      expect(emitted.flat()).toHaveLength(simulate(matchSetup(seed)).events.length);
    }
  });

  it("the final step carries the complete result", () => {
    const { result } = drain(3);
    expect(result.events[result.events.length - 1].kind).toBe("fulltime");
    expect(result.score).toEqual(simulate(matchSetup(3)).score);
  });

  it("refuses to be answered after full time", () => {
    const stream = createStream(runMatch(matchSetup(9)), "home");
    let step = stream.advance();
    let guard = 0;
    while (step.kind === "decision" && guard++ < 200) step = stream.answer(defaultAnswer(step.decision));
    expect(step.kind).toBe("done");
    expect(() =>
      stream.answer({ kind: "response", minute: 1, side: "home", choice: "hold" }),
    ).toThrow(/finished/i);
  });
});
