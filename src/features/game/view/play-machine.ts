/**
 * The phases of a match session.
 *
 * The owner's architecture named five states; `DRAFT_SELECTION` is the round-based Draft
 * Room, which is TASK-1823 / sub-project C. B1 mounts the existing draft hub as `setup`,
 * so the round-based path can slot in later without moving anything else.
 */
export type PlayPhase = "setup" | "preview" | "live" | "summary";

export interface PlayState {
  phase: PlayPhase;
  /**
   * Drawn once the squad is confirmed, so the whole match — and every decision taken in
   * it — replays from `(setup, seed, decisions[])`.
   */
  seed: number | null;
}

export type PlayAction =
  | { type: "confirmSquad"; seed: number }
  | { type: "kickOff" }
  | { type: "fullTime" }
  /** Back out of the preview to rebuild the squad, before a ball has been kicked. */
  | { type: "backToSetup" }
  | { type: "newMatch" };

export const createPlayState = (phase: PlayPhase = "setup"): PlayState => ({ phase, seed: null });

/**
 * ⚠️ Transitions that do not belong to the current phase are IGNORED, not applied.
 *
 * A linear flow that ignores by default cannot be driven into a state the UI has no
 * rendering for — which is the reason this is a machine rather than a pile of booleans.
 * Returning the same object when nothing changes also keeps React from re-rendering on
 * a no-op dispatch.
 */
export function playReducer(state: PlayState, action: PlayAction): PlayState {
  switch (action.type) {
    case "confirmSquad":
      return state.phase === "setup" ? { phase: "preview", seed: action.seed } : state;
    case "kickOff":
      return state.phase === "preview" ? { ...state, phase: "live" } : state;
    case "fullTime":
      return state.phase === "live" ? { ...state, phase: "summary" } : state;
    case "backToSetup":
      // Only from the preview. Once the match is live the seed has produced events, and
      // silently rewinding to the draft would strand a half-played match in memory.
      return state.phase === "preview" ? createPlayState("setup") : state;
    case "newMatch":
      // A fresh state, not just a phase change: carrying the old seed forward would make
      // the next match a replay of the last one.
      return state.phase === "summary" ? createPlayState("setup") : state;
  }
}
