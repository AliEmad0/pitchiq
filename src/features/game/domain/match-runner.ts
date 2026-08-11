import { type DecisionAnswer, type MatchDecision, defaultAnswer } from "./match-decisions";
import type { MatchResult, MatchSetup } from "./match-types";
import { runMatch } from "./simulate";

/**
 * A match plus the answers that produced it.
 *
 * ⚠️ Deliberately NOT `MatchResult`. Adding a field to what `simulate()` returns would
 * break the determinism snapshots, which compare whole results with `toEqual` — and
 * those snapshots are the only evidence that making the engine interruptible did not
 * change how it behaves.
 */
export interface InteractiveMatchResult extends MatchResult {
  decisions: DecisionAnswer[];
}

/** Run a match against a policy, recording every answer for replay. */
export function recordMatch(
  setup: MatchSetup,
  policy: (d: MatchDecision) => DecisionAnswer,
): InteractiveMatchResult {
  const decisions: DecisionAnswer[] = [];
  const gen = runMatch(setup);
  let step = gen.next(undefined as unknown as DecisionAnswer);
  while (!step.done) {
    const answer = policy(step.value);
    decisions.push(answer);
    step = gen.next(answer);
  }
  return { ...step.value, decisions };
}

/**
 * Re-run a match from its recorded answers.
 *
 * ⚠️ A decision list is only valid for the seed and setup it was recorded against — a
 * different seed raises decisions at different minutes, so answers would land on the
 * wrong prompts. Mismatches throw rather than silently mis-applying; a silent mis-apply
 * surfaces to the user as "the shared link plays a different match", which is close to
 * impossible to diagnose after the fact.
 *
 * A list that runs out — an abandoned match — finishes on the default policy, so a
 * partial recording still produces a complete, valid match. That is also how
 * refresh-resume works: persist `(setup, seed, decisions[])`, then replay. Resume is
 * therefore the same code path as seed-sharing rather than its own untested branch.
 */
export function replayMatch(
  setup: MatchSetup,
  decisions: readonly DecisionAnswer[],
): InteractiveMatchResult {
  let i = 0;
  return recordMatch(setup, (d) => {
    const recorded = decisions[i];
    i += 1;
    if (recorded == null) return defaultAnswer(d);
    if (recorded.kind !== d.kind || recorded.minute !== d.minute || recorded.side !== d.side) {
      throw new Error(
        `Recorded decision ${recorded.kind}@${recorded.minute}/${recorded.side} does not match ` +
          `${d.kind}@${d.minute}/${d.side} — the list belongs to a different seed or setup.`,
      );
    }
    return recorded;
  });
}
