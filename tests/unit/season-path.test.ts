import { describe, expect, it } from "vitest";

import { EARLIEST_SEASON, LATEST_DATA_SEASON } from "@/utils/season";
import { parseSeasonSegment, seasonFromPathname, seasonPath } from "@/utils/season-path";

describe("seasonPath", () => {
  it("builds the season pathname", () => {
    expect(seasonPath(2003)).toBe("/seasons/2003");
  });
});

describe("parseSeasonSegment", () => {
  it("accepts a committed season", () => {
    expect(parseSeasonSegment("2003")).toBe(2003);
    expect(parseSeasonSegment(String(EARLIEST_SEASON))).toBe(EARLIEST_SEASON);
    expect(parseSeasonSegment(String(LATEST_DATA_SEASON))).toBe(LATEST_DATA_SEASON);
  });

  it("rejects out-of-range years", () => {
    expect(parseSeasonSegment(String(EARLIEST_SEASON - 1))).toBeNull();
    expect(parseSeasonSegment(String(LATEST_DATA_SEASON + 1))).toBeNull();
  });

  it("rejects non-numeric and malformed input", () => {
    for (const bad of ["abc", "", "20o3", "2003.5", "-2003", "02003", " 2003"]) {
      expect(parseSeasonSegment(bad)).toBeNull();
    }
  });

  it("round-trips", () => {
    expect(parseSeasonSegment(seasonPath(2010).split("/").pop()!)).toBe(2010);
  });
});

// TASK-M71a — the switcher and both navs derive the viewed season from the
// pathname on the path-model routes.
describe("seasonFromPathname", () => {
  it("extracts a committed season from /seasons/<year>", () => {
    expect(seasonFromPathname("/seasons/2003")).toBe(2003);
  });

  it("returns null for the directory, the dashboard, and other routes", () => {
    for (const p of ["/seasons", "/", "/teams", "/seasons/1985", "/seasons/2003/extra"]) {
      expect(seasonFromPathname(p)).toBeNull();
    }
  });
});
