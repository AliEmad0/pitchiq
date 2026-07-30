import { NextResponse } from "next/server";

import { getManagerProfile } from "@/features/managers/manager-profile.api";
import { currentDataSeason, parseSeason } from "@/utils/season";
import { logger } from "@/utils/logger";

// TASK-M71c — season-scoped manager profile for the client season swap on
// /managers/[id] (the page renders the initial season server-side; other
// seasons load here). Route Handlers have no [locale] segment, so the client
// sends `?locale=` explicitly (the /api/players/[id]/profile pattern).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const season = parseSeason(searchParams.get("season") ?? undefined, currentDataSeason());
  const locale = searchParams.get("locale") ?? undefined;

  const profile = await getManagerProfile(id, season, locale);
  if (!profile) {
    logger.info("manager-profile.route.not_found", { id, season });
    return NextResponse.json({ error: "manager_not_found" }, { status: 404 });
  }

  return NextResponse.json(
    { profile },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
