import { NextResponse } from "next/server";

import { isArchivedSeason } from "@/data/archive";
import { getAvailableSeasons, loadFixtures } from "@/data/loaders";
import { getFixtureDetail } from "@/features/leagues/fixture-detail.api";

/**
 * TASK-M96 — one archived match's detail, as a PRERENDERED static JSON file.
 *
 * ⛔ The three directives below are the whole point. With a closed `generateStaticParams` and
 * `dynamicParams = false`, Next writes one file per match at build time and the CDN serves it:
 * a visit runs NO function, so the archive adds nothing to Fluid Active CPU, function
 * invocations or ISR writes (the 2026-08-29 scraper burned 145,000 of 200,000 ISR writes on
 * exactly these URLs when they were rendered on demand). A request-time variant of this route
 * would move the storage bill onto the CPU bill — the trade the owner ruled out.
 *
 * The body is the same `FixtureDetail` the prerendered page renders, so the archive shell can
 * hand it to the shared `FixtureDetailView` unchanged. Names are English: Arabic is parked
 * (`routing.locales` is `["en"]`), and `getEntityNames` falls back to identity outside a
 * request's locale. Restoring Arabic needs a per-locale variant of this route.
 */
export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = false; // see CLAUDE.md — deploys are the only data change

export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const ids: Array<{ id: string }> = [];
  for (const season of await getAvailableSeasons()) {
    if (!isArchivedSeason(season)) continue;
    for (const f of (await loadFixtures(season)) ?? []) ids.push({ id: f.id });
  }
  return ids;
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const detail = await getFixtureDetail(id);
  // Unreachable while `dynamicParams` is false — kept so the handler's contract does not
  // depend on a directive elsewhere in the file staying put.
  if (detail == null) return NextResponse.json({ error: "unknown_fixture" }, { status: 404 });
  return NextResponse.json(detail);
}
