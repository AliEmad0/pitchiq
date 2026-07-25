/**
 * Tests for `GET /api/players/[id]/profile` — the full-profile-by-season
 * endpoint powering the client-side season swap on the player detail page.
 * Runs against committed 2025-26 data via the server-only engine (stubbed).
 */
import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/players/[id]/profile/route";
import { loadPlayers } from "@/data/loaders";
import { currentDataSeason } from "@/utils/season";

function req(id: string, qs = ""): Request {
  return new Request(`http://localhost/api/players/${id}/profile${qs}`);
}
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/players/[id]/profile", () => {
  it("returns the full profile for a known current-season player", async () => {
    const players = await loadPlayers(currentDataSeason());
    const known = String(players![0].id);
    const res = await GET(req(known, `?season=${currentDataSeason()}`), ctx(known));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toMatchObject({ id: Number(known) });
    expect(body.profile).toHaveProperty("metrics");
  });

  it("400s on a non-numeric id", async () => {
    const res = await GET(req("abc"), ctx("abc"));
    expect(res.status).toBe(400);
  });

  it("404s on an unknown id", async () => {
    const res = await GET(req("999999999", "?season=2025"), ctx("999999999"));
    expect(res.status).toBe(404);
  });

  it("sets a public cache-control header", async () => {
    const players = await loadPlayers(currentDataSeason());
    const known = String(players![0].id);
    const res = await GET(req(known, `?season=${currentDataSeason()}`), ctx(known));
    expect(res.headers.get("cache-control")).toMatch(/public/);
  });
});
