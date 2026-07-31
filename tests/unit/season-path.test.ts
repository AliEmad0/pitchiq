import { describe, expect, it } from "vitest";

import { EARLIEST_SEASON, LATEST_DATA_SEASON } from "@/utils/season";
import {
  navHrefForSeason,
  parseSeasonSegment,
  seasonFromPathname,
  seasonNavTarget,
  seasonPath,
} from "@/utils/season-path";

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

// TASK-M71a/b — the switcher and both navs derive the viewed season from the
// pathname on the path-model routes. Paths are locale-stripped (next-intl
// usePathname), so no `/ar` handling here.
describe("seasonFromPathname", () => {
  it("extracts a committed season from /seasons/<year> and /seasons/<year>/<section>", () => {
    expect(seasonFromPathname("/seasons/2003")).toBe(2003);
    expect(seasonFromPathname("/seasons/2003/teams")).toBe(2003); // TASK-M71b
    expect(seasonFromPathname("/seasons/2010/players")).toBe(2010);
  });

  it("returns null for the directory, the dashboard, bare indexes, and invalid years", () => {
    for (const p of ["/seasons", "/", "/teams", "/players", "/seasons/1985"]) {
      expect(seasonFromPathname(p)).toBeNull();
    }
  });
});

// TASK-M71b — where the switcher navigates when it picks `season` while viewing
// `pathname` (locale-stripped). Current season → the bare URL.
describe("seasonNavTarget", () => {
  it("navigates a section index within the path", () => {
    expect(seasonNavTarget("/teams", 2003, 2025)).toBe("/seasons/2003/teams");
    expect(seasonNavTarget("/seasons/2010/players", 2003, 2025)).toBe("/seasons/2003/players");
  });
  it("returns the bare URL for the current season", () => {
    expect(seasonNavTarget("/seasons/2003/teams", 2025, 2025)).toBe("/teams");
    expect(seasonNavTarget("/", 2025, 2025)).toBe("/");
  });
  it("navigates the dashboard for non-section routes", () => {
    expect(seasonNavTarget("/", 2003, 2025)).toBe("/seasons/2003");
    expect(seasonNavTarget("/seasons/2003", 2010, 2025)).toBe("/seasons/2010");
  });
});

// TASK-M71b — the nav href for a bare NAV_ITEMS href given the viewed season.
describe("navHrefForSeason", () => {
  it("puts the viewed historical season in the path", () => {
    expect(navHrefForSeason("/teams", 2003, 2025)).toBe("/seasons/2003/teams");
    expect(navHrefForSeason("/", 2003, 2025)).toBe("/seasons/2003");
  });
  it("keeps the bare href for the current season or no season", () => {
    expect(navHrefForSeason("/teams", 2025, 2025)).toBe("/teams");
    expect(navHrefForSeason("/teams", null, 2025)).toBe("/teams");
  });
  it("leaves non-season routes bare", () => {
    expect(navHrefForSeason("/compare", 2003, 2025)).toBe("/compare");
    expect(navHrefForSeason("/map", 2003, 2025)).toBe("/map");
  });
});
