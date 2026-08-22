import { NextResponse } from "next/server";
import { getStandings, PREMIER_LEAGUE_ID } from "@/features/leagues/api";
import { logger } from "@/utils/logger";

// ⚠️ Request-driven (it reads searchParams), so this is only about the TIMER: the committed
// JSON behind it cannot change without a deploy, and 60s meant regenerating identical output
// every minute for every distinct query. See tests/unit/route-revalidate.test.ts.
export const revalidate = false;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const season = Number(searchParams.get("season") ?? new Date().getFullYear());
  const league = Number(searchParams.get("league") ?? PREMIER_LEAGUE_ID);

  const data = await getStandings({ league, season });
  if (!data) {
    logger.warn("standings.empty", { season, league });
    return NextResponse.json({ error: "standings_unavailable" }, { status: 502 });
  }

  return NextResponse.json(data);
}
