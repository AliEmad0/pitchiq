import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/teams/api", () => ({
  getTeam: vi.fn(async () => ({ team: { id: 42, name: "Arsenal" }, venue: {} })),
  getSquad: vi.fn(async () => [{ id: 1, name: "P" }]),
  getTeamStats: vi.fn(async () => ({ goals: {} })),
}));
vi.mock("@/features/teams/managers.api", () => ({
  getTeamManagers: vi.fn(async () => []),
}));
vi.mock("@/features/teams/fixtures.api", () => ({
  getTeamRecentFixtures: vi.fn(async () => []),
}));
vi.mock("@/features/leagues/api", () => ({
  getStandings: vi.fn(async () => ({
    league: { standings: [[{ rank: 2, team: { id: 42 } }]] },
  })),
}));

import { getTeam } from "@/features/teams/api";
import { GET } from "@/app/api/teams/[id]/season-view/route";

const req = (url: string) => new Request(url);
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/teams/[id]/season-view", () => {
  it("returns the consolidated season payload with the standings rank", async () => {
    const res = await GET(
      req("http://x/api/teams/42/season-view?season=2003&locale=ar"),
      params("42"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.detail.team.id).toBe(42);
    expect(body.rank).toBe(2);
    expect(Array.isArray(body.squad)).toBe(true);
    expect(Array.isArray(body.fixtures)).toBe(true);
    expect(vi.mocked(getTeam)).toHaveBeenCalledWith(42, 2003, "ar");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=86400");
  });

  it("404s when the team has no data for the season", async () => {
    vi.mocked(getTeam).mockResolvedValueOnce(null);
    const res = await GET(req("http://x/api/teams/42/season-view?season=1993"), params("42"));
    expect(res.status).toBe(404);
  });

  it("400s a non-integer id", async () => {
    const res = await GET(req("http://x/api/teams/abc/season-view"), params("abc"));
    expect(res.status).toBe(400);
  });
});
