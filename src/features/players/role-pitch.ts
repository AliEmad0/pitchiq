import type { PlayerRole } from "@/data/schemas";

/**
 * TASK-M70: where each of the 13 roles sits on a vertical pitch, as `{x, y}`
 * percentages — `x` 0 (left) → 100 (right), `y` 0 (attacking end) → 100 (own
 * goal). Drives the mini-pitch node placement in the player-page role block.
 * Pure data, so it unit-tests without a DOM.
 */
export const ROLE_PITCH_POS: Record<PlayerRole, { x: number; y: number }> = {
  GK: { x: 50, y: 90 },
  RB: { x: 82, y: 72 },
  CB: { x: 50, y: 75 },
  LB: { x: 18, y: 72 },
  CDM: { x: 50, y: 60 },
  CM: { x: 50, y: 48 },
  CAM: { x: 50, y: 36 },
  RM: { x: 80, y: 48 },
  LM: { x: 20, y: 48 },
  RW: { x: 80, y: 26 },
  LW: { x: 20, y: 26 },
  SS: { x: 50, y: 24 },
  CF: { x: 50, y: 12 },
};
