import type { PlayerRole } from "@/data/schemas";
import type { FormationSlot } from "@/features/game/domain/formation";
import type { Side } from "@/features/game/domain/match-types";

/** A vertical lane of the pitch, from the broadcast camera's point of view. */
export type Lane = "left" | "center" | "right";

/** Where the current attack is concentrated — drives the tactical drift (#3). */
export interface AttackZone {
  side: Side;
  lane: Lane;
}

/** Role-aware squad-number pools, deliberately mixing canonical numbers with
 * realistic higher ones (22, 33, 66, 77, 99…). The GK pool stays canonical so
 * keepers usually wear 1; outfield pools are rotated by player identity so the
 * two teams don't end up with a symmetric 1–11. */
const NUMBER_POOL: Record<PlayerRole, number[]> = {
  GK: [1, 13, 25],
  RB: [2, 22, 12, 66, 18],
  CB: [4, 5, 6, 3, 15, 23, 33, 26],
  LB: [3, 18, 33, 26, 12],
  CDM: [6, 16, 4, 28, 8],
  CM: [8, 14, 16, 25, 7, 21],
  CAM: [10, 17, 20, 11, 45],
  RM: [7, 11, 17, 27, 26],
  LM: [11, 21, 30, 7, 26],
  RW: [7, 11, 17, 77, 27],
  LW: [11, 22, 20, 10, 30],
  SS: [9, 19, 10, 39, 50],
  CF: [9, 19, 10, 99, 29],
};

function rotate(pool: number[], seed: number): number[] {
  if (pool.length === 0) return pool;
  const k = ((seed % pool.length) + pool.length) % pool.length;
  return [...pool.slice(k), ...pool.slice(0, k)];
}

/**
 * Deterministic, complete, VARIED squad numbers for an XI ordered to slots.
 * Synthetic (v1) — the lineups feed carries real numbers under a different
 * player-id namespace, so a best-XI can't join them cleanly. Rotating each
 * outfield pool by the player id makes the two teams feel distinct.
 */
export function assignNumbers(players: { role: PlayerRole; seed: number }[]): number[] {
  const used = new Set<number>();
  const take = (n: number) => {
    used.add(n);
    return n;
  };
  return players.map(({ role, seed }) => {
    const pool = NUMBER_POOL[role] ?? [];
    const ordered = role === "GK" ? pool : rotate(pool, seed);
    const free = ordered.find((n) => !used.has(n));
    if (free != null) return take(free);
    let n = 2;
    while (used.has(n)) n++;
    return take(n);
  });
}

/** Short display name — the last whitespace-separated token (surname). */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

/**
 * Which lane the slot at `index` occupies, ranked among the slots sharing its
 * formation row. Single-occupant rows (e.g. a lone GK/striker) → center.
 */
export function laneOfSlot(index: number, slots: FormationSlot[]): Lane {
  const target = slots[index];
  if (!target) return "center";
  const rowMates = slots
    .map((s, i) => ({ col: s.col, row: s.row, i }))
    .filter((s) => s.row === target.row)
    .sort((a, b) => a.col - b.col);
  if (rowMates.length <= 1) return "center";
  const rank = rowMates.findIndex((s) => s.i === index);
  const p = rank / (rowMates.length - 1);
  return p < 0.34 ? "left" : p > 0.66 ? "right" : "center";
}
