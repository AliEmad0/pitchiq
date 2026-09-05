import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFixtures, loadStandings } from "@/data/loaders";
import { loadClassicSeason } from "@/features/game/adapter/classic-season";
import type { Fixture, Standing } from "@/data/schemas";
vi.mock("@/data/loaders", () => ({ loadFixtures: vi.fn(), loadStandings: vi.fn() }));
vi.mock("@/utils/logger", () => ({ logger: { warn: vi.fn() } }));

const fixtures: Fixture[] = [
  {
    id: "a",
    date: "2003-08-16",
    homeTeamId: 42,
    awayTeamId: 45,
    homeTeamName: "Arsenal",
    awayTeamName: "Everton",
    homeScore: 2,
    awayScore: 0,
    venue: "",
    teamStats: null,
    halfTime: null,
    referee: null,
  },
  {
    id: "b",
    date: "2004-01-07",
    homeTeamId: 45,
    awayTeamId: 42,
    homeTeamName: "Everton",
    awayTeamName: "Arsenal",
    homeScore: 1,
    awayScore: 1,
    venue: "",
    teamStats: null,
    halfTime: null,
    referee: null,
  },
];
const standings: Standing[] = [
  {
    teamId: 42,
    teamName: "Arsenal",
    rank: 1,
    played: 2,
    won: 1,
    drawn: 1,
    lost: 0,
    goalsFor: 3,
    goalsAgainst: 1,
    goalsDiff: 2,
    points: 4,
  },
  {
    teamId: 45,
    teamName: "Everton",
    rank: 2,
    played: 2,
    won: 0,
    drawn: 1,
    lost: 1,
    goalsFor: 1,
    goalsAgainst: 3,
    goalsDiff: -2,
    points: 1,
  },
];
beforeEach(() => {
  vi.mocked(loadFixtures).mockResolvedValue(structuredClone(fixtures));
  vi.mocked(loadStandings).mockResolvedValue(structuredClone(standings));
});
describe("Classic archive boundary", () => {
  it("uses stable club identity regardless of source order", async () => {
    const first = await loadClassicSeason(2003);
    vi.mocked(loadStandings).mockResolvedValue(standings.slice().reverse());
    vi.mocked(loadFixtures).mockResolvedValue(fixtures.slice().reverse());
    expect(await loadClassicSeason(2003)).toEqual(first);
    expect(first?.clubIds).toEqual([42, 45]);
  });
  it("preserves published points adjustments and rank", async () => {
    vi.mocked(loadStandings).mockResolvedValue([
      { ...standings[0], points: 0, rank: 2 },
      { ...standings[1], rank: 1 },
    ]);
    const data = await loadClassicSeason(2003);
    expect(data?.table[0]).toMatchObject({ club: 1, rank: 1, points: 1 });
    expect(data?.table[1]).toMatchObject({ club: 0, rank: 2, points: 0, pointsAdjustment: -4 });
  });
  it("refuses missing or unfinished data", async () => {
    vi.mocked(loadFixtures).mockResolvedValue(null);
    expect(await loadClassicSeason(2003)).toBeNull();
    vi.mocked(loadFixtures).mockResolvedValue([{ ...fixtures[0], homeScore: null }, fixtures[1]]);
    expect(await loadClassicSeason(2003)).toBeNull();
  });
  it("refuses unknown clubs and contradictory standings", async () => {
    vi.mocked(loadFixtures).mockResolvedValue([{ ...fixtures[0], awayTeamId: 99 }, fixtures[1]]);
    expect(await loadClassicSeason(2003)).toBeNull();
    vi.mocked(loadFixtures).mockResolvedValue(fixtures);
    vi.mocked(loadStandings).mockResolvedValue([{ ...standings[0], won: 2 }, standings[1]]);
    expect(await loadClassicSeason(2003)).toBeNull();
  });
});
