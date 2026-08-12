import type { PlayerRole } from "@/data/schemas";
// `chaos-draft` imports only TYPES from this module, so that edge erases at compile time
// and this is not a runtime cycle.
import { FORMATIONS } from "./chaos-draft";

export interface GridPos {
  row: number; // 1 = goalkeeper line, increasing toward the opponent goal
  col: number; // position across that line
}

export interface FormationSlot extends GridPos {
  role: PlayerRole;
}

export interface Formation {
  name: string; // e.g. "4-4-2"; "" when the source lineup was indeterminate
  season: number;
  slots: FormationSlot[];
}

/** "row:col" → {row,col}; null/"" (a benched player) → null. */
export function parseGrid(grid: string | null): GridPos | null {
  if (!grid) return null;
  const match = /^(\d+):(\d+)$/.exec(grid);
  if (!match) return null;
  return { row: Number(match[1]), col: Number(match[2]) };
}

/** Stable identity for a mined template: shape name + how many slots it defines. */
export function formationKey(formation: Formation): string {
  return `${formation.name}/${formation.slots.length}`;
}

/**
 * Resolve one of the shipped formations by name.
 *
 * ⚠️ Exists so that `FORMATIONS`'s ORDER is presentation only. Reading that array by index
 * makes inserting a shape a silent behaviour change: the hard-ban test in
 * `game-draft-state.test.ts` pins slot 4 precisely because it is the only index whose role
 * differs between 4-4-2 and 3-5-2, so repointing `FORMATIONS[2]` would leave it passing
 * for the wrong reason.
 *
 * Throws rather than returning undefined — a missing shape is a programming error, and a
 * silent undefined surfaces as a crash far from its cause.
 */
export function formationByName(name: string): Formation {
  const found = FORMATIONS.find((f) => f.name === name);
  if (!found) throw new Error(`unknown formation: ${name}`);
  return found;
}
