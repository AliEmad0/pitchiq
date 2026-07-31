import { NextResponse } from "next/server";

import { getStandings } from "@/features/leagues/api";
import { getSquad, getTeam, getTeamStats } from "@/features/teams/api";
import { getTeamRecentFixtures } from "@/features/teams/fixtures.api";
import { getTeamManagers } from "@/features/teams/managers.api";
import { currentDataSeason, parseSeason } from "@/utils/season";
import { logger } from "@/utils/logger";

// TASK-M71c — everything the /teams/[id] season subtree needs, in one round
// trip, for the client-side season swap (<TeamSeasonView>). The page renders
// the initial season server-side; other seasons load here. Route Handlers
// have no [locale] segment, so the client sends `?locale=` explicitly (the
// /api/players/[id]/profile pattern). Trivia stays on /api/trivia?scope=team.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || !Number.isInteger(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const season = parseSeason(searchParams.get("season") ?? undefined, currentDataSeason());
  const locale = searchParams.get("locale") ?? undefined;

  const [detail, standings, managers, stats, fixtures, squad] = await Promise.all([
    getTeam(id, season, locale),
    getStandings({ season }),
    getTeamManagers(season, id, locale),
    getTeamStats(season, id),
    getTeamRecentFixtures(season, id),
    getSquad(id, season, locale),
  ]);

  if (!detail) {
    logger.info("team-season-view.route.not_found", { id, season });
    return NextResponse.json({ error: "team_not_found" }, { status: 404 });
  }

  const rank = standings?.league.standings[0]?.find((row) => row.team.id === id)?.rank ?? null;

  return NextResponse.json(
    { detail, rank, managers, stats, fixtures: fixtures ?? [], squad },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
