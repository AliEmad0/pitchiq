import { parseCardId, type PlayerSeasonId } from "./card-id";
import { readTokens } from "./decision-tokens";

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
 * `v2.<seed36>.<formationSlug>.<cards>.<tokens>.<fingerprint36>.<rival>`
 *
 * where `cards` is 11 `playerId@season` pairs base-36 encoded and `.`-free. Chosen over
 * JSON+base64 because a shared link is read aloud, pasted into chats that linkify, and
 * truncated by clients — a 3-4× shorter code survives that better, and every field stays
 * greppable in a bug report.
 *
 * ⛔ The formation travels as a SLUG OF ITS NAME, not as `formationKey`. A key is
 * `${name}/${slots.length}` — "4-3-2-1 Christmas Tree/11" — which no URL-safe validation
 * can accept, and an index into `FORMATIONS` is forbidden because that array's order is
 * presentation only. See `formationSlug`/`formationBySlug`.
 *
 * ⛔ The payload carries the coach's DECISIONS, because a match is
 * `(setup, seed, decisions[])` since TASK-1830. Without them a code reproduces only a
 * match nobody coached — and the fingerprint would mismatch on every real one. They ride
 * as a token stream; see `decision-tokens.ts`.
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

/**
 * ⛔ Bumped to `v2` for the RIVAL (owner, 2026-08-19).
 *
 * A `v1` code says nothing about which club the opponent came from or how it drafted, so
 * replaying one now would build a plausible but DIFFERENT match — the precise failure the
 * version prefix exists to prevent. `decodeMatch` refuses them; there is no upgrade path,
 * deliberately, because there is no honest default for a field the sender never carried.
 */
export const SHARE_VERSION = "v2";

/** How a rival's policy travels — one character, so the segment stays short. */
const POLICY_TOKEN = { random: "r", best: "b", strong: "s" } as const;
const POLICY_OF: Record<string, RivalRef["policy"]> = { r: "random", b: "best", s: "strong" };
/** No club was chosen: the opponent comes out of the coach's own pool, as it always did. */
const NO_RIVAL = "-";

/** Which club — or nation (TASK-1842) — the coach chose to face, and how it drafted. */
export type RivalRef = {
  /** A club's numeric id, or a nation's flag-icons code. */
  teamId: number | string;
  policy: "random" | "best" | "strong";
};

/**
 * A nation rival's wire form is `~<code><policy>` (TASK-1842), e.g. `~gb-engb`.
 *
 * ⚠️ The `~` marker is what keeps the namespaces apart: a bare code like "eg" is a VALID
 * base-36 number, so without the marker a nation code would decode as some club's id and
 * replay against the wrong opponent — silently. An old client that has never heard of `~`
 * rejects the whole code (unb36 returns null), which is the graceful failure: refused,
 * never misread. `v2` needs no bump — every code already in the wild is untouched.
 */
const NATION_RIVAL = "~";
const NATION_CODE_RE = /^[a-z]{2}(?:-[a-z]{2,3})?$/;

/** Everything needed to reproduce a match, as it travels in a URL. */
export type ShareableMatch = {
  cardIds: PlayerSeasonId[];
  /**
   * ⛔ A slug of the formation NAME — never `formationKey`, which carries a slash, spaces
   * and capitals, and never an index into `FORMATIONS`.
   */
  formationSlug: string;
  seed: number;
  /** The coach's decisions. Empty means he took none. See `decision-tokens.ts`. */
  tokens: string;
  /** The sender's event fingerprint, for drift detection only. */
  fingerprint: number;
  /**
   * The club the coach chose to face. `null` = his own pool, the shipped behaviour.
   *
   * ⛔ Part of the match's IDENTITY, not a label. The receiver rebuilds the opponent by
   * re-running the same draft over the same cards, so a code without this replays against
   * a different eleven and the fingerprint check reports it as drift the sender caused.
   */
  rival: RivalRef | null;
};

const SQUAD_SIZE = 11;
/**
 * The XI plus a drafted bench (TASK-1810 Budget Cap).
 *
 * ⚠️ The card block is `_`-delimited, so the WIRE format was always variable-length — only
 * these two checks pinned it to eleven. The range stays BOUNDED rather than becoming "any
 * length": a code is untrusted input, and an unbounded list is a way to make a receiver do
 * arbitrary work. Eleven still decodes exactly as it always did, so every code already in
 * the wild is unaffected.
 */
const MAX_SQUAD_SIZE = 16;
/** Slugs are lowercase, digits and dashes. "4-3-2-1-christmas-tree" is 22 characters. */
const SLUG_RE = /^[a-z0-9-]{2,32}$/;

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
  if (match.cardIds.length < SQUAD_SIZE || match.cardIds.length > MAX_SQUAD_SIZE) {
    throw new Error(
      `share-code: expected ${SQUAD_SIZE}-${MAX_SQUAD_SIZE} cards, got ${match.cardIds.length}`,
    );
  }
  if (!SLUG_RE.test(match.formationSlug)) {
    throw new Error(`share-code: invalid formation slug ${match.formationSlug}`);
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
    match.formationSlug,
    cards,
    match.tokens,
    b36(match.fingerprint >>> 0),
    match.rival == null
      ? NO_RIVAL
      : typeof match.rival.teamId === "string"
        ? `${NATION_RIVAL}${match.rival.teamId}${POLICY_TOKEN[match.rival.policy]}`
        : `${b36(match.rival.teamId)}${POLICY_TOKEN[match.rival.policy]}`,
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
  if (parts.length !== 7) return null;

  const [version, seedRaw, formationSlug, cardsRaw, tokens, fpRaw, rivalRaw] = parts;
  if (version !== SHARE_VERSION) return null;
  if (!SLUG_RE.test(formationSlug)) return null;
  // Checked HERE so a malformed stream fails as a bad code, before any match is
  // assembled. Whether each token FITS the decision it answers can only be known during
  // the replay, and is reported there.
  if (readTokens(tokens) === null) return null;

  const seed = unb36(seedRaw);
  const fingerprint = unb36(fpRaw);
  if (seed === null || fingerprint === null) return null;

  let rival: RivalRef | null = null;
  if (rivalRaw !== NO_RIVAL) {
    const policy = POLICY_OF[rivalRaw.slice(-1)];
    if (policy === undefined) return null;
    if (rivalRaw.startsWith(NATION_RIVAL)) {
      // A nation rival (TASK-1842). The code's SHAPE is validated here; whether the nation
      // exists is the receiving page's question, like a club id's membership always was.
      const code = rivalRaw.slice(1, -1);
      if (!NATION_CODE_RE.test(code)) return null;
      rival = { teamId: code, policy };
    } else {
      const teamId = unb36(rivalRaw.slice(0, -1));
      // A team id is a positive integer from a closed set the receiving page validates; an
      // unknown policy character is a tampered code and gets no benefit of the doubt.
      if (teamId === null || teamId <= 0) return null;
      rival = { teamId, policy };
    }
  }

  const chunks = cardsRaw.split("_");
  if (chunks.length < SQUAD_SIZE || chunks.length > MAX_SQUAD_SIZE) return null;

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

  return { cardIds, formationSlug, seed, tokens, fingerprint, rival };
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
