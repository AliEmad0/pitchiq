import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/data/loaders", () => ({
  getAvailableSeasons: vi.fn(),
  loadStandings: vi.fn(),
}));

import { getAvailableSeasons, loadStandings } from "@/data/loaders";
import { getSeasonChampions } from "@/features/seasons/season-champions";

// The real Standing row is flat: { rank, teamId, teamName, ... } — the loader
// returns Standing[] | null, not a nested league object.
const row = (teamId: number, teamName: string, rank: number) => ({ rank, teamId, teamName });

describe("getSeasonChampions", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the rank-1 team per season, newest first", async () => {
    vi.mocked(getAvailableSeasons).mockResolvedValue([2003, 2002]);
    vi.mocked(loadStandings).mockImplementation(async (season: number) =>
      season === 2003
        ? ([row(42, "Arsenal", 1), row(33, "Man Utd", 2)] as never)
        : ([row(33, "Man Utd", 1)] as never),
    );

    expect(await getSeasonChampions()).toEqual([
      { season: 2003, champion: { id: 42, name: "Arsenal" } },
      { season: 2002, champion: { id: 33, name: "Man Utd" } },
    ]);
  });

  it("keeps the season with a null champion when standings are missing", async () => {
    vi.mocked(getAvailableSeasons).mockResolvedValue([2003]);
    vi.mocked(loadStandings).mockResolvedValue(null as never);

    expect(await getSeasonChampions()).toEqual([{ season: 2003, champion: null }]);
  });

  it("keeps the season with a null champion when no row has rank 1", async () => {
    vi.mocked(getAvailableSeasons).mockResolvedValue([2003]);
    vi.mocked(loadStandings).mockResolvedValue([row(42, "Arsenal", 2)] as never);

    expect(await getSeasonChampions()).toEqual([{ season: 2003, champion: null }]);
  });
});
