import { chaosMatchup, type DraftPolicy, type PoolCard } from "@/features/game/domain/chaos-draft";
import type { Formation } from "@/features/game/domain/formation";
import { chemistry, type Linkable } from "@/features/game/domain/chemistry";
import { chemistryModifier } from "@/features/game/domain/chemistry-modifier";
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
  /**
   * The rival's spending cap, for `policy: "budget"` (TASK-1810 Budget Cap).
   *
   * ⛔ Identity, like every other field here. Omitting it does not disable the budget — it
   * makes the rival's ceiling Infinity, so `"budget"` silently becomes best-available and the
   * coach's €100M XI (mean 80.8) faces the unlimited ceiling XI (mean 94.0).
   */
  budget?: number;
  /**
   * Score both XIs on chemistry and let it weigh on the match (TASK-1810 PR 5).
   *
   * ⛔ IDENTITY, like every other field here, so it must reach EVERY path that rebuilds the
   * match — live, resume and share alike. A replay without it plays a different game and,
   * because replay verifies by fingerprint, surfaces as "your saved match is corrupt" rather
   * than as the missing flag it is. That defect has shipped twice already (the `opponent`
   * policy, then Budget Cap's `budget`), which is why this rides the same seam they do.
   *
   * ⚠️ Only a FLAG travels. The scores themselves are derived from the two XIs, which every
   * path already carries — so nothing new goes into IndexedDB or the share code, and the
   * codec needs no version bump.
   */
  chemistry?: boolean;
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
      budget: rival.budget,
      exclude: rival.policy == null ? undefined : new Set(players.map((p) => p.playerId)),
    },
  );
  /**
   * `players` is the whole SQUAD, XI first then any drafted bench (TASK-1810 Budget Cap).
   *
   * ⭐ The split happens HERE and nowhere else, which is what makes the drafted bench survive
   * every path for free: storage, the share code and both replays all carry one ordered list
   * of card ids, and only this function needs to know where the eleven end.
   *
   * ⚠️ An empty tail means the mode drafts an XI only, and the bench stays the auto-drafted
   * one — so `/game/draft`, `/game/chaos`, Legacy and the daily are untouched.
   */
  const xi = players.slice(0, formation.slots.length);
  const drafted = players.slice(formation.slots.length);
  const home = makeGameTeam(
    -1,
    names.home,
    0,
    formation,
    xi,
    drafted.length > 0 ? drafted : matchup.home.bench,
  );
  const away = matchup.opponent.kind === "squad" ? matchup.opponent.team : matchup.home;

  /**
   * ⭐ Chemistry is DERIVED here rather than passed in, which is what keeps it off the wire.
   * Both XIs are already in hand, so the score cannot drift between the live match and a
   * replay — there is no second copy to disagree. Fitted at `CHEM_EFFECT` by win rate; see
   * `domain/chemistry-modifier.ts`.
   */
  const chemistryMods =
    rival.chemistry === true
      ? [
          chemistryModifier({
            home: chemistry(xi as readonly Linkable[], formation),
            away: chemistry(away.players as readonly Linkable[], away.formation),
          }),
        ]
      : [];

  const stream = createStream(
    runMatch(
      opponentSetup({
        home,
        homeStyle: matchup.homeStyle,
        opponent: matchup.opponent,
        season: 0,
        seed,
        targetGoalsPerMatch: DEFAULT_RATE,
        modifiers: chemistryMods,
      }),
    ),
    "home",
  );

  return { home, away, seed, stream };
}
