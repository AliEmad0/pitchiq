import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/data/loaders", () => ({
  loadClubLogos: vi.fn(async () => null),
  loadTeamColors: vi.fn(async () => null),
  loadPlayers: vi.fn(),
  loadTeams: vi.fn(),
  loadMarketValues: vi.fn(async () => null),
}));

import { loadPlayers, loadTeams, loadTeamColors, loadMarketValues } from "../../src/data/loaders";
import { getSeasonPlayers, pickClubAccent } from "../../src/features/players/players-index.api";

const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const metrics = (o: Partial<{ goals: number; assists: number; appearances: number }>) => ({
  appearances: o.appearances ?? null,
  goals: o.goals ?? null,
  assists: o.assists ?? null,
  passAccuracy: null,
  keyPasses: null,
  tackles: null,
  interceptions: null,
  duelsWon: null,
  dribblesCompleted: null,
  shotsOnTarget: null,
  yellowCards: null,
  redCards: null,
});

describe("getSeasonPlayers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds rows with contributions = goals + assists, sorted desc, joined to club logo", async () => {
    mock(loadPlayers).mockResolvedValue([
      {
        id: 1,
        name: "Striker",
        teamId: 40,
        teamName: "Liverpool",
        position: "Forward",
        photo: "1",
        nationality: "Egypt",
        nationalityCode: "eg",
        metrics: metrics({ goals: 20, assists: 10, appearances: 38 }),
      },
      {
        id: 2,
        name: "Mid",
        teamId: 33,
        teamName: "Man Utd",
        position: "Midfielder",
        photo: "2",
        nationality: "England",
        nationalityCode: "gb-eng",
        metrics: metrics({ goals: 5, assists: 5, appearances: 30 }),
      },
    ]);
    mock(loadTeams).mockResolvedValue([
      { id: 40, name: "Liverpool", logo: "/logos/40.png" },
      { id: 33, name: "Man Utd", logo: "/logos/33.png" },
    ]);

    const rows = await getSeasonPlayers(2024);
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => r.id)).toEqual([1, 2]); // 30 vs 10 contributions
    expect(rows![0]).toMatchObject({
      contributions: 30,
      goals: 20,
      assists: 10,
      appearances: 38,
      teamLogo: "/logos/40.png",
      nationalityCode: "eg",
    });
  });

  it("null-coalesces missing metrics to 0", async () => {
    mock(loadPlayers).mockResolvedValue([
      {
        id: 3,
        name: "GK",
        teamId: 40,
        teamName: "Liverpool",
        position: "Goalkeeper",
        photo: null,
        nationality: null,
        nationalityCode: null,
        metrics: metrics({}),
      },
    ]);
    mock(loadTeams).mockResolvedValue([{ id: 40, name: "Liverpool", logo: "/logos/40.png" }]);
    const rows = await getSeasonPlayers(2024);
    expect(rows![0]).toMatchObject({ goals: 0, assists: 0, appearances: 0, contributions: 0 });
  });

  it("returns null when there are no players for the season", async () => {
    mock(loadPlayers).mockResolvedValue(null);
    mock(loadTeams).mockResolvedValue([]);
    expect(await getSeasonPlayers(1800)).toBeNull();
  });

  it("joins each row's team accent colour from the kit map", async () => {
    mock(loadPlayers).mockResolvedValue([
      {
        id: 1,
        name: "Striker",
        teamId: 40,
        teamName: "Liverpool",
        position: "Forward",
        photo: "1",
        nationality: "Egypt",
        nationalityCode: "eg",
        metrics: metrics({ goals: 1 }),
      },
    ]);
    mock(loadTeamColors).mockResolvedValue({ "40": { home: "#C8102E", away: "#F6EB61" } });
    const rows = await getSeasonPlayers(2024);
    expect(rows![0].teamColor).toBe("#C8102E");
  });

  it("joins each row's market value for the season, null when absent (TASK-M68)", async () => {
    mock(loadPlayers).mockResolvedValue([
      {
        id: 1,
        name: "Valued",
        teamId: 40,
        teamName: "Liverpool",
        position: "Forward",
        photo: "1",
        nationality: "Egypt",
        nationalityCode: "eg",
        metrics: metrics({ goals: 1 }),
      },
      {
        id: 2,
        name: "Unmatched",
        teamId: 40,
        teamName: "Liverpool",
        position: "Forward",
        photo: "2",
        nationality: "England",
        nationalityCode: "gb-eng",
        metrics: metrics({ goals: 0 }),
      },
    ]);
    mock(loadTeamColors).mockResolvedValue(null);
    mock(loadMarketValues).mockResolvedValue({
      "2024": { "1": { valueEur: 45_000_000, determined: "2025-05-01" } },
    });
    const rows = await getSeasonPlayers(2024);
    expect(rows!.find((r) => r.id === 1)!.marketValueEur).toBe(45_000_000);
    expect(rows!.find((r) => r.id === 2)!.marketValueEur).toBeNull();
  });

  it("leaves every value null when the market-value map is absent (TASK-M68)", async () => {
    mock(loadPlayers).mockResolvedValue([
      {
        id: 1,
        name: "Striker",
        teamId: 40,
        teamName: "Liverpool",
        position: "Forward",
        photo: "1",
        nationality: "Egypt",
        nationalityCode: "eg",
        metrics: metrics({ goals: 1 }),
      },
    ]);
    mock(loadTeamColors).mockResolvedValue(null);
    mock(loadMarketValues).mockResolvedValue(null);
    const rows = await getSeasonPlayers(2024);
    expect(rows![0].marketValueEur).toBeNull();
  });
});

describe("pickClubAccent", () => {
  it("uses the home kit when it isn't near-white", () => {
    expect(pickClubAccent("#C8102E", "#F6EB61")).toBe("#C8102E");
  });
  it("falls back to the away kit for a near-white home kit", () => {
    expect(pickClubAccent("#FFFFFF", "#1D428A")).toBe("#1D428A");
  });
  it("returns null when neither kit is usable", () => {
    expect(pickClubAccent("#FFFFFF", null)).toBeNull();
    expect(pickClubAccent(null, undefined)).toBeNull();
    expect(pickClubAccent("not-a-hex", "")).toBeNull();
  });
});
