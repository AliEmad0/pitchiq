import { NextResponse } from "next/server";

import { loadClubLogos } from "@/data/loaders";

/**
 * TASK-M96 PR B — the season-accurate crest map, ONE prerendered file the archived-player shell
 * loads once. Shipped separately rather than inside each player's JSON: ~10 KB repeated across
 * 4,578 players would have been ~45 MB of duplicates.
 *
 * ⛔ `force-static`: a static file on the CDN, never a function.
 */
export const dynamic = "force-static";
export const revalidate = false; // see CLAUDE.md — deploys are the only data change

export async function GET() {
  return NextResponse.json((await loadClubLogos()) ?? {});
}
