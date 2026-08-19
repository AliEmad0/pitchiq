import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { encodeTokens, readTokens } from "@/features/game/domain/decision-tokens";
import {
  formationBySlug,
  formationKey,
  formationNameFromKey,
  formationSlug,
} from "@/features/game/domain/formation";
import type { DecisionAnswer } from "@/features/game/domain/match-decisions";
import { DEFAULT_SHARE_PATH } from "@/features/game/domain/summary-card";
import { encodeMatch, type RivalRef, type ShareableMatch } from "@/features/game/domain/share-code";
import { replayWith, tokenSource, type ReplayedMatch } from "./match-replay";
import type { RivalSetup, SessionNames } from "./match-session";

/**
 * TASK-1812 — turning a finished match into a link, and a link back into a match.
 *
 * Lives in `view/` rather than `domain/` because it is about presenting a match to someone
 * else: it knows about locales and routes, which the engine neither knows nor should.
 */

/**
 * Build the code for a match the coach has just finished.
 *
 * Throws only on programmer error, via `encodeMatch`/`encodeTokens` — the inputs come from
 * the caller's own live match, never from anything external.
 */
export function buildShareCode(args: {
  cardIds: readonly PlayerSeasonId[];
  /** The STORED key; the slug is derived from its name half. */
  formationKey: string;
  seed: number;
  answers: readonly DecisionAnswer[];
  fingerprint: number;
  /** The club he chose to face. Absent = his own pool. See `ShareableMatch.rival`. */
  rival?: RivalRef | null;
}): string {
  return encodeMatch({
    cardIds: [...args.cardIds] as PlayerSeasonId[],
    formationSlug: formationSlug(formationNameFromKey(args.formationKey)),
    seed: args.seed,
    tokens: encodeTokens(args.answers),
    fingerprint: args.fingerprint,
    rival: args.rival ?? null,
  });
}

/**
 * Replay a decoded code.
 *
 * ⚠️ Returns the RECEIVER's replay, always. `drifted` says the sender saw something else —
 * it never means "show the sender's version", which is unreachable by construction: the
 * only record of their match is the tuple we just re-ran.
 *
 * Null means the code is unplayable here — an unknown formation, a card that has left the
 * pool, or a token that does not fit the decision it was meant to answer.
 */
export function replayShared(
  pool: PoolCard[],
  shared: ShareableMatch,
  names: SessionNames,
  rival?: RivalSetup,
): ReplayedMatch | null {
  const formation = formationBySlug(shared.formationSlug);
  if (formation == null) return null;
  const reader = readTokens(shared.tokens);
  if (reader == null) return null;

  return replayWith(
    pool,
    {
      cardIds: shared.cardIds,
      formationKey: formationKey(formation),
      seed: shared.seed,
    },
    tokenSource(reader),
    names,
    // ⚠️ `keep`, and no expected event count — see the drift table in the design doc.
    { onDrift: "keep", expectedFingerprint: shared.fingerprint },
    rival,
  );
}

/**
 * The share URL for a match — the route it was PLAYED on, plus its code.
 *
 * ⛔ `path` is not cosmetic (owner-reported, 2026-08-19). A share code carries card ids, and
 * a card only resolves against the pool the receiving route ships. Legacy's pools are
 * per-club, so a Legacy code opened at `/game/draft` finds none of its cards, `replayShared`
 * returns null, and the visitor lands on an ordinary draft hub with no sign anything failed.
 * Every "Copy link" on a Legacy match was doing exactly that.
 *
 * `/game/draft` remains the default: it is the canonical route since TASK-1832, and
 * `/game/play` permanently redirects to it with the query forwarded, so an older
 * `/game/play?m=…` link still works.
 */
export function shareUrl(code: string, locale: string, path: string = DEFAULT_SHARE_PATH): string {
  const prefix = locale === "en" ? "" : `/${locale}`;
  return `${prefix}${path}?m=${code}`;
}
