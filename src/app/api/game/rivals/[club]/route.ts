import { NextResponse } from "next/server";
import { buildRivalPool } from "@/features/game/adapter/rivals";
import { clubChoices, nationChoices } from "@/features/game/adapter/pool";

/**
 * TASK-1810 follow-up — one club's squad, as a PRERENDERED static file.
 *
 * ⛔ `force-static` + a closed param set is what makes this affordable, and it is the same
 * rule every `/game/*` page follows. With `generateStaticParams` and `dynamicParams = false`
 * Next writes one JSON file per club at build time and the CDN serves it; nothing here ever
 * runs on a request. Without them this would be a lambda per fetch — the exact shape that
 * caused the 2026-07 Fluid Active-CPU pause.
 *
 * ⚠️ A route rather than a committed file in `public/`, deliberately. The pool has ONE source
 * of truth (`buildPool`), and a generator script writing a checked-in artefact beside it is
 * the arrangement that drifts: the club pages would draft from one selection and the rival
 * from a stale copy, silently, the first time the rating pipeline moved.
 *
 * ⚠️ Outside `/game/*` because a `rivals` segment under it would shadow `/game/[mode]` — and
 * this is data, not a screen.
 */
export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = false; // see docs/adr or CLAUDE.md — deploys are the only data change

export async function generateStaticParams(): Promise<Array<{ club: string }>> {
  // Clubs by numeric id, nations by flag-icons code (TASK-1842) — one closed set, one file
  // each at build time. The codes are non-numeric, so the two namespaces cannot collide.
  const [clubs, nations] = await Promise.all([clubChoices(), nationChoices()]);
  return [...clubs.map((c) => ({ club: String(c.id) })), ...nations.map((n) => ({ club: n.code }))];
}

export async function GET(_request: Request, ctx: { params: Promise<{ club: string }> }) {
  const { club } = await ctx.params;
  const pool = await buildRivalPool(/^\d+$/.test(club) ? Number(club) : club);
  // Unreachable while `dynamicParams` is false — kept because the handler's contract should
  // not depend on a directive elsewhere in the file staying put.
  if (pool == null) return NextResponse.json({ error: "unknown_club" }, { status: 404 });
  return NextResponse.json(pool);
}
