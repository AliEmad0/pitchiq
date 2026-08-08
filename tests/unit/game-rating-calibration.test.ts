import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Player, Standing } from "@/data/schemas";
import { PREMIUM_MIN } from "@/features/game/domain/card-design";
import { rate } from "@/features/game/domain/rate";
import { makeRatingContext } from "@/features/game/domain/ratings";

/** The seasons `adapter/chaos-pool.ts` draws the playable card pool from. */
const SEASONS = [1996, 2004, 2008, 2012, 2019, 2023];
const TEAMS_PER_SEASON = 3;
const CARDS_PER_TEAM = 14;

const read = async <T>(f: string): Promise<T> =>
  JSON.parse(await readFile(path.join(process.cwd(), "data", f), "utf8")) as T;

/** Rebuild the chaos pool's card list (ratings only — no bio/photo enrichment). */
async function chaosPoolOveralls(): Promise<number[]> {
  const out: number[] = [];
  for (const season of SEASONS) {
    const cohort = await read<Player[]>(`players-${season}.json`);
    const standings = await read<Standing[]>(`standings-${season}.json`);
    const ctx = makeRatingContext(season, cohort, standings);
    const top = [...standings].sort((a, b) => a.rank - b.rank).slice(0, TEAMS_PER_SEASON);
    for (const row of top) {
      const squad = cohort
        .filter((p) => p.teamId === row.teamId && p.role != null)
        .map((p) => rate(p, ctx).ratings.overall)
        .sort((a, b) => b - a)
        .slice(0, CARDS_PER_TEAM);
      out.push(...squad);
    }
  }
  return out;
}

/** Every qualifying player in a season — the real scale, not a selected subset. */
async function leagueOveralls(season: number): Promise<number[]> {
  const cohort = await read<Player[]>(`players-${season}.json`);
  const standings = await read<Standing[]>(`standings-${season}.json`);
  const ctx = makeRatingContext(season, cohort, standings);
  return cohort
    .filter((p) => p.role != null && (p.metrics.extended?.minutesPlayed ?? 0) >= 600)
    .map((p) => rate(p, ctx).ratings.overall);
}

describe("overall calibration", () => {
  it("keeps a 90 genuinely exceptional league-wide", async () => {
    // On the un-normalised scale a 90 is a generational season, so the league-wide
    // share is well under 1%. The guard is WIDE and one-sided: it exists so a future
    // change cannot silently make everyone a 95, never to deny anyone a card.
    for (const season of [2008, 2018, 2023]) {
      const overalls = await leagueOveralls(season);
      const share = overalls.filter((o) => o >= 90).length / overalls.length;
      expect(share).toBeLessThan(0.05);
    }
  });

  it("spreads a league season across the range instead of bunching at the top", async () => {
    const overalls = await leagueOveralls(2018);
    const mean = overalls.reduce((a, b) => a + b, 0) / overalls.length;
    expect(mean).toBeGreaterThan(45);
    expect(mean).toBeLessThan(75);
    expect(Math.max(...overalls)).toBeLessThanOrEqual(100);
  });

  it("keeps the premium CARD FAMILIES rare on the chaos board", async () => {
    // The visual threshold, distinct from the 90 rating milestone above. At
    // PREMIUM_MIN = 90 roughly a third of the board turned premium after
    // per-position normalisation, which inverted Gold/Onyx from norm to exception.
    const overalls = await chaosPoolOveralls();
    const share = overalls.filter((o) => o >= PREMIUM_MIN).length / overalls.length;
    expect(share).toBeGreaterThan(0.01);
    expect(share).toBeLessThan(0.2);
  });

  it("still reaches the top of the scale for the very best cards", async () => {
    // The counterpart to the rarity guard: 90+ must remain REACHABLE, or the
    // premium card families would never appear at all.
    const overalls = await chaosPoolOveralls();
    expect(overalls.filter((o) => o >= 90).length).toBeGreaterThan(0);
    expect(Math.max(...overalls)).toBeGreaterThan(88);
  });

  it("does not let one era dominate the board", async () => {
    // The pool deliberately mixes six seasons; if one pipeline rated systematically
    // higher, every draft would be that era's players.
    const means: number[] = [];
    for (const season of SEASONS) {
      const cohort = await read<Player[]>(`players-${season}.json`);
      const standings = await read<Standing[]>(`standings-${season}.json`);
      const ctx = makeRatingContext(season, cohort, standings);
      const top = [...standings].sort((a, b) => a.rank - b.rank).slice(0, TEAMS_PER_SEASON);
      const cards: number[] = [];
      for (const row of top) {
        cards.push(
          ...cohort
            .filter((p) => p.teamId === row.teamId && p.role != null)
            .map((p) => rate(p, ctx).ratings.overall)
            .sort((a, b) => b - a)
            .slice(0, CARDS_PER_TEAM),
        );
      }
      means.push(cards.reduce((a, b) => a + b, 0) / cards.length);
    }
    expect(Math.max(...means) - Math.min(...means)).toBeLessThan(12);
  });
});
