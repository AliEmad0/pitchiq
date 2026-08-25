import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BASE_SEASON,
  TOP50_MEAN_EUR,
  indexFactor,
  indexedCost,
} from "@/features/game/domain/market-index";

describe("market index", () => {
  it("covers 2004-2025 and nothing else", () => {
    const seasons = Object.keys(TOP50_MEAN_EUR)
      .map(Number)
      .sort((a, b) => a - b);
    expect(seasons[0]).toBe(2004);
    expect(seasons.at(-1)).toBe(2025);
    expect(seasons).toHaveLength(22);
    // ⛔ 2003 IS a key in market-values.json, but it holds 6 priced players out of 517.
    // Treating it as a season would price a whole cohort off six data points.
    expect(TOP50_MEAN_EUR[2003]).toBeUndefined();
  });

  it("is the identity at the base season", () => {
    expect(indexFactor(BASE_SEASON)).toBe(1);
  });

  it("returns null for an unpriced season rather than guessing", () => {
    // ⚠️ Null, never 1. A season with no market data is absent, not uninflated — defaulting
    // it to parity would price twelve seasons at face value in 2025 money and make every
    // 1990s card look like a bargain that cannot actually be bought.
    expect(indexFactor(1995)).toBeNull();
    expect(indexFactor(2003)).toBeNull();
    expect(indexedCost(5_000_000, 1995)).toBeNull();
  });

  it("indexes a 2014 price up toward base-season money", () => {
    // Real card: John Terry 2014, rated 95, EUR 5M. The 2014 factor measures ~2.57x.
    const cost = indexedCost(5_000_000, 2014);
    expect(cost).not.toBeNull();
    expect(cost!).toBeGreaterThan(10_000_000);
    expect(cost!).toBeLessThan(16_000_000);
  });

  it("is FROZEN — the committed table still matches the generator", () => {
    const fresh: Record<string, number> = JSON.parse(
      execFileSync("node", ["scripts/gen-market-index.mjs"], { encoding: "utf8" }),
    );
    expect({ ...TOP50_MEAN_EUR }).toEqual(fresh);
  });

  it("has no era to farm — indexed prices stay flat across the window", () => {
    // ⭐ THE property the top-50 basis was chosen for, and the test that would have caught
    // the median basis (which drifts 1.8x). Raw and unindexed this ratio is ~6.4x.
    const mv: Record<string, Record<string, { valueEur: number }>> = JSON.parse(
      readFileSync("data/market-values.json", "utf8"),
    );
    const meanFor = (from: number, to: number) => {
      const costs: number[] = [];
      for (let season = from; season <= to; season++) {
        for (const entry of Object.values(mv[String(season)] ?? {})) {
          const cost = indexedCost(entry.valueEur, season);
          if (cost != null) costs.push(cost);
        }
      }
      return costs.reduce((a, b) => a + b, 0) / costs.length;
    };
    const oldest = meanFor(2004, 2009);
    const newest = meanFor(2021, 2025);
    const drift = Math.max(oldest, newest) / Math.min(oldest, newest);
    expect(drift).toBeLessThan(1.6);
  });
});
