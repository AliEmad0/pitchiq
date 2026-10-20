import {
  compareFinals,
  verdictFor,
  type Scenario,
  type Verdict,
} from "@/features/game/domain/what-if";
import { idbGet, idbGetAll, idbPut } from "./idb";

type Score = { home: number; away: number };
export interface WhatIfBest {
  verdict: Verdict;
  score: Score;
}
interface StoredBest extends WhatIfBest {
  /** The scenario id — also the store key; kept in the value so `getAll` is self-describing. */
  id: string;
}

/**
 * TASK-1816 — the best result per scenario. Only the RESULT is kept, never the match: a
 * scenario replays from its frozen start state, so nothing else is needed to show the chip.
 *
 * ⚠️ Best-effort, like `daily-slot.ts`: private browsing, a quota error or a blocked upgrade
 * must never interrupt the full-time screen.
 */
export async function recordWhatIf(s: Scenario, final: Score): Promise<void> {
  try {
    const old = await idbGet<StoredBest>("whatIf", s.id);
    if (old != null && compareFinals(final, old.score, s.side) <= 0) return;
    await idbPut("whatIf", s.id, { id: s.id, verdict: verdictFor(s, final), score: final });
  } catch {
    // Persistence is best-effort by design.
  }
}

export async function loadWhatIfBests(): Promise<Record<string, WhatIfBest>> {
  try {
    const all = await idbGetAll<StoredBest>("whatIf");
    return Object.fromEntries(all.map(({ id, verdict, score }) => [id, { verdict, score }]));
  } catch {
    return {};
  }
}
