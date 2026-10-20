"use client";

import { useEffect, useState } from "react";
import type { AchievementId } from "@/features/game/domain/achievements";
import { type FullTimeEntry, recordFullTime } from "./trophy-record";

/**
 * One recording per record key for this page's lifetime, shared by every caller.
 *
 * ⛔ `recordFullTime` unlocks a key ONCE and returns nothing on any later call. A hook that only
 * trusted its latest call would lose the full-time banner whenever its effect ran again for the
 * same match — StrictMode's mount check, a dependency change while the summary is up, a remount.
 * Remembering the first call's promise gives every run the same answer.
 */
const recorded = new Map<string, Promise<AchievementId[]>>();

/**
 * TASK-1813/1819 — record a finished match (or run) in the Trophy Room and return what it
 * unlocked for the first time. `null` = nothing to record yet. Keyed on `entry.key` only: the
 * entry is rebuilt every render, and its key is its identity.
 */
export function useFullTimeRecord(entry: FullTimeEntry | null): AchievementId[] {
  const [result, setResult] = useState<{ key: string; ids: AchievementId[] } | null>(null);
  const key = entry?.key ?? null;
  useEffect(() => {
    if (entry == null) return;
    let p = recorded.get(entry.key);
    if (p == null) {
      p = recordFullTime(entry);
      recorded.set(entry.key, p);
    }
    const k = entry.key;
    void p.then((ids) => setResult({ key: k, ids }));
    // `entry` is rebuilt each render; its key is what identifies the match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return result != null && result.key === key ? result.ids : [];
}
