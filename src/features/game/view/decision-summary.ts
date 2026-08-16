import type { DecisionAnswer } from "@/features/game/domain/match-decisions";

/**
 * Split the coach's answers into what he DID and what he waved away.
 *
 * ⛔ The engine raises a `sub-offer` every minute of the substitution window (55'–85', see
 * `domain/squad.ts`), so a coach answers ~31 of them per match and all but a couple are
 * "no change". The full-time screen listed every one as "Substitution", claiming thirty
 * substitutions where none were made.
 *
 * ⚠️ A declined offer is COUNTED, not hidden. A coach who deliberately turned down every
 * substitution did something, and a list that simply omitted them would say he was never
 * asked.
 *
 * ⚠️ A `response` counts as taken even when the choice was "hold". Holding is one of three
 * options the coach picked between, unlike a sub-offer no-op which is the absence of an
 * action. An injury-sub and a dismissal are forced by the match and always count.
 */
export interface DecisionSplit {
  taken: DecisionAnswer[];
  declined: number;
}

export function splitDecisions(answers: readonly DecisionAnswer[]): DecisionSplit {
  const taken: DecisionAnswer[] = [];
  let declined = 0;
  for (const a of answers) {
    if (a.kind === "sub-offer" && a.off == null) {
      declined++;
      continue;
    }
    taken.push(a);
  }
  return { taken, declined };
}
