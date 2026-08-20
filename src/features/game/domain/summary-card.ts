import { displayName } from "./display-name";
import type { MatchEvent } from "./match-types";
import type { GameTeam } from "./team";

/**
 * TASK-1812 — the data behind the shareable match-summary card.
 *
 * Split from the drawing so the *content* is unit-testable: jsdom has no 2D canvas
 * context, so anything computed inside a paint function is untestable by construction.
 * This module decides WHAT the card says; the component only paints it.
 */

export type SummaryScorer = {
  minute: number;
  name: string;
  side: "home" | "away";
  /** Credited to this player but counting for the other side. */
  own: boolean;
  penalty: boolean;
};

export type SummaryCardData = {
  home: string;
  away: string;
  score: { home: number; away: number };
  scorers: SummaryScorer[];
  /** The shape's display NAME ("4-4-2 Flat"), not a key and not a slug. */
  formationName: string;
  seed: number;
  /**
   * The share code for this match.
   *
   * ⚠️ The shipped card prints a short URL rather than this, because a real code runs to
   * ~150 characters and cannot be set legibly. So a screenshot is NOT replayable — the
   * copied LINK is the replayable artefact. Kept here because the data layer should not
   * assume which of the two a given card design prints.
   */
  code: string;
  /**
   * The route the match was played on, printed on the card.
   *
   * ⛔ Owner-reported, 2026-08-19: the card and the Copy link button both hard-coded
   * `/game/draft`. A Legacy match's cards belong to ONE club's pool, which `/game/draft`
   * does not carry — so following the link resolved no cards, `replayShared` returned null,
   * and the visitor silently landed on an ordinary draft hub instead of the shared match.
   */
  path: string;
  /**
   * The two clubs, for their crests (owner, 2026-08-20). Null when unknown.
   *
   * ⚠️ Ids, not URLs. The card is painted in the browser and resolves the path itself, so
   * the data layer never has to know where crests live — and a test can assert the ids
   * without touching a canvas.
   */
  homeTeamId: number | null;
  awayTeamId: number | null;
};

/**
 * The scorers a final scoreline should list.
 *
 * ⚠️ **`disallowedAt` is the trap.** A chalked-off goal deliberately STAYS in the event
 * stream — that is where the VAR drama lives, and the scoreboard counts it until the
 * review lands. A *final* summary must filter it out, exactly as `match-types.ts`
 * documents: "a final scoreline filters on `disallowedAt == null`". Listing it would
 * print a scorer for a goal that never stood.
 *
 * ⛔ **An own goal carries its scorer in `ownGoalBy`, NOT in `playerId`.** `simulate`
 * calls `scoreGoal(state, opp, side, m, undefined, "own-goal", …, { ownGoalBy })` — the
 * `playerId` argument is literally `undefined` — so reading `playerId` renders every own
 * goal as "—". This module previously did exactly that, and its own docstring claimed the
 * opposite; the synthetic fixture that hid it set a `playerId` no real own goal has.
 *
 * ⚠️ And `side` is the side the goal COUNTS FOR, not the side the scorer plays for: that
 * same call passes `opp` as the scoring side. So a caller may group by `side` directly —
 * an own goal already sits with the team that benefited, which is also how a television
 * scoreline reads it.
 */
export function scorersFrom(
  events: readonly MatchEvent[],
  nameOf: (playerId: number) => string,
): SummaryScorer[] {
  return events
    .filter((e) => e.kind === "goal" && e.disallowedAt == null)
    .map((e) => {
      const scorer = e.source === "own-goal" ? (e.ownGoalBy ?? e.playerId) : e.playerId;
      return {
        minute: e.minute,
        name: scorer == null ? "—" : nameOf(scorer),
        side: (e.side ?? "home") as "home" | "away",
        own: e.source === "own-goal",
        penalty: e.source === "penalty",
      };
    })
    .sort((a, b) => a.minute - b.minute);
}

/**
 * ⛔ THE CARD'S GEOMETRY LIVES HERE, not in the paint function (owner-reported, 2026-08-19).
 *
 * The shipped card started its scorer list at a fixed baseline, stepped a fixed 28px and
 * capped the list at six — and nobody ever checked those three numbers against each other.
 * A sixth scorer lands at `418 + 5×28 = 558`, **two pixels below** the footer's first
 * baseline at `H − 74 = 556`, so the last scorer printed straight through the shape-and-seed
 * line. The overflow "+N" was worse: `418 + 6×28 = 586`, exactly the URL's baseline.
 *
 * ⚠️ It could not be caught by any test that existed. A canvas paints in jsdom's void — the
 * whole point of this module is that WHAT the card says is testable — but nothing here knew
 * WHERE anything went, so a collision was invisible by construction. The layout is arithmetic
 * and belongs beside the rest of the card's decisions, where a test can assert the one
 * property that matters: the block never reaches the footer.
 */
/**
 * Where a shared match replays when the caller names no route.
 *
 * `/game/draft` is the canonical loop and the only route whose pool a code built there can
 * resolve against. Every OTHER pack must pass its own route — see `SummaryCardData.path`.
 */
export const DEFAULT_SHARE_PATH = "/game/draft";

export const CARD_W = 1200;
export const CARD_H = 630;
/** The first footer baseline (shape · seed). Nothing above it may descend past this. */
export const FOOTER_TOP = CARD_H - 74;
/** Beyond this the list stops reading as a scoreline and starts reading as a table. */
export const MAX_SCORERS = 6;

const SCORER_TOP = 418;
/** Clear air between the last scorer and the footer, so they read as separate blocks. */
const FOOTER_CLEARANCE = 24;
const MAX_STEP = 28;
const MAX_SIZE = 18;
const MIN_SIZE = 13;

export interface ScorerLayout {
  /** How many scorers are printed. */
  shown: number;
  /** How many are summarised as "+N" — zero means no overflow line. */
  overflow: number;
  /** Baseline of the first line. */
  first: number;
  /** Distance between baselines; shrinks so a long list still clears the footer. */
  step: number;
  /** Font size, tracking the step so the lines never touch. */
  size: number;
  /** Baseline of the LAST thing printed, overflow line included. */
  last: number;
}

/** Fit `total` scorers into the band between the divider and the footer. */
export function scorerLayout(total: number): ScorerLayout {
  const shown = Math.min(total, MAX_SCORERS);
  const overflow = total - shown;
  const rows = shown + (overflow > 0 ? 1 : 0);
  const bottom = FOOTER_TOP - FOOTER_CLEARANCE;
  const step = rows > 1 ? Math.min(MAX_STEP, (bottom - SCORER_TOP) / (rows - 1)) : MAX_STEP;
  // ⚠️ The size follows the step. Holding 18px while the step falls to 19 would stack the
  // lines against each other — the same defect one block lower down.
  const size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(step * 0.66)));
  return {
    shown,
    overflow,
    first: SCORER_TOP,
    step,
    size,
    last: SCORER_TOP + Math.max(0, rows - 1) * step,
  };
}

/** "23' Henry (pen)" · "67' Carragher (og)" — the line printed under the scoreline. */
export function scorerLine(s: SummaryScorer): string {
  const tag = s.own ? " (og)" : s.penalty ? " (pen)" : "";
  return `${s.minute}' ${s.name}${tag}`;
}

/**
 * A filename that survives every OS and still says what it is.
 *
 * ⚠️ Windows rejects `: * ? " < > |` and trailing dots, and a club like "Nott'm Forest"
 * carries an apostrophe that breaks naive shell quoting. Everything outside `[a-z0-9]`
 * collapses to a dash, and an empty result falls back rather than producing `pitchiq--0-0-.png`.
 */
export function summaryFilename(summary: SummaryCardData): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "team";
  return `pitchiq-${slug(summary.home)}-${summary.score.home}-${summary.score.away}-${slug(summary.away)}.png`;
}

/**
 * Assemble what the card says from a finished match.
 *
 * ⚠️ Names are resolved across BOTH squads and BOTH benches. A scorer can be a substitute,
 * and an own goal is credited to a defender on the other side — looking only at the home
 * XI would render a good share of real matches with "#1042" where a name belongs.
 */
export function summaryFrom(args: {
  home: GameTeam;
  away: GameTeam;
  events: readonly MatchEvent[];
  score: { home: number; away: number };
  formationName: string;
  seed: number;
  code: string;
  /** The route that can replay this match. See `SummaryCardData.path`. */
  path?: string;
  /** The two clubs, for their crests. See `SummaryCardData.homeTeamId`. */
  homeTeamId?: number | null;
  awayTeamId?: number | null;
}): SummaryCardData {
  const names = new Map(
    [
      ...args.home.players,
      ...(args.home.bench ?? []),
      ...args.away.players,
      ...(args.away.bench ?? []),
    ].map((p) => [p.playerId, displayName(p.name)] as const),
  );
  return {
    home: args.home.name,
    away: args.away.name,
    score: args.score,
    scorers: scorersFrom(args.events, (id) => names.get(id) ?? `#${id}`),
    formationName: args.formationName,
    seed: args.seed,
    code: args.code,
    path: args.path ?? DEFAULT_SHARE_PATH,
    homeTeamId: args.homeTeamId ?? null,
    awayTeamId: args.awayTeamId ?? null,
  };
}
