import {
  type DecisionAnswer,
  type MatchDecision,
  defaultAnswer,
} from "@/features/game/domain/match-decisions";
import type { MatchEvent, MatchResult, Side } from "@/features/game/domain/match-types";

export type StreamStep =
  | { kind: "decision"; decision: MatchDecision; events: MatchEvent[] }
  | { kind: "done"; result: MatchResult; events: MatchEvent[] };

/**
 * Drive the interruptible engine, surfacing only the coach's own decisions.
 *
 * Lives in `view/` because it is about presenting a match, not simulating one — the
 * engine neither knows nor cares that a human is on one side.
 *
 * ⚠️ EVERY decision the engine raises must be answered, or the generator hangs. The
 * opponent's are answered immediately with `defaultAnswer` so it behaves exactly as it
 * does in a batch match. That is a filter on the driver, never a change to the engine,
 * and swapping in a smarter opponent later is a policy object here rather than a rewrite.
 *
 * ⚠️ Each step returns only the events that are NEW since the last one. The engine's
 * snapshots are cumulative, so passing them straight through would re-render everything
 * that came before, every time.
 */
export function createStream(
  gen: Generator<MatchDecision, MatchResult, DecisionAnswer>,
  coachSide: Side,
) {
  let seen = 0;
  let finished = false;

  /** Answer the opponent's decisions until one belongs to the coach, or the match ends. */
  const drain = (from: IteratorResult<MatchDecision, MatchResult>): StreamStep => {
    let step = from;
    while (!step.done && step.value.side !== coachSide) {
      step = gen.next(defaultAnswer(step.value));
    }
    // Both a decision and the final result carry `events`, so this needs no narrowing.
    const all = step.value.events;
    const fresh = all.slice(seen);
    seen = all.length;
    if (step.done) {
      finished = true;
      return { kind: "done", result: step.value, events: fresh };
    }
    return { kind: "decision", decision: step.value, events: fresh };
  };

  return {
    /** Run to the first decision the coach must answer, or straight to full time. */
    advance(): StreamStep {
      return drain(gen.next(undefined as unknown as DecisionAnswer));
    },
    /** Answer the outstanding decision and run on to the next one. */
    answer(a: DecisionAnswer): StreamStep {
      if (finished) throw new Error("match already finished");
      return drain(gen.next(a));
    },
  };
}
