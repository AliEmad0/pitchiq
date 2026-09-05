import { chaosDraft, type PoolCard } from "@/features/game/domain/chaos-draft";
import { mulberry32 } from "@/features/game/domain/rng";
import type { GameTeam } from "@/features/game/domain/team";

/**
 * TASK-1811 PR 2 — turning a club chooser into a LEAGUE.
 *
 * ⚠️ This sits in `view/`, not `domain/`, deliberately. `domain/season.ts` is opponent-agnostic
 * and works in club indices; deciding WHICH clubs fill a league, and building their XIs from
 * fetched pools, is the view layer's job — the same split `view/match-session.ts` already keeps.
 */

/**
 * Draw the coach's opponents for a season.
 *
 * ⚠️ Seeded from BOTH the run seed and the coach's club, so two different clubs starting from
 * the same seed do not face an identical league — which would make every save look alike.
 *
 * ⚠️ DEGRADES rather than throwing. A pool too small to fill the league returns everything it
 * has: this runs after the coach has already committed a draft, and an exception there loses
 * his squad. `seasonFixtures` needs an even count, which the caller derives from what comes
 * back rather than from what it asked for.
 */
export function pickOpponents(
  clubs: readonly number[],
  coach: number,
  leagueSize: number,
  seed: number,
): number[] {
  const pool = clubs.filter((c) => c !== coach);
  const want = Math.min(Math.max(leagueSize - 1, 0), pool.length);
  const rng = mulberry32((seed ^ (coach * 2654435761)) >>> 0);
  // Fisher-Yates over a copy, then take the front — draws without replacement by construction,
  // so the same club can never appear twice however large `want` is.
  const bag = [...pool];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  return bag.slice(0, want);
}

/**
 * Build one XI per club from its already-fetched rival pool.
 *
 * ⭐ `policy: "best"` is the policy Legacy ALREADY declares for its single-match opponent, so a
 * league fields exactly the side the mode would have put in front of the coach anyway. Using a
 * different policy here would mean the season and the single match disagreed about how strong
 * a club is.
 *
 * ⚠️ Seeded per club, so a league is reproducible from the run seed alone and no XI needs
 * storing. A club missing from `pools` is skipped rather than faked — the caller decides what
 * a short league means.
 */
export function buildLeagueTeams(
  ids: readonly number[],
  pools: Readonly<Record<number, PoolCard[]>>,
  seed: number,
  nameOf?: (id: number) => string,
): GameTeam[] {
  const out: GameTeam[] = [];
  for (const id of ids) {
    const pool = pools[id];
    if (pool == null || pool.length === 0) continue;
    out.push(
      chaosDraft(pool, (seed + id * 7919) >>> 0, nameOf?.(id) ?? String(id), { policy: "best" }),
    );
  }
  return out;
}

/**
 * The league, with the COACH'S OWN SIDE substituted in at his index.
 *
 * ⛔ This exists because `buildLeagueTeams` runs `chaosDraft`, which picks a formation of its
 * own. That is right for an opponent and WRONG for the coach: a season is "draft once and live
 * with it", so re-drafting his side would field an eleven he never picked, in a shape he never
 * locked, and the whole table would be about a different team.
 *
 * ⚠️ Returns the league unchanged when his id is not in it — a caller that forgot to include
 * him gets a league without him rather than one silently corrupted at index 0.
 */
export function buildSeasonTeams(args: {
  leagueIds: readonly number[];
  pools: Readonly<Record<number, PoolCard[]>>;
  seed: number;
  coachId: number;
  coachTeam: GameTeam;
  nameOf?: (id: number) => string;
}): GameTeam[] {
  const { leagueIds, pools, seed, coachId, coachTeam, nameOf } = args;
  const built = buildLeagueTeams(leagueIds, pools, seed, nameOf);
  const at = leagueIds.indexOf(coachId);
  if (at >= 0 && at < built.length) built[at] = coachTeam;
  return built;
}
