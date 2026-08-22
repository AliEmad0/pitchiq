import { NextResponse } from "next/server";

import {
  getTopAssists,
  getTopRedCards,
  getTopScorers,
  getTopYellowCards,
} from "@/features/players/leaderboards.api";
import { logger } from "@/utils/logger";

// ⚠️ Request-driven (it reads searchParams), so this is only about the TIMER: the committed
// JSON behind it cannot change without a deploy, and 60s meant regenerating identical output
// every minute for every distinct query. See tests/unit/route-revalidate.test.ts.
export const revalidate = false;

type Slug = "scorers" | "assists" | "yellow-cards" | "red-cards";

const FETCHER_BY_SLUG: Record<Slug, (args: { season: number }) => Promise<unknown>> = {
  scorers: getTopScorers,
  assists: getTopAssists,
  "yellow-cards": getTopYellowCards,
  "red-cards": getTopRedCards,
};

function isSlug(s: string): s is Slug {
  return s in FETCHER_BY_SLUG;
}

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isSlug(kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const season = Number(searchParams.get("season") ?? new Date().getFullYear());

  const data = await FETCHER_BY_SLUG[kind]({ season });
  if (!data) {
    logger.warn("leaderboard.route.empty", { kind, season });
    return NextResponse.json({ error: "leaderboard_unavailable" }, { status: 502 });
  }

  return NextResponse.json(data);
}
