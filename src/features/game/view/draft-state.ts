import type { PlayerRole } from "@/data/schemas";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { canPlay } from "@/features/game/domain/eligibility";
import type { Formation } from "@/features/game/domain/formation";

export type Selection = { kind: "slot"; index: number } | { kind: "card"; cardId: PlayerSeasonId };

export interface DraftState {
  formation: Formation;
  /** By slot index. `null` = empty. Holds cardIds, so there is one source of truth. */
  slots: (PlayerSeasonId | null)[];
  selection: Selection | null;
  seed: number;
}

export type DraftAction =
  | { type: "selectSlot"; index: number }
  | { type: "selectCard"; cardId: PlayerSeasonId }
  | { type: "place"; index: number; cardId: PlayerSeasonId }
  | { type: "clearSlot"; index: number }
  | { type: "setFormation"; formation: Formation }
  /** Slots computed outside — `fillGaps` needs the pool, which the reducer must not hold. */
  | { type: "setSlots"; slots: (PlayerSeasonId | null)[] }
  | { type: "reset"; formation: Formation; seed: number };

export function createDraftState(formation: Formation, seed: number): DraftState {
  return { formation, slots: formation.slots.map(() => null), selection: null, seed };
}

/**
 * Put a card in a slot, moving it if it is already on the pitch and swapping if the
 * destination is taken.
 *
 * A card is a player-season, so the same man cannot occupy two slots — an XI with a
 * duplicate is one the engine cannot assemble.
 */
function placeCard(state: DraftState, index: number, cardId: PlayerSeasonId): DraftState {
  const slots = [...state.slots];
  const from = slots.indexOf(cardId);
  const displaced = slots[index];
  slots[index] = cardId;
  if (from >= 0 && from !== index) slots[from] = displaced;
  return { ...state, slots, selection: null };
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "selectSlot": {
      if (state.selection?.kind === "card") {
        return placeCard(state, action.index, state.selection.cardId);
      }
      // Clicking the same slot again deselects, rather than trapping the coach in a
      // selection he has to spend before he can do anything else.
      if (state.selection?.kind === "slot" && state.selection.index === action.index) {
        return { ...state, selection: null };
      }
      return { ...state, selection: { kind: "slot", index: action.index } };
    }
    case "selectCard": {
      if (state.selection?.kind === "slot") {
        return placeCard(state, state.selection.index, action.cardId);
      }
      if (state.selection?.kind === "card" && state.selection.cardId === action.cardId) {
        return { ...state, selection: null };
      }
      return { ...state, selection: { kind: "card", cardId: action.cardId } };
    }
    case "place":
      return placeCard(state, action.index, action.cardId);
    case "clearSlot": {
      const slots = [...state.slots];
      slots[action.index] = null;
      return { ...state, slots, selection: null };
    }
    case "setFormation": {
      // Players stay where they are. Anything now in the wrong role is reported by
      // `validateSquad` and blocks Play; dropping them would discard the coach's work
      // invisibly. Every FORMATIONS entry has eleven slots, so the indices line up.
      const slots = action.formation.slots.map((_, i) => state.slots[i] ?? null);
      return { ...state, formation: action.formation, slots, selection: null };
    }
    case "setSlots":
      return { ...state, slots: [...action.slots], selection: null };
    case "reset":
      return createDraftState(action.formation, action.seed);
  }
}

export interface SquadError {
  slotIndex: number;
  role: PlayerRole;
  cardId: PlayerSeasonId;
  playerName: string;
}

/**
 * Every placed player who is not eligible for the slot he stands in.
 *
 * ⚠️ In practice this can only fire after a FORMATION CHANGE — click-to-place never
 * offers an illegal slot, so the ban is otherwise enforced by construction. That is
 * exactly why it has to exist: re-roling the slots underneath a placed XI is easy to
 * do by accident, and without this the engine would simply be handed the result.
 */
export function validateSquad(state: DraftState, pool: readonly PoolCard[]): SquadError[] {
  const errors: SquadError[] = [];
  state.slots.forEach((cardId, slotIndex) => {
    if (cardId == null) return;
    const card = pool.find((c) => c.cardId === cardId);
    if (card == null) return;
    const slot = state.formation.slots[slotIndex];
    if (slot == null || canPlay(card, slot.role)) return;
    errors.push({ slotIndex, role: slot.role, cardId, playerName: card.name });
  });
  return errors;
}

/** Incompleteness is not an eligibility offence — it is a separate reason Play is off. */
export function isComplete(state: DraftState): boolean {
  return state.slots.every((s) => s != null);
}
