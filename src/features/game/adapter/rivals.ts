import "server-only";
import { packFor } from "@/features/game/domain/rule-packs";
import {
  selectRivalCandidates,
  toRivalCard,
  type RivalPool,
} from "@/features/game/domain/rival-pool";
import { buildPool, clubChoices } from "./pool";

/**
 * TASK-1810 follow-up — one club's squad, small enough to fetch (owner, 2026-08-19).
 *
 * ⛔ Built from `buildPool`, never from a second read of the data. A hand-written generator
 * beside it is the shape that drifts: the pages would draft from one selection of cards and
 * the rival from another, and the two would diverge silently the first time the rating
 * pipeline moved.
 */
export async function buildRivalPool(teamId: number): Promise<RivalPool | null> {
  const legacy = packFor("legacy");
  if (legacy == null) return null;
  const club = (await clubChoices()).find((c) => c.id === teamId);
  if (club == null) return null;

  const pool = await buildPool(legacy.pool, teamId);
  return {
    teamId,
    name: club.name,
    cards: selectRivalCandidates(pool).map(toRivalCard),
  };
}
