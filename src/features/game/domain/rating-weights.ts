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

export const ROLE_WEIGHTS: Record<PlayerRole, RoleWeights> = {
  GK: { attack: 0.0, creation: 0.05, defense: 0.75, physical: 0.2 },
  RB: { attack: 0.1, creation: 0.2, defense: 0.5, physical: 0.2 },
  LB: { attack: 0.1, creation: 0.2, defense: 0.5, physical: 0.2 },
  CB: { attack: 0.05, creation: 0.05, defense: 0.7, physical: 0.2 },
  CDM: { attack: 0.1, creation: 0.25, defense: 0.45, physical: 0.2 },
  CM: { attack: 0.2, creation: 0.4, defense: 0.25, physical: 0.15 },
  CAM: { attack: 0.35, creation: 0.45, defense: 0.1, physical: 0.1 },
  RM: { attack: 0.3, creation: 0.4, defense: 0.15, physical: 0.15 },
  LM: { attack: 0.3, creation: 0.4, defense: 0.15, physical: 0.15 },
  RW: { attack: 0.45, creation: 0.35, defense: 0.05, physical: 0.15 },
  LW: { attack: 0.45, creation: 0.35, defense: 0.05, physical: 0.15 },
  SS: { attack: 0.55, creation: 0.3, defense: 0.05, physical: 0.1 },
  CF: { attack: 0.6, creation: 0.25, defense: 0.05, physical: 0.1 },
};

export function weightsFor(role: PlayerRole | null): RoleWeights {
  return role == null ? DEFAULT_WEIGHTS : ROLE_WEIGHTS[role];
}
