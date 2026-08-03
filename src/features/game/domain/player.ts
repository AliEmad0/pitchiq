import type { PlayerRole } from "@/data/schemas";
import type { PlayerSeasonId } from "./card-id";
import type { PlayerRatings, Provenance } from "./ratings";

export type { PlayerRole } from "@/data/schemas";
export type Foot = "left" | "right" | "both";

/** A player-season card. Ratings/provenance are filled by TASK-1802. */
export interface GamePlayer {
  cardId: PlayerSeasonId;
  playerId: number;
  season: number;
  name: string;
  role: PlayerRole | null;
  altRoles: PlayerRole[];
  foot: Foot | null;
  height: number | null;
  ratings: PlayerRatings | null;
  provenance: Provenance | null;
}
