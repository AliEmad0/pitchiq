import { chaosMatchup, type PoolCard } from "@/features/game/domain/chaos-draft";
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
): MatchSession {
  const matchup = chaosMatchup(pool, seed, { home: names.home, away: names.away });
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
