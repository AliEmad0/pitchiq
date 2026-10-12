import { NextResponse } from "next/server";

import { isArchivedPlayer } from "@/data/archive";
import { buildPlayerArchive, playerSeasonIndex } from "@/features/players/archive.api";

/**
 * TASK-M96 PR B — one archived player (every season, his career record, market value and
 * trivia), as a PRERENDERED static JSON file.
 *
 * ⛔ Same three directives as the match archive, for the same reason: a closed param set means
 * Next writes one file per player at build time and the CDN serves it, so a visit runs no
 * function. A request-time variant would move the storage saving onto Fluid Active CPU — the
 * trade the owner ruled out.
 */
export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = false; // see CLAUDE.md — deploys are the only data change

export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const ids: Array<{ id: string }> = [];
  for (const [id, { seasons }] of await playerSeasonIndex()) {
    if (!isArchivedPlayer(seasons)) continue;
    ids.push({ id: String(id) });
  }
  return ids;
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const archive = /^\d+$/.test(id) ? await buildPlayerArchive(Number(id)) : null;
  // Unreachable while `dynamicParams` is false — kept so the handler's contract does not
  // depend on a directive elsewhere in the file staying put.
  if (archive == null) return NextResponse.json({ error: "unknown_player" }, { status: 404 });
  return NextResponse.json(archive);
}
