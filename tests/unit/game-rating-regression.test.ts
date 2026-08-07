import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Player, Standing } from "@/data/schemas";
import { OUTFIELD_KEYS } from "@/features/game/domain/player-stats";
import { rate } from "@/features/game/domain/rate";
import { makeRatingContext } from "@/features/game/domain/ratings";

/**
 * The assertions that would have caught the original defect. Every case here is a
 * real number the owner rejected on a real card.
 *
 * NOTE the season key: 2018/19 is `2018`. Measuring `2019` judges 2019/20 — a
 * mistake that produced a wrong conclusion about Van Dijk's peak season.
 */

const read = async <T>(file: string): Promise<T> =>
  JSON.parse(await readFile(path.join(process.cwd(), "data", file), "utf8")) as T;

const load = (season: number) => read<Player[]>(`players-${season}.json`);

async function ctxFor(season: number) {
  const [cohort, standings] = await Promise.all([
    load(season),
    read<Standing[]>(`standings-${season}.json`),
  ]);
  return makeRatingContext(season, cohort, standings);
}

const find = (cohort: Player[], name: string): Player => {
  const p = cohort.find((q) => q.name.includes(name));
  if (!p) throw new Error(`fixture player not found: ${name}`);
  return p;
};

const outfielders = (cohort: Player[]) => cohort.filter((p) => p.role != null && p.role !== "GK");

describe("rating model — real-data regressions", () => {
  it("rates Van Dijk 2018/19 as an elite defender, top-5 in the season", async () => {
    const cohort = await load(2018);
    const ctx = await ctxFor(2018);
    const def = rate(find(cohort, "van Dijk"), ctx).ratings.defense;
    expect(def).toBeGreaterThan(85);

    const ranked = outfielders(cohort)
      .map((p) => rate(p, ctx).ratings.defense)
      .sort((a, b) => b - a);
    expect(def).toBeGreaterThanOrEqual(ranked[4]);
  });

  it("ranks Van Dijk above the high-volume defender at a leaky club", async () => {
    const cohort = await load(2018);
    const ctx = await ctxFor(2018);
    expect(rate(find(cohort, "van Dijk"), ctx).ratings.defense).toBeGreaterThan(
      rate(find(cohort, "Tarkowski"), ctx).ratings.defense,
    );
  });

  it("does not give a winger defensive credit for his back line", async () => {
    const cohort = await load(2018);
    const ctx = await ctxFor(2018);
    expect(rate(find(cohort, "Salah"), ctx).ratings.defense).toBeLessThan(15);
  });

  it("stops rating Ronaldo 2007/08 as a top defender", async () => {
    const cohort = await load(2007);
    const ctx = await ctxFor(2007);
    expect(rate(find(cohort, "Ronaldo"), ctx).ratings.defense).toBeLessThan(50);
  });

  it("never rates a goalkeeper as a high attacker", async () => {
    for (const season of [2005, 2019]) {
      const cohort = await load(season);
      const ctx = await ctxFor(season);
      for (const p of cohort.filter((q) => q.role === "GK")) {
        expect(rate(p, ctx).ratings.attack).toBeLessThan(20);
      }
    }
  });

  it("keeps zero-goal outfielders low on attack", async () => {
    const cohort = await load(2018);
    const ctx = await ctxFor(2018);
    const atts = outfielders(cohort)
      .filter((p) => (p.metrics.goals ?? 0) === 0)
      .map((p) => rate(p, ctx).ratings.attack)
      .sort((a, b) => a - b);
    expect(atts[Math.floor(atts.length / 2)]).toBeLessThan(25);
  });

  it("fills the season's top-8 defenders with defensive roles, not forwards", async () => {
    const cohort = await load(2018);
    const ctx = await ctxFor(2018);
    const top = outfielders(cohort)
      .map((p) => ({ role: p.role, def: rate(p, ctx).ratings.defense }))
      .sort((a, b) => b.def - a.def)
      .slice(0, 8);
    const defensive = new Set(["CB", "RB", "LB", "CDM", "CM"]);
    expect(top.every((t) => defensive.has(t.role as string))).toBe(true);
  });
});

describe("data-defect guards", () => {
  it("has no aerial-duel input anywhere in the model", () => {
    // duelsWon - groundDuelsWon is negative for 16 of 49 qualifying CBs in 2018/19.
    expect(OUTFIELD_KEYS.some((k) => /aerial/i.test(k))).toBe(false);
  });

  it("never divides a duel rate by the unreliable `duels` field", async () => {
    const src = await readFile("src/features/game/domain/player-stats.ts", "utf8");
    expect(src).toMatch(/duelPct:\s*successRate\(m\.duelsWon,\s*x\?\.duelsLost\)/);
    // `duels` counts total involvements, not won + lost — never a denominator.
    expect(src).not.toMatch(/x\?\.duels\b(?!Lost)/);
  });
});
