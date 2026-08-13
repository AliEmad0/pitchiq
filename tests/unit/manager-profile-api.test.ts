import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/data/loaders", () => ({
  loadClubLogos: vi.fn(async () => null),
  loadManagers: vi.fn(),
  loadManagerBios: vi.fn(),
  loadTeams: vi.fn(),
  loadStandings: vi.fn(),
  // TASK-M81 — the enrichment layer. Null here on purpose: this suite covers the
  // league-derived profile, and returning null also exercises the path the 153
  // managers without enrichment take.
  loadManagerEnrichment: vi.fn(async () => null),
  loadManagerHonoursHistory: vi.fn(async () => null),
  loadManagerCareerHistory: vi.fn(async () => null),
}));

import { loadManagers, loadManagerBios, loadTeams, loadStandings } from "../../src/data/loaders";
import { getManagerProfile } from "../../src/features/managers/manager-profile.api";

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const E = (id: string, name: string, o: Record<string, number>) => ({
  id,
  name,
  matches: 0,
  win: 0,
  draw: 0,
  loss: 0,
  gf: 0,
  ga: 0,
  ...o,
});

describe("getManagerProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns career + honours + target season", async () => {
    mock(loadManagers).mockResolvedValue({
      "2008": {
        "33": [
          E("58", "Alex Ferguson", { matches: 38, win: 28, draw: 6, loss: 4, gf: 68, ga: 24 }),
        ],
      },
      "2009": {
        "33": [
          E("58", "Alex Ferguson", { matches: 38, win: 27, draw: 4, loss: 7, gf: 86, ga: 28 }),
        ],
      },
    });
    mock(loadManagerBios).mockResolvedValue({
      "58": { birthDate: "1941-12-31", dateOfDeath: null, nationalityCode: "gb" },
    });
    mock(loadTeams).mockResolvedValue([
      { id: 33, name: "Manchester United", logo: "/logos/33.png" },
    ]);
    mock(loadStandings).mockImplementation(async (s: number) =>
      s === 2008 ? [{ rank: 1, teamId: 33 }] : [{ rank: 2, teamId: 33 }],
    );

    const p = await getManagerProfile("58", 2009);
    expect(p).not.toBeNull();
    expect(p!.name).toBe("Alex Ferguson");
    expect(p!.nationality).toBe("United Kingdom");
    expect(p!.byClub[0]).toMatchObject({
      teamId: 33,
      teamName: "Manchester United",
      teamLogo: "/logos/33.png",
    });
    expect(p!.byClub[0].record.played).toBe(76);
    expect(p!.honours).toEqual([{ season: 2008, teamId: 33, teamName: "Manchester United" }]);
    expect(p!.targetSeason?.season).toBe(2009);
    expect(p!.seasons).toEqual([2009, 2008]);
  });

  it("returns null for an unknown id", async () => {
    mock(loadManagers).mockResolvedValue({
      "2008": { "33": [E("58", "AF", { matches: 1, win: 1, gf: 1 })] },
    });
    mock(loadManagerBios).mockResolvedValue({});
    mock(loadTeams).mockResolvedValue([]);
    mock(loadStandings).mockResolvedValue([]);
    expect(await getManagerProfile("999")).toBeNull();
  });
});
