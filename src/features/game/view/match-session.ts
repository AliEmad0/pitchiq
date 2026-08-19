import { chaosMatchup, type DraftPolicy, type PoolCard } from "@/features/game/domain/chaos-draft";
import type { Formation } from "@/features/game/domain/formation";
import { opponentSetup } from "@/features/game/domain/opponent";
import { runMatch } from "@/features/game/domain/simulate";
import { type GameTeam, makeGameTeam } from "@/features/game/domain/team";
import { createStream } from "./match-stream";

/** Squad spans seasons, so no single season's goal rate applies — stay neutral. */
export const DEFAULT_RATE = 2.7;

export interface SessionNames {
  home: string;
  away: string;
}

/**
 * The opponent half of a match's identity (owner, 2026-08-19).
 *
 * Empty means the shipped behaviour: a random XI out of the coach's own pool, called
 * whatever `names.away` says.
 */
export interface RivalSetup {
  /** How the rival drafts. Absent = the shipped random draw. */
  policy?: DraftPolicy;
  /** The rival's own cards, when the coach chose a club to face. */
  pool?: PoolCard[];
  /** The rival's club name, shown on the scoreboard and the team sheet. */
  name?: string;
}

export interface MatchSession {
  home: GameTeam;
  away: GameTeam;
  seed: number;
  stream: ReturnType<typeof createStream>;
}

/**
 * Assemble a match from a drafted squad — the ONE place that happens.
 *
 * ⚠️ Both the live path and resume-by-replay call this. Two copies of this assembly
 * would drift, and the drift would surface as a fingerprint mismatch that reads like
 * data corruption rather than like the duplicated code it actually is.
 */
export function buildSession(
  pool: PoolCard[],
  players: PoolCard[],
  formation: Formation,
  seed: number,
  names: SessionNames,
  /**
   * Who the coach is playing, and how that side is drafted.
   *
   * ⛔ EVERY field here is part of the match's IDENTITY, and every path that rebuilds the
   * match must pass the same values. Resume and share both re-run `buildSession` and verify
   * the result by fingerprint, so a replay missing any of this drafts a different opponent,
   * produces different events, and presents as a corrupt save rather than as the missing
   * argument it is.
   *
   * ⚠️ The exclusion below is gated on `policy` rather than applied unconditionally, and
   * that is deliberate. Withholding the coach's XI from the home draft changes his BENCH,
   * which would move `/game/draft`, `/game/chaos` and every stored daily challenge — a
   * determinism change three shipped modes never asked for.
   */
  rival: RivalSetup = {},
): MatchSession {
  const matchup = chaosMatchup(
    pool,
    seed,
    { home: names.home, away: names.away },
    {
      opponent: rival.policy,
      rivalPool: rival.pool,
      rivalName: rival.name,
      exclude: rival.policy == null ? undefined : new Set(players.map((p) => p.playerId)),
    },
  );
  const home = makeGameTeam(-1, names.home, 0, formation, players, matchup.home.bench);
  const away = matchup.opponent.kind === "squad" ? matchup.opponent.team : matchup.home;

  const stream = createStream(
    runMatch(
      opponentSetup({
        home,
        homeStyle: matchup.homeStyle,
        opponent: matchup.opponent,
        season: 0,
        seed,
        targetGoalsPerMatch: DEFAULT_RATE,
      }),
    ),
    "home",
  );

  return { home, away, seed, stream };
}
