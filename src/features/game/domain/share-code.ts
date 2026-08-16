import { parseCardId, type PlayerSeasonId } from "./card-id";

/**
 * TASK-1812 — a match as a shareable, replayable URL code.
 *
 * A match is a pure function of `(setup, seed, decisions[])` (TASK-1830), so the tuple IS
 * the match: anyone who decodes this code and replays it sees exactly the same 90 minutes.
 * That is why sharing needs no backend and no stored result.
 *
 * The payload is deliberately the same shape B2 already persists as `SavedMatch`, so
 * resume-by-replay and share-by-link are one code path rather than two that can disagree.
 *
 * ## Format
 *
 * `v1.<seed36>.<formationKey>.<cards>.<fingerprint36>`
 *
 * where `cards` is 11 `playerId@season` pairs base-36 encoded and `.`-free. Chosen over
 * JSON+base64 because a shared link is read aloud, pasted into chats that linkify, and
 * truncated by clients — a 3-4× shorter code survives that better, and every field stays
 * greppable in a bug report.
 *
 * ## Three rules this module exists to enforce
 *
 * 1. ⛔ **A code is untrusted input.** It arrives from a URL a stranger can edit. Every
 *    field is validated on decode and a malformed code returns `null` — it never throws
 *    into a render, and never yields a partially-populated setup.
 * 2. ⛔ **The version prefix is not decoration.** Without it, a future format change makes
 *    every old link decode into a *different but plausible* match, which is worse than
 *    failing. An unknown version returns `null`.
 * 3. ⚠️ **The fingerprint is carried, not trusted.** It is the sender's `hashEvents` over
 *    their replay. The receiver replays independently and compares: equal means they saw
 *    the same match, different means the card pool or engine moved between the two
 *    builds. Either way the receiver shows their OWN replay — the fingerprint decides
 *    whether to warn, never what to render.
 */

export const SHARE_VERSION = "v1";

/** Everything needed to reproduce a match. Mirrors `SavedMatch` minus its bookkeeping. */
export type ShareableMatch = {
  cardIds: PlayerSeasonId[];
  /** The formation KEY, never an index — reordering `FORMATIONS` must not remap a code. */
  formationKey: string;
  seed: number;
  /** The sender's event fingerprint, for drift detection only. */
  fingerprint: number;
};

const SQUAD_SIZE = 11;
/** Formation keys are authored slugs; anything else is a tampered code. */
const KEY_RE = /^[a-z0-9-]{2,16}$/;

const b36 = (n: number) => Math.trunc(n).toString(36);
const unb36 = (s: string): number | null => {
  if (!/^[0-9a-z]+$/.test(s)) return null;
  const n = parseInt(s, 36);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};

/**
 * Encode a match into a URL-safe code.
 *
 * Throws only on programmer error (a malformed squad), never on user input — callers
 * build this from their own live match, not from anything external.
 */
export function encodeMatch(match: ShareableMatch): string {
  if (match.cardIds.length !== SQUAD_SIZE) {
    throw new Error(`share-code: expected ${SQUAD_SIZE} cards, got ${match.cardIds.length}`);
  }
  if (!KEY_RE.test(match.formationKey)) {
    throw new Error(`share-code: invalid formation key ${match.formationKey}`);
  }
  const cards = match.cardIds
    .map((id) => {
      const { playerId, season } = parseCardId(id);
      return `${b36(playerId)}-${b36(season)}`;
    })
    .join("_");
  return [
    SHARE_VERSION,
    b36(match.seed),
    match.formationKey,
    cards,
    b36(match.fingerprint >>> 0),
  ].join(".");
}

/**
 * Decode a code from a URL. Returns `null` for ANY problem — wrong version, wrong field
 * count, a non-integer, the wrong squad size, a bad formation key.
 *
 * Never throws: this runs during render on a value a stranger controls.
 */
export function decodeMatch(code: string | null | undefined): ShareableMatch | null {
  if (typeof code !== "string" || code.length === 0 || code.length > 400) return null;
  const parts = code.split(".");
  if (parts.length !== 5) return null;

  const [version, seedRaw, formationKey, cardsRaw, fpRaw] = parts;
  if (version !== SHARE_VERSION) return null;
  if (!KEY_RE.test(formationKey)) return null;

  const seed = unb36(seedRaw);
  const fingerprint = unb36(fpRaw);
  if (seed === null || fingerprint === null) return null;

  const chunks = cardsRaw.split("_");
  if (chunks.length !== SQUAD_SIZE) return null;

  const cardIds: PlayerSeasonId[] = [];
  for (const chunk of chunks) {
    const [p, s] = chunk.split("-");
    const playerId = unb36(p ?? "");
    const season = unb36(s ?? "");
    // A season outside the archive means a tampered or corrupted code.
    if (playerId === null || season === null || playerId <= 0 || season < 1992 || season > 2100) {
      return null;
    }
    cardIds.push(`${playerId}@${season}`);
  }

  return { cardIds, formationKey, seed, fingerprint };
}

/**
 * Did the receiver's replay produce the sender's match?
 *
 * `false` means the two builds disagree — a card left the pool, or the engine's event
 * stream changed. The caller shows its own replay either way and warns; it must NOT try
 * to reconstruct the sender's version, which is unreachable.
 */
export function fingerprintMatches(shared: ShareableMatch, replayed: number): boolean {
  return shared.fingerprint >>> 0 === replayed >>> 0;
}
