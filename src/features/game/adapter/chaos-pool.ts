import "server-only";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { CHAOS_PACK } from "@/features/game/domain/rule-packs";
import { buildPool } from "./pool";

/**
 * The Chaos Draft card pool, assembled at BUILD TIME (`/game/chaos` is `force-static`).
 *
 * ⚠️ Now a thin call through the TASK-1810 seam: the season / team / card constants moved
 * into `CHAOS_PACK.pool` as a declarative recipe, and `buildPool` does the work.
 *
 * Chaos is deliberately the seam's SECOND caller. Its 252 cards already shipped, so
 * rebuilding them from a recipe is the control that proves a recipe reproduces a pool the
 * game was serving — a seam validated only by the new mode it was written for proves much
 * less. See `tests/unit/game-pool-builder.test.ts`.
 */
export async function loadChaosPool(): Promise<EnrichedCard[]> {
  return buildPool(CHAOS_PACK.pool);
}
