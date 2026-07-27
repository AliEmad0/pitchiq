import { describe, expect, it } from "vitest";

import { loadMarketValueHistory, loadMarketValues } from "@/data/loaders";
import { MarketValueFileSchema, MarketValueHistoryFileSchema } from "@/data/schemas";

describe("MarketValueFileSchema", () => {
  it("accepts the committed season → id → point shape", () => {
    const parsed = MarketValueFileSchema.parse({
      "2003": { "1004102": { determined: "2004-10-04", valueEur: 2000000 } },
    });
    expect(parsed["2003"]["1004102"].valueEur).toBe(2000000);
  });

  it("rejects a non-numeric value", () => {
    expect(() =>
      MarketValueFileSchema.parse({
        "2003": { "1": { determined: "2004-10-04", valueEur: "2m" } },
      }),
    ).toThrow();
  });
});

describe("MarketValueHistoryFileSchema", () => {
  it("accepts the committed id → points[] shape", () => {
    const parsed = MarketValueHistoryFileSchema.parse({
      "1000000": [{ determined: "2019-09-25", season: 2019, valueEur: 2500000 }],
    });
    expect(parsed["1000000"]).toHaveLength(1);
    expect(parsed["1000000"][0].season).toBe(2019);
  });

  it("rejects a point missing `season`", () => {
    expect(() =>
      MarketValueHistoryFileSchema.parse({
        "1": [{ determined: "2019-09-25", valueEur: 1 }],
      }),
    ).toThrow();
  });
});

describe("market-value loaders (against the committed data)", () => {
  it("loads and validates data/market-values.json", async () => {
    const file = await loadMarketValues();
    expect(file).not.toBeNull();
    // The clip (spec §3.1) keeps this well under the unclipped 39,699 entries.
    const entries = Object.values(file!).reduce(
      (n, bySeason) => n + Object.keys(bySeason).length,
      0,
    );
    expect(entries).toBeGreaterThan(10_000);
    expect(entries).toBeLessThan(15_000);
  });

  it("loads and validates data/market-value-history.json", async () => {
    const file = await loadMarketValueHistory();
    expect(file).not.toBeNull();
    expect(Object.keys(file!).length).toBeGreaterThan(4_000);
  });
});
