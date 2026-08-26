import type { PlayerRole } from "@/data/schemas";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { Formation } from "@/features/game/domain/formation";

/** A slot filled before the draft begins — Captain's Draft places its icon (TASK-1810). */
export interface LockedPick {
  index: number;
  cardId: PlayerSeasonId;
}

export interface RoomState {
  formation: Formation;
  /**
   * The BENCH roles this room also drafts, after the formation's slots (TASK-1810).
   *
   * ⚠️ Empty for every mode that drafts an XI only. It is kept on the state rather than
   * derived, because `picks` is indexed by slot and the reader needs to know where the
   * eleven end and the bench begins.
   *
   * ⛔ NOT part of the `Formation`. `formationKey` is `${name}/${slots.length}` and every
   * shape ships eleven slots, so widening a formation to sixteen would collide two different
   * shapes onto one key and restore saved matches into the wrong one.
   */
  bench: readonly PlayerRole[];
  /** One entry per slot then per bench role, in that order. */
  picks: (PlayerSeasonId | null)[];
  /** The slot currently being drafted, or null once every slot is filled. */
  open: number | null;
  /**
   * The pre-filled slot, if the pack locks one.
   *
   * ⚠️ Recorded rather than inferred. "Which pick did the coach not make" is not
   * recoverable from `picks` alone, and the full-time screen already learned that lesson
   * once — see `coachMoves` in `GamePlay`.
   */
  locked: number | null;
}

export type RoomAction =
  | { type: "open"; index: number }
  | { type: "pick"; index: number; cardId: PlayerSeasonId }
  /**
   * ⚠️ Carries its own `locked`. Slot INDICES belong to a shape, so the captain's slot in
   * a 4-4-2 is not his slot in a 3-5-2 — the caller re-derives it and hands it over.
   */
  | { type: "setFormation"; formation: Formation; locked?: LockedPick | null };

export function createRoomState(
  formation: Formation,
  locked?: LockedPick | null,
  bench: readonly PlayerRole[] = [],
): RoomState {
  const picks: (PlayerSeasonId | null)[] = [...formation.slots, ...bench].map(() => null);
  if (locked != null && locked.index >= 0 && locked.index < picks.length) {
    picks[locked.index] = locked.cardId;
    // ⚠️ Opens on the next EMPTY slot, never on the locked one — the coach must not be
    // parked on a decision that has already been made for him.
    return {
      formation,
      bench,
      picks,
      open: nextUnfilled(picks, locked.index),
      locked: locked.index,
    };
  }
  return { formation, bench, picks, open: 0, locked: null };
}

export const isRoomComplete = (s: RoomState): boolean => s.picks.every((p) => p != null);

/**
 * The next slot with no pick, searching forward from `from` and wrapping.
 *
 * Wrapping matters: the coach may fill slot 10 first, so finishing slot 9 has to find
 * slot 0 rather than closing a room with eight slots still empty.
 */
function nextUnfilled(picks: (PlayerSeasonId | null)[], from: number): number | null {
  for (let i = 1; i <= picks.length; i++) {
    const at = (from + i) % picks.length;
    if (picks[at] == null) return at;
  }
  return null;
}

/**
 * ⚠️ There is NO CLOCK in here. The countdown is view state: a timeout PICKS a card, and
 * that pick is the input. `Date.now()` inside anything the room derives from would break
 * the determinism rule locked for Phase 18 — the same rule that governs the match
 * engine's decision prompts.
 *
 * Out-of-range actions are ignored rather than applied, so the UI cannot drive the room
 * into a state it has no rendering for.
 */
export function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case "open":
      if (action.index < 0 || action.index >= state.picks.length) return state;
      return { ...state, open: action.index };
    case "pick": {
      if (action.index < 0 || action.index >= state.picks.length) return state;
      const picks = [...state.picks];
      picks[action.index] = action.cardId;
      return { ...state, picks, open: nextUnfilled(picks, action.index) };
    }
    case "setFormation":
      // A different shape means different slots and different hands; keeping picks would
      // strand players in roles they were never drafted for. The locked pick survives
      // because it is not a pick the coach made — it is a rule of the mode.
      // ⚠️ The bench carries over: it belongs to the MODE, not to the shape, so changing
      // formation must not silently drop the five bench slots the coach still has to fill.
      return createRoomState(action.formation, action.locked, state.bench);
  }
}
