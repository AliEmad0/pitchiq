import "server-only";
import { loadPlayer, loadPlayers, loadSquad, loadStandings } from "@/data/loaders";
import type { GamePlayer } from "@/features/game/domain/player";
import { rate } from "@/features/game/domain/rate";
import { type RatingContext, makeRatingContext } from "@/features/game/domain/ratings";
import { toGamePlayer } from "./player";

/**
 * Load the shared per-season inputs the rating pipelines need. null = unsupported season.
 *
 * `makeRatingContext` computes the season's ranking pools ONCE. Callers that rate many
 * players (the chaos pool builds ~250 cards across six seasons at build time) must reuse
 * one context — building pools per player is quadratic.
 */
export async function buildRatingContext(season: number): Promise<RatingContext | null> {
  const cohort = await loadPlayers(season);
  if (cohort === null) return null;
  const standings = (await loadStandings(season)) ?? [];
  return makeRatingContext(season, cohort, standings);
}

/** One rated player-season card, or null if the player/season is absent. */
export async function rateGamePlayer(playerId: number, season: number): Promise<GamePlayer | null> {
  const player = await loadPlayer(playerId, season);
  if (player === null) return null;
  const ctx = await buildRatingContext(season);
  if (ctx === null) return null;
  return { ...toGamePlayer(player, season), ...rate(player, ctx) };
}

/** A team's rated cards. null = unsupported season; [] = team absent that season. */
export async function loadRatedSquad(teamId: number, season: number): Promise<GamePlayer[] | null> {
  const squad = await loadSquad(teamId, season);
  if (squad === null) return null;
  const ctx = await buildRatingContext(season);
  if (ctx === null) return null;
  return squad.map((p) => ({ ...toGamePlayer(p, season), ...rate(p, ctx) }));
}
