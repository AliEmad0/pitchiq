import type { PlayerRole } from "@/data/schemas";

/** How the four core dimensions blend into `overall`, per role (each sums to 1). */
export interface RoleWeights {
  attack: number;
  creation: number;
  defense: number;
  physical: number;
}

export const DEFAULT_WEIGHTS: RoleWeights = {
  attack: 0.25,
  creation: 0.25,
  defense: 0.25,
  physical: 0.25,
};

/**
 * TASK-1820 re-balance for the attacking roles.
 *
 * `physical` is a duel-VOLUME dimension, so it structurally favours defenders and
 * central midfielders — every attacker scores low on it no matter how good they
 * are. Carrying it at 10–15% of an attacker's `overall` capped forwards several
 * points below defenders and let a hard-working winger out-rate a prolific one
 * (Kuijt '08 above Salah '19). Attacking roles now lean on the dimensions that
 * actually describe their job. Defensive weights are unchanged.
 */
export const ROLE_WEIGHTS: Record<PlayerRole, RoleWeights> = {
  GK: { attack: 0.0, creation: 0.05, defense: 0.75, physical: 0.2 },
  RB: { attack: 0.1, creation: 0.2, defense: 0.5, physical: 0.2 },
  LB: { attack: 0.1, creation: 0.2, defense: 0.5, physical: 0.2 },
  CB: { attack: 0.05, creation: 0.05, defense: 0.7, physical: 0.2 },
  CDM: { attack: 0.1, creation: 0.25, defense: 0.45, physical: 0.2 },
  CM: { attack: 0.2, creation: 0.45, defense: 0.25, physical: 0.1 },
  CAM: { attack: 0.35, creation: 0.5, defense: 0.1, physical: 0.05 },
  RM: { attack: 0.3, creation: 0.45, defense: 0.15, physical: 0.1 },
  LM: { attack: 0.3, creation: 0.45, defense: 0.15, physical: 0.1 },
  RW: { attack: 0.5, creation: 0.4, defense: 0.05, physical: 0.05 },
  LW: { attack: 0.5, creation: 0.4, defense: 0.05, physical: 0.05 },
  SS: { attack: 0.55, creation: 0.35, defense: 0.05, physical: 0.05 },
  CF: { attack: 0.6, creation: 0.3, defense: 0.05, physical: 0.05 },
};

export function weightsFor(role: PlayerRole | null): RoleWeights {
  return role == null ? DEFAULT_WEIGHTS : ROLE_WEIGHTS[role];
}

/**
 * A single monotonic scale on `overall`, applied to every player in every season.
 *
 * Monotonic means it CANNOT reorder anyone — it only decides where the 90 line
 * falls, which drives the premium card families in `card-design.ts`. Per-season
 * counts float freely, so a stacked season yields more premium cards.
 *
 * Never turn this into a per-season quota: that would deny a deserving player a
 * premium card purely because their season was crowded.
 */
export const OVERALL_SCALE = 1.0;
