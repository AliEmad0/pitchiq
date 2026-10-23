import type { CareerEntry } from "@/features/game/domain/records";
import { idbAdd, idbGetAll } from "./idb";

/**
 * TASK-1812 — the career log (IndexedDB v9 `career`), keyed by the SAME key `recordFullTime`
 * claims, so a match is logged once however many paths reach it.
 *
 * ⛔ `add`, never `put`: an entry is a fact about a match already played, so a second write for
 * the same key (a StrictMode double effect, the backfill meeting a live record) is refused
 * rather than allowed to overwrite the first.
 */
export async function logCareer(entry: CareerEntry): Promise<boolean> {
  try {
    return await idbAdd("career", entry.key, entry);
  } catch {
    return false;
  }
}

/** Every logged entry, unordered — `recordsSummary` sorts by `at`. */
export async function loadCareer(): Promise<CareerEntry[]> {
  try {
    return await idbGetAll<CareerEntry>("career");
  } catch {
    return [];
  }
}
