import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Player, Standing } from "@/data/schemas";
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

describe("overall calibration", () => {
  it("keeps premium (90+) cards rare but reachable across the pool", async () => {
    const overalls = await chaosPoolOveralls();
    const share = overalls.filter((o) => o >= 90).length / overalls.length;
    // A WIDE regression guard, not a quota. It exists so a future change cannot
    // silently make everyone a 95 — never to deny a deserving player a card. The
    // scale on `overall` is monotonic, so it can move this line but never reorder.
    expect(share).toBeGreaterThan(0.005);
    expect(share).toBeLessThan(0.15);
  });

  it("spreads cards across the range instead of bunching at the top", async () => {
    const overalls = await chaosPoolOveralls();
    const mean = overalls.reduce((a, b) => a + b, 0) / overalls.length;
    expect(mean).toBeGreaterThan(55);
    expect(mean).toBeLessThan(80);
    expect(Math.max(...overalls)).toBeLessThanOrEqual(100);
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
