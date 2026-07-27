import { describe, expect, it } from "vitest";

import {
  bandForValue,
  buildMarketValueStrip,
  formatMarketValue,
  marketValueForSeason,
  peakMarketValue,
} from "@/features/players/market-value";

const UNITS = { k: "k", m: "m" };

describe("bandForValue", () => {
  it("maps the seven fixed absolute bands", () => {
    expect(bandForValue(500_000)).toBe(1); // < €1m
    expect(bandForValue(1_000_000)).toBe(2); // €1–5m
    expect(bandForValue(4_999_999)).toBe(2);
    expect(bandForValue(5_000_000)).toBe(3); // €5–15m
    expect(bandForValue(15_000_000)).toBe(4); // €15–30m
    expect(bandForValue(30_000_000)).toBe(5); // €30–60m
    expect(bandForValue(60_000_000)).toBe(6); // €60–100m
    expect(bandForValue(150_000_000)).toBe(7); // €100m+
  });

  it("does NOT normalise per player — the same value is always the same band", () => {
    expect(bandForValue(500_000)).toBe(bandForValue(500_000));
  });
});

describe("formatMarketValue", () => {
  it("prints a currency symbol on every number", () => {
    expect(formatMarketValue(25_000, UNITS)).toBe("€25k");
    expect(formatMarketValue(1_500_000, UNITS)).toBe("€1.5m");
    expect(formatMarketValue(150_000_000, UNITS)).toBe("€150m");
  });

  it("drops a trailing .0 and switches to whole millions at 10m", () => {
    expect(formatMarketValue(2_000_000, UNITS)).toBe("€2m");
    expect(formatMarketValue(12_400_000, UNITS)).toBe("€12m");
  });

  it("uses the supplied unit labels (i18n)", () => {
    expect(formatMarketValue(1_500_000, { k: "ألف", m: "م" })).toBe("€1.5م");
  });

  it("prints sub-thousand values bare", () => {
    expect(formatMarketValue(750, UNITS)).toBe("€750");
  });
});

describe("buildMarketValueStrip", () => {
  const points = [
    { season: 2016, valueEur: 25_000_000, determined: "2016-10-01" },
    { season: 2017, valueEur: 40_000_000, determined: "2017-10-01" },
    { season: 2017, valueEur: 80_000_000, determined: "2018-01-10" },
    { season: 2017, valueEur: 150_000_000, determined: "2018-05-28" },
  ];

  it("collapses each season to its LAST valuation, with the season's spread", () => {
    const strip = buildMarketValueStrip(points, [2017]);
    expect(strip).toHaveLength(2);
    expect(strip[1]).toMatchObject({
      season: 2017,
      valueEur: 150_000_000,
      determined: "2018-05-28",
      points: 3,
      minEur: 40_000_000,
      maxEur: 150_000_000,
      band: 7,
    });
  });

  it("orders seasons oldest-first regardless of input order", () => {
    const strip = buildMarketValueStrip([...points].reverse(), []);
    expect(strip.map((s) => s.season)).toEqual([2016, 2017]);
  });

  it("flags only the seasons the app holds a player row for", () => {
    const strip = buildMarketValueStrip(points, [2017]);
    expect(strip.map((s) => s.isPl)).toEqual([false, true]);
  });

  it("computes the change against the previous season, null for the first", () => {
    const strip = buildMarketValueStrip(points, []);
    expect(strip[0].changePct).toBeNull();
    expect(strip[1].changePct).toBe(500); // 25m → 150m
  });

  it("drops retirement markers and pre-1990 noise", () => {
    const strip = buildMarketValueStrip(
      [
        { season: 2019, valueEur: 1_000_000, determined: "2019-08-01" },
        { season: 0, valueEur: 0, determined: "2020-10-15" },
        { season: 1980, valueEur: 5_000, determined: "1981-01-01" },
      ],
      [],
    );
    expect(strip.map((s) => s.season)).toEqual([2019]);
  });

  it("returns an empty strip for a player with no points", () => {
    expect(buildMarketValueStrip([], [2020])).toEqual([]);
  });
});

const FILE = {
  "2016": { "7": { valueEur: 25_000_000, determined: "2016-10-01" } },
  "2017": { "7": { valueEur: 150_000_000, determined: "2018-05-28" } },
  "2018": { "9": { valueEur: 5_000_000, determined: "2019-01-01" } },
};

describe("marketValueForSeason", () => {
  it("reads one player's value for one season", () => {
    expect(marketValueForSeason(FILE, 2017, 7)).toBe(150_000_000);
  });

  it("returns null for a season the player has no value in", () => {
    expect(marketValueForSeason(FILE, 2018, 7)).toBeNull();
  });

  it("returns null for a missing season or a null file", () => {
    expect(marketValueForSeason(FILE, 1995, 7)).toBeNull();
    expect(marketValueForSeason(null, 2017, 7)).toBeNull();
  });
});

describe("peakMarketValue", () => {
  it("returns the highest value across every season", () => {
    expect(peakMarketValue(FILE, 7)).toBe(150_000_000);
  });

  it("returns null for a player with no values at all", () => {
    expect(peakMarketValue(FILE, 999)).toBeNull();
    expect(peakMarketValue(null, 7)).toBeNull();
  });
});
