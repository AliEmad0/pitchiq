import { CRESTS, NAME_MAX } from "@/features/game/domain/coach";
import { idbGet, idbPut } from "./idb";

/** TASK-1827 — the coach's identity, local to this browser (IndexedDB v7 `profile`). */
export interface CoachProfile {
  name: string;
  crest: string;
  /** UTC ISO timestamp of the first run. */
  createdAt: string;
  /** Did the coach finish the tutorial match (rather than skip it)? */
  tutorialDone: boolean;
}

const KEY = "me";

function valid(p: unknown): p is CoachProfile {
  if (p == null || typeof p !== "object") return false;
  const c = p as CoachProfile;
  return (
    typeof c.name === "string" &&
    c.name.length > 0 &&
    c.name.length <= NAME_MAX &&
    CRESTS.some((x) => x.id === c.crest) &&
    typeof c.createdAt === "string" &&
    typeof c.tutorialDone === "boolean"
  );
}

/** Best-effort, like the daily slot: a blocked store must never break the welcome. */
export async function saveProfile(p: CoachProfile): Promise<void> {
  try {
    await idbPut("profile", KEY, p);
  } catch {
    // Private browsing: the coach simply is not remembered.
  }
}

/** `null` = a first-time visitor (or storage that will not tell us otherwise). */
export async function loadProfile(): Promise<CoachProfile | null> {
  try {
    const p = await idbGet<unknown>("profile", KEY);
    return valid(p) ? p : null;
  } catch {
    return null;
  }
}
