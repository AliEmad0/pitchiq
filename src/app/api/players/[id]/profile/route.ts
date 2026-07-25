import { NextResponse } from "next/server";

import { getPlayerProfile } from "@/features/players/api";
import { currentDataSeason, parseSeason } from "@/utils/season";
import { logger } from "@/utils/logger";

// Full player-profile-by-season endpoint for the client-side season swap on
// `/players/[id]` (the page renders the current season server-side; historical
// seasons load here). Route Handlers have no `[locale]` segment, so the client
// sends the active locale explicitly via `?locale=` (as the slim route does).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || !Number.isInteger(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const season = parseSeason(searchParams.get("season") ?? undefined, currentDataSeason());
  const locale = searchParams.get("locale") ?? undefined;

  const profile = await getPlayerProfile(id, season, locale);
  if (!profile) {
    logger.info("player-profile.route.not_found", { id, season });
    return NextResponse.json({ error: "player_not_found" }, { status: 404 });
  }

  return NextResponse.json(
    { profile },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
