import type { MatchEvent, Side } from "@/features/game/domain/match-types";

/**
 * The score as it stands at `minute`.
 *
 * ⚠️ A goal counts until its VAR verdict is REACHED, not from the moment the verdict
 * exists in the event list. `scoreGoal` pushes the verdict at `minute + VAR_DECISION_DELAY`
 * before the goal is even yielded, so a list-wide count would chalk goals off before they
 * had been celebrated — destroying the exact drama `disallowedAt` was built to create.
 * The clock is what protects it.
 */
export function scoreAt(events: MatchEvent[], minute: number): { home: number; away: number } {
  const score = { home: 0, away: 0 };
  for (const e of events) {
    if (e.kind !== "goal" || e.side == null) continue;
    // Filtered here rather than assumed of the caller. A snapshot legitimately runs AHEAD
    // of its own minute, so "the list I was given is already up to date" is exactly the
    // assumption that would leak a goal the coach has not seen yet.
    if (e.minute > minute) continue;
    if (e.disallowedAt != null && e.disallowedAt <= minute) continue;
    score[e.side as Side] += 1;
  }
  return score;
}
