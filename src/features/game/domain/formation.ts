import type { PlayerRole } from "@/data/schemas";

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
