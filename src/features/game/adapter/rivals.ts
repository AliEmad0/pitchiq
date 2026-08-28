import "server-only";
import { packFor } from "@/features/game/domain/rule-packs";
import {
  selectNationRivalCandidates,
  selectRivalCandidates,
  toRivalCard,
  type RivalPool,
} from "@/features/game/domain/rival-pool";
import { countryNameFromCode } from "@/utils/country";
import { buildPool, clubChoices, nationChoices } from "./pool";

/**
 * TASK-1810 follow-up — one club's squad, small enough to fetch (owner, 2026-08-19).
 *
 * ⛔ Built from `buildPool`, never from a second read of the data. A hand-written generator
 * beside it is the shape that drifts: the pages would draft from one selection of cards and
 * the rival from another, and the two would diverge silently the first time the rating
 * pipeline moved.
 */
export async function buildRivalPool(teamId: number | string): Promise<RivalPool | null> {
  // A string key is a NATION's flag-icons code (TASK-1842) — its squad comes off the same
  // rings pool the coach drafts from, selected ring-aware so an "Egypt" rival never fields
  // the pool's world-fill goalkeeper. See `selectNationRivalCandidates`.
  if (typeof teamId === "string") {
    const nation = packFor("nation");
    if (nation == null) return null;
    if (!(await nationChoices()).some((n) => n.code === teamId)) return null;
    const pool = await buildPool(nation.pool, teamId);
    return {
      teamId,
      name: countryNameFromCode(teamId) ?? teamId,
      cards: selectNationRivalCandidates(pool, teamId).map(toRivalCard),
    };
  }

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
