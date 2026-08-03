import "server-only";
import { loadStandings } from "@/data/loaders";
import type { MatchResult } from "@/features/game/domain/match-types";
import { simulate } from "@/features/game/domain/simulate";
import { makeGameTeam } from "@/features/game/domain/team";
import { loadRatedSquad } from "./ratings";

const DEFAULT_RATE = 2.7;

/** Season-authentic goals/match = 2 · Σ goalsFor / Σ played. */
export async function loadSeasonGoalRate(season: number): Promise<number> {
  const standings = await loadStandings(season);
  if (!standings || standings.length === 0) return DEFAULT_RATE;
  const gf = standings.reduce((s, r) => s + r.goalsFor, 0);
  const played = standings.reduce((s, r) => s + r.played, 0);
  return played > 0 ? (2 * gf) / played : DEFAULT_RATE;
}

/**
 * Smoke path: rate both squads, take the first 11 as a rough XI (full draft/slot
 * assembly is TASK-1806), simulate at the season-authentic rate. null if a squad is absent.
 */
export async function simulateSeasonMatch(
  homeTeamId: number,
  awayTeamId: number,
  season: number,
  seed: number,
): Promise<MatchResult | null> {
  const [homeSquad, awaySquad] = await Promise.all([
    loadRatedSquad(homeTeamId, season),
    loadRatedSquad(awayTeamId, season),
  ]);
  if (!homeSquad || !awaySquad || homeSquad.length === 0 || awaySquad.length === 0) return null;

  const rate = await loadSeasonGoalRate(season);
  const emptyFormation = { name: "", season, slots: [] };
  const home = makeGameTeam(homeTeamId, "", season, emptyFormation, homeSquad.slice(0, 11));
  const away = makeGameTeam(awayTeamId, "", season, emptyFormation, awaySquad.slice(0, 11));
  return simulate({ home, away, seed, targetGoalsPerMatch: rate });
}
